// Revarredura diária da Guru -> raw.guru_transaction.
// A carga "incremental" do guru-sync só revarre os últimos 10 dias por ordered_at, então
// reembolsos, chargebacks e cancelamentos de pedidos mais antigos não chegavam.
// Esta função revarre os últimos N dias (padrão 90) em janelas de 7 dias, retomando de onde
// parou a cada chamada (estado em raw.sync_estado, escopo 'revarredura'). Uma volta por dia.
// Mesma gravação do guru-sync: dedup por (source_key, payload_hash); versão nova vira snapshot.
// Autenticação: header x-guru-sync-key = vault 'guru_sync_key' (verify_jwt=false).

import postgres from "npm:postgres@3.4.4";

const GURU = "https://digitalmanager.guru/api/v2";
const FONTE = "guru";
const ESCOPO = "revarredura";
const ORCAMENTO_MS = 110_000;
const JANELA_DIAS = 7;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gf(path: string, token: string): Promise<any> {
  let d = 1200;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(GURU + path, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (r.ok) { await sleep(250); return await r.json(); }
    const b = await r.text();
    if ((r.status === 429 || r.status >= 500) && i < 5) { await sleep(d); d = Math.min(d * 2, 12000); continue; }
    throw new Error(`Guru HTTP ${r.status}: ${b.slice(0, 300)}`);
  }
  throw new Error("Guru: falhou apos as tentativas");
}

const rowsOf = (p: any) => Array.isArray(p) ? p : Array.isArray(p?.data) ? p.data : [];
const nextCur = (p: any) => p?.next_cursor ?? p?.pagination?.next_cursor ?? null;

function iso(v: unknown): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  const d = isFinite(n) && n > 100000 ? new Date(n * 1000) : new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function sha256(o: unknown): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(o)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const addDias = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const hojeBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const menor = (a: string, b: string) => (a < b ? a : b);

async function gravar(sql: any, lista: any[], cargaId: number) {
  if (!lista.length) return 0;
  const linhas = [];
  for (const t of lista) {
    const id = t?.id ?? t?.uuid ?? null;
    const hash = await sha256(t);
    linhas.push({
      source_key: id ? String(id) : `hash:${hash}`,
      guru_transaction_id: id ? String(id) : null,
      payload: t,
      payload_hash: hash,
      source_updated_at: iso(t?.dates?.updated_at ?? t?.dates?.confirmed_at ?? t?.dates?.ordered_at),
      carga_id: cargaId,
    });
  }
  const r = await sql`
    insert into raw.guru_transaction ${sql(linhas, "source_key", "guru_transaction_id", "payload", "payload_hash", "source_updated_at", "carga_id")}
    on conflict (source_key, payload_hash) do nothing`;
  return r.count ?? 0;
}

Deno.serve(async (req) => {
  const inicio = Date.now();
  const fim = inicio + ORCAMENTO_MS;
  const token = Deno.env.get("GURU_API_TOKEN");
  if (!token) return json({ ok: false, erro: "GURU_API_TOKEN nao configurado" }, 500);
  const url = new URL(req.url);
  const dias = Number(url.searchParams.get("dias") ?? "90");

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
  let cargaId: number | null = null;
  try {
    const dado = req.headers.get("x-guru-sync-key") ?? "";
    const [k] = await sql`select decrypted_secret as s from vault.decrypted_secrets where name = 'guru_sync_key'`;
    const esp = k?.s ?? "";
    if (!(esp.length > 0 && dado.length === esp.length && dado === esp)) {
      return json({ ok: false, erro: "exige x-guru-sync-key" }, 403);
    }

    const hoje = hojeBR();
    // O incremental já cobre os últimos 10 dias; a revarredura vai até ali.
    const limite = addDias(hoje, -10);
    const inicioVolta = { ciclo: hoje, janela: addDias(hoje, -dias), cursor: null as string | null };

    await sql`insert into raw.sync_estado (fonte, entidade, escopo, modo, status, cursor_after)
      values (${FONTE}, 'transaction', ${ESCOPO}, 'revarredura', 'em_andamento', ${JSON.stringify(inicioVolta)})
      on conflict (fonte, entidade, escopo) do nothing`;
    const [st] = await sql`select * from raw.sync_estado where fonte = ${FONTE} and entidade = 'transaction' and escopo = ${ESCOPO}`;
    let pos = JSON.parse(st.cursor_after ?? "{}");
    if (pos.ciclo !== hoje) {
      pos = inicioVolta; // nova volta diária
    } else if (st.status === "concluido") {
      return json({ ok: true, concluido: true, mensagem: "volta de hoje já terminou" });
    }
    await sql`update raw.sync_estado set status = 'em_andamento' where fonte = ${FONTE} and entidade = 'transaction' and escopo = ${ESCOPO}`;

    const [lg] = await sql`insert into raw.log_ingestao (fonte, entidade, tipo_carga, janela_inicio)
      values (${FONTE}, 'transaction', 'revarredura', ${pos.janela}) returning id`;
    cargaId = lg.id;

    let lidas = 0, novas = 0;
    while (pos.janela <= limite && Date.now() < fim) {
      const ate = menor(addDias(pos.janela, JANELA_DIAS - 1), limite);
      let cur = pos.cursor, lidasJanela = 0;
      do {
        const qs = new URLSearchParams({ limit: "100", ordered_at_ini: pos.janela, ordered_at_end: ate });
        if (cur) qs.set("cursor", cur);
        const pay = await gf(`/transactions?${qs}`, token);
        const rows = rowsOf(pay);
        lidas += rows.length; lidasJanela += rows.length;
        novas += await gravar(sql, rows, cargaId!);
        cur = nextCur(pay);
      } while (cur && Date.now() < fim);
      pos = cur ? { ...pos, cursor: cur } : { ...pos, janela: addDias(ate, 1), cursor: null };
      await sql`update raw.sync_estado set cursor_after = ${JSON.stringify(pos)}, atualizado_em = now(), ultimo_erro = null,
        registros_processados = registros_processados + ${lidasJanela}
        where fonte = ${FONTE} and entidade = 'transaction' and escopo = ${ESCOPO}`;
    }
    const concluido = pos.janela > limite;
    if (concluido) {
      await sql`update raw.sync_estado set status = 'concluido', atualizado_em = now()
        where fonte = ${FONTE} and entidade = 'transaction' and escopo = ${ESCOPO}`;
    }
    await sql`update raw.log_ingestao set finalizado_em = now(), status = ${concluido ? "sucesso" : "parcial"},
      linhas_lidas = ${lidas}, janela_fim = ${addDias(pos.janela, -1)} where id = ${cargaId}`;
    return json({ ok: true, concluido, lidas, versoes_novas: novas, proxima_janela: pos.janela });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (cargaId != null) {
      try {
        await sql`update raw.log_ingestao set finalizado_em = now(), status = 'erro', mensagem_erro = ${msg.slice(0, 1000)} where id = ${cargaId}`;
        await sql`update raw.sync_estado set ultimo_erro = ${msg.slice(0, 1000)}, atualizado_em = now()
          where fonte = ${FONTE} and entidade = 'transaction' and escopo = ${ESCOPO}`;
      } catch { /* o erro original é o que importa */ }
    }
    return json({ ok: false, erro: msg }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
