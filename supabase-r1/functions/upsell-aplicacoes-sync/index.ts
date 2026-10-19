// Upsell: aplicações do Clube R1 = negócios criados no funil [OFICIAL] Clube R1 (pedido da Joyce, 19/10).
// Traz todos os negócios criados desde 01/01/2026 com a etapa atual e o valor, e grava em rgv.clube_aplicacao.
// A janela de cada ciclo (datas do Método RGV) é aplicada na leitura (public.upsell_aplicacoes). Nada é apagado.
// Autenticação: header x-guru-sync-key = vault 'guru_sync_key'. Precisa do secret HUBSPOT_TOKEN.
import postgres from "npm:postgres@3.4.4";

const HS = "https://api.hubapi.com";
const PIPELINE = "135241872";
const DESDE_MS = String(Date.parse("2026-01-01T00:00:00-03:00"));
const GANHO = new Set(["232902155"]);
const PERDIDA = new Set(["232902156"]);
const CANCELADA = new Set(["268514208", "1141304948"]);
const CANCEL_SOLICITADO = new Set(["1141258527"]);
const APROVACAO = new Set(["951844676", "232902152", "232902153", "938184202"]);
const categoria = (e: string) => GANHO.has(e) ? "ganho" : PERDIDA.has(e) ? "perdida" : CANCELADA.has(e) ? "cancelada" : CANCEL_SOLICITADO.has(e) ? "cancelamento_solicitado" : APROVACAO.has(e) ? "aprovacao" : e === "1100514897" ? "finalizando" : "negociacao";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dataSP = (iso: string | null) => iso ? new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10) : null;

async function hs(token: string, path: string, body?: unknown, t = 0): Promise<any> {
  const r = await fetch(`${HS}${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 429 && t < 4) { await sleep(2000 * (t + 1)); return hs(token, path, body, t + 1); }
  if (!r.ok) throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

Deno.serve(async (req) => {
  const token = Deno.env.get("HUBSPOT_TOKEN");
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
  try {
    const dado = req.headers.get("x-guru-sync-key") ?? "";
    const [k] = await sql`select decrypted_secret as s from vault.decrypted_secrets where name = 'guru_sync_key'`;
    const esp = k?.s ?? "";
    if (!(esp.length > 0 && dado.length === esp.length && dado === esp)) return json({ ok: false, erro: "exige x-guru-sync-key" }, 403);
    if (!token) return json({ ok: false, erro: "HUBSPOT_TOKEN nao configurado" }, 500);

    const pl = await hs(token, `/crm/v3/pipelines/deals/${PIPELINE}`);
    const nomes = new Map<string, string>((pl.stages ?? []).map((e: any) => [e.id, e.label]));
    const deals: any[] = [];
    let after: string | undefined;
    for (let pg = 0; pg < 40; pg++) {
      const r = await hs(token, "/crm/v3/objects/deals/search", {
        filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: PIPELINE }, { propertyName: "createdate", operator: "GTE", value: DESDE_MS }] }],
        sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
        properties: ["dealname", "amount", "createdate", "dealstage", "closedate"], limit: 100, ...(after ? { after } : {}),
      });
      deals.push(...(r.results ?? []));
      after = r.paging?.next?.after;
      if (!after) break;
      await sleep(150);
    }
    if (!deals.length) return json({ ok: false, erro: "HubSpot devolveu 0 negócios; nada foi alterado" }, 500);
    const linhas = deals.map((d) => {
      const p = d.properties; const e = String(p.dealstage ?? "");
      return {
        deal_id: String(d.id), nome: p.dealname ?? null, pipeline: PIPELINE, etapa_id: e, etapa: nomes.get(e) ?? e, categoria: categoria(e),
        valor: p.amount != null && p.amount !== "" ? Number(p.amount) : null, criado_em: p.createdate, data_criacao: dataSP(p.createdate),
        fechado_em: GANHO.has(e) || PERDIDA.has(e) || CANCELADA.has(e) ? dataSP(p.closedate) : null,
      };
    });
    for (let i = 0; i < linhas.length; i += 100) {
      const lote = linhas.slice(i, i + 100);
      await sql`insert into rgv.clube_aplicacao ${sql(lote, "deal_id", "nome", "pipeline", "etapa_id", "etapa", "categoria", "valor", "criado_em", "data_criacao", "fechado_em")}
        on conflict (deal_id) do update set nome = excluded.nome, etapa_id = excluded.etapa_id, etapa = excluded.etapa, categoria = excluded.categoria,
          valor = excluded.valor, fechado_em = excluded.fechado_em, sincronizado_em = now()`;
    }
    const por: Record<string, number> = {};
    for (const l of linhas) por[l.categoria] = (por[l.categoria] ?? 0) + 1;
    return json({ ok: true, lidos: deals.length, por_categoria: por });
  } catch (e) {
    return json({ ok: false, erro: String((e as Error)?.message ?? e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
