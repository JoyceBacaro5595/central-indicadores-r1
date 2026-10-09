// rgv-arquivar: move base crua histórica do Postgres para o Storage (bucket "arquivo"),
// em arquivos .ndjson.gz verificados por sha256. Só remove do banco o que já foi
// gravado e conferido no Storage; cada arquivo fica registrado em rgv.arquivo_manifesto.
//
// Operações (body JSON, POST, header x-rgv-sync-key):
//   { op: "raw_record_lote", batch_id }     arquiva e remove um lote inteiro de rgv.raw_record
//   { op: "raw_record_duplicados" }          mantém só a captura mais recente por record_id
//   { op: "ad_daily_actions", ate }          arquiva o campo actions de rgv.ad_daily com day < ate e zera o campo
//   { op: "mensal" }                         duplicados + actions dos meses fechados (rotina)
// Cada chamada trabalha até ~70 s e devolve status "partial" se ainda houver linhas.
import postgres from "npm:postgres@3.4.4";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BUCKET = "arquivo";
const CHUNK = 2000;
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { "Content-Type": "application/json" } });
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const stamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

Deno.serve(async (req) => {
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });
  const storage = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }).storage.from(BUCKET);
  const begin = Date.now(), deadline = begin + 70000;
  const done: { caminho: string; linhas: number; bytes: number }[] = [];
  let stage = "auth";
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const supplied = req.headers.get("x-rgv-sync-key") || "";
    const [key] = await sql`select decrypted_secret as s from vault.decrypted_secrets where name='rgv_sync_key'`;
    if (!key?.s || supplied.length !== key.s.length || supplied !== key.s) return json({ error: "unauthorized" }, 403);
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || "");

    // Grava um pedaço no Storage, confere o hash baixando de volta, registra no manifesto
    // e aplica a remoção no banco na mesma transação. Devolve false se não havia linhas.
    const archive = async (tabela: string, chave: string, rows: unknown[], apply: (tx: any) => Promise<void>) => {
      if (!rows.length) return false;
      stage = "gzip";
      const text = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
      const bytes = await gzip(text);
      const sha = hex(await crypto.subtle.digest("SHA-256", bytes));
      const caminho = `${tabela}/${chave}/${stamp()}-${crypto.randomUUID().slice(0, 8)}.ndjson.gz`;
      stage = "upload";
      const up = await storage.upload(caminho, bytes, { contentType: "application/gzip", upsert: false });
      if (up.error) throw new Error("storage_upload_failed:" + up.error.message);
      stage = "verify";
      const down = await storage.download(caminho);
      if (down.error || !down.data) throw new Error("storage_verify_download_failed");
      const back = hex(await crypto.subtle.digest("SHA-256", await down.data.arrayBuffer()));
      if (back !== sha) { await storage.remove([caminho]); throw new Error("storage_verify_hash_mismatch"); }
      stage = "apply";
      await sql.begin(async (tx: any) => {
        await tx`insert into rgv.arquivo_manifesto(tabela,chave,caminho,linhas,bytes,sha256,removido_do_banco) values (${tabela},${chave},${caminho},${rows.length},${bytes.length},${sha},true)`;
        await apply(tx);
      });
      done.push({ caminho, linhas: rows.length, bytes: bytes.length });
      return true;
    };

    const rawRecordLote = async (batchId: string) => {
      let last = "";
      while (Date.now() < deadline) {
        stage = "select";
        const rows = await sql`select batch_id, record_id, payload, source_modified_at, captured_at from rgv.raw_record where batch_id=${batchId}::uuid and record_id>${last} order by record_id limit ${CHUNK}`;
        const ids = rows.map((r: any) => r.record_id);
        const ok = await archive("rgv.raw_record", batchId, rows, async (tx) => { await tx`delete from rgv.raw_record where batch_id=${batchId}::uuid and record_id=any(${ids}::text[])`; });
        if (!ok) return "success";
        last = ids[ids.length - 1];
      }
      return "partial";
    };

    const rawRecordDuplicados = async () => {
      while (Date.now() < deadline) {
        stage = "select";
        const rows = await sql`select r.batch_id, r.record_id, r.payload, r.source_modified_at, r.captured_at from rgv.raw_record r where exists (select 1 from rgv.raw_record n where n.record_id=r.record_id and (n.captured_at>r.captured_at or (n.captured_at=r.captured_at and n.batch_id>r.batch_id))) order by r.record_id, r.batch_id limit ${CHUNK}`;
        const keys = rows.map((r: any) => ({ batch_id: r.batch_id, record_id: r.record_id }));
        const ok = await archive("rgv.raw_record", "duplicados", rows, async (tx) => { await tx`delete from rgv.raw_record r using jsonb_to_recordset(${tx.json(keys)}::jsonb) as k(batch_id uuid, record_id text) where r.batch_id=k.batch_id and r.record_id=k.record_id`; });
        if (!ok) return "success";
      }
      return "partial";
    };

    const adDailyActions = async (ate: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw new Error("ate_invalid");
      while (Date.now() < deadline) {
        stage = "select";
        const rows = await sql`select account_id, ad_id, day, actions, collected_at from rgv.ad_daily where day<${ate}::date and actions is not null order by day, ad_id limit ${CHUNK}`;
        const keys = rows.map((r: any) => ({ account_id: r.account_id, ad_id: r.ad_id, day: r.day }));
        const ok = await archive("rgv.ad_daily.actions", "ate-" + ate, rows, async (tx) => { await tx`update rgv.ad_daily d set actions=null from jsonb_to_recordset(${tx.json(keys)}::jsonb) as k(account_id text, ad_id text, day date) where d.account_id=k.account_id and d.ad_id=k.ad_id and d.day=k.day`; });
        if (!ok) return "success";
      }
      return "partial";
    };

    let status = "success";
    if (op === "raw_record_lote") { if (!body.batch_id) throw new Error("batch_id_required"); status = await rawRecordLote(String(body.batch_id)); }
    else if (op === "raw_record_duplicados") status = await rawRecordDuplicados();
    else if (op === "ad_daily_actions") status = await adDailyActions(String(body.ate || ""));
    else if (op === "mensal") {
      // Primeiro dia do mês corrente em São Paulo: tudo antes disso é mês fechado.
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const ate = hoje.slice(0, 7) + "-01";
      status = await rawRecordDuplicados();
      if (status === "success") status = await adDailyActions(ate);
    } else return json({ error: "op_invalid" }, 400);
    return json({ status, op, arquivos: done.length, linhas: done.reduce((a, d) => a + d.linhas, 0), bytes: done.reduce((a, d) => a + d.bytes, 0), ms: Date.now() - begin });
  } catch (e) {
    const msg = String((e as Error).message || "worker_failure").slice(0, 200);
    return json({ status: "error", stage, error: msg, arquivos: done.length, linhas: done.reduce((a, d) => a + d.linhas, 0) }, 500);
  } finally { await sql.end({ timeout: 3 }); }
});
