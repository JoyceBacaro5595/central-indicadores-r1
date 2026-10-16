// Carga diária do Meta Ads para a Central de Indicadores (item 16 do backlog).
// Lê insights por campanha, mês a mês, da conta META_ADS_CONTA (padrão: MÁQUINA DE VENDAS) e grava em
// raw.meta_ads_insight (nivel 'campaign', uma linha por campanha x mês, upsert). A visao marts.vw_meta_campanha_mes
// liga cada campanha ao evento pela cidade e data no nome.
// Token do Meta: usa o primeiro que o Meta aceitar entre (1) o cofre 'token_meta_ads', gravado pela tela Integrações e logs do app,
// (2) o segredo META_ADS_TOKEN e (3) o segredo META_TOKEN_API (o mesmo do Perpétuo RGV, que alcança a conta da Máquina de Vendas).
// Autenticação: header x-guru-sync-key = vault 'guru_sync_key' (verify_jwt=false). ?meses=N relê os últimos N meses (padrão 2).

import postgres from "npm:postgres@3.4.4";

const G = "https://graph.facebook.com/v21.0";
const CONTA_PADRAO = "171474008015977";
const CAMPOS = ["id", "name", "amount_spent", "impressions", "link_click", "omni_purchase", "reach"];

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graph(url: string, t = 0): Promise<any> {
  const r = await fetch(url);
  const b = await r.json();
  if (b.error) {
    const m = String(b.error.message || "");
    if ((/limit|too many|temporarily/i.test(m) || [4, 17, 32, 613].includes(b.error.code)) && t < 3) {
      await sleep(5000 * (t + 1)); return graph(url, t + 1);
    }
    throw new Error(`Meta: ${m}`);
  }
  return b;
}
async function paginar(url: string): Promise<any[]> {
  const out: any[] = [];
  let u: string | null = url, p = 0;
  while (u && p < 200) { const b = await graph(u); out.push(...(b.data ?? [])); u = b.paging?.next ?? null; p++; }
  return out;
}
const act = (a: any[], tipos: string[]) => {
  if (!Array.isArray(a)) return null;
  let v: number | null = null;
  for (const t of tipos) { const x = a.find((y: any) => y.action_type === t); if (x) v = Math.max(v ?? 0, Number(x.value) || 0); }
  return v;
};

/** Primeiro token com acesso à conta de anúncios (não só válido em /me); se nenhum for aceito, devolve o primeiro para o erro do Meta aparecer no log. */
async function escolherToken(sql: any, conta: string): Promise<string> {
  const cand: string[] = [];
  try {
    const [r] = await sql`select decrypted_secret as s from vault.decrypted_secrets where name = 'token_meta_ads'`;
    if (r?.s) cand.push(r.s);
  } catch { /* sem cofre: segue com os segredos da função */ }
  for (const n of ["META_ADS_TOKEN", "META_TOKEN_API"]) { const v = Deno.env.get(n); if (v && !cand.includes(v)) cand.push(v); }
  for (const t of cand) {
    try { const b = await (await fetch(`${G}/act_${conta}?fields=id&access_token=${encodeURIComponent(t)}`)).json(); if (!b.error) return t; } catch { /* tenta o próximo */ }
  }
  return cand[0] ?? "";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const conta = Deno.env.get("META_ADS_CONTA") ?? CONTA_PADRAO;
  const meses = Math.min(Math.max(Number(url.searchParams.get("meses") ?? "2"), 1), 12);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
  let logId: number | null = null;
  try {
    const dado = req.headers.get("x-guru-sync-key") ?? "";
    const [k] = await sql`select decrypted_secret as s from vault.decrypted_secrets where name = 'guru_sync_key'`;
    const esp = k?.s ?? "";
    if (!(esp.length > 0 && dado.length === esp.length && dado === esp)) return json({ ok: false, erro: "exige x-guru-sync-key" }, 403);
    const token = await escolherToken(sql, conta);
    if (!token) return json({ ok: false, erro: "Nenhum token do Meta configurado (cofre token_meta_ads ou segredos META_ADS_TOKEN / META_TOKEN_API)" }, 500);

    const [lg] = await sql`insert into raw.log_ingestao (fonte, entidade, tipo_carga) values ('meta', 'ads', 'mensal') returning id`;
    logId = lg.id;

    const hoje = new Date();
    const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - (meses - 1), 1));
    const since = ini.toISOString().slice(0, 10);
    const until = hoje.toISOString().slice(0, 10);
    const campos = "campaign_id,campaign_name,spend,impressions,inline_link_clicks,reach,actions";
    const linhas = await paginar(
      `${G}/act_${conta}/insights?fields=${campos}&level=campaign&time_increment=monthly` +
      `&time_range={"since":"${since}","until":"${until}"}&limit=500&access_token=${token}`,
    );
    const regs = linhas.map((r: any) => ({
      conta_id: conta, nivel: "campaign", objeto_id: String(r.campaign_id), data: r.date_start,
      payload: {
        id: String(r.campaign_id), name: r.campaign_name, date_start: r.date_start, date_stop: r.date_stop,
        amount_spent: { value: String(r.spend ?? "0"), unit: "BRL" },
        impressions: r.impressions != null ? String(r.impressions) : null,
        link_click: r.inline_link_clicks != null ? String(r.inline_link_clicks) : null,
        omni_purchase: (() => { const v = act(r.actions, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]); return v == null ? null : String(v); })(),
        reach: r.reach != null ? String(r.reach) : null,
        lpv: (() => { const v = act(r.actions, ["landing_page_view"]); return v == null ? null : String(v); })(),
        checkouts: (() => { const v = act(r.actions, ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"]); return v == null ? null : String(v); })(),
      },
      carga_id: logId,
    }));
    let gravadas = 0;
    for (let i = 0; i < regs.length; i += 200) {
      const lote = regs.slice(i, i + 200);
      const res = await sql`insert into raw.meta_ads_insight ${sql(lote, "conta_id", "nivel", "objeto_id", "data", "payload", "carga_id")}
        on conflict (conta_id, nivel, objeto_id, data) do update set payload = excluded.payload, capturado_em = now(), carga_id = excluded.carga_id`;
      gravadas += res.count ?? 0;
    }
    await sql`update raw.sync_estado set status = 'concluido', ultima_modificacao = now(), atualizado_em = now(), ultimo_erro = null,
      registros_processados = coalesce(registros_processados, 0) + ${regs.length} where fonte = 'meta' and entidade = 'ads'`;
    await sql`update raw.log_ingestao set finalizado_em = now(), status = 'sucesso', linhas_lidas = ${regs.length}, janela_inicio = ${since}, janela_fim = ${until} where id = ${logId}`;
    return json({ ok: true, conta, janela: { since, until }, linhas: regs.length, gravadas });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (logId != null) {
      try {
        await sql`update raw.log_ingestao set finalizado_em = now(), status = 'erro', mensagem_erro = ${msg.slice(0, 1000)} where id = ${logId}`;
        await sql`update raw.sync_estado set ultimo_erro = ${msg.slice(0, 1000)}, atualizado_em = now() where fonte = 'meta' and entidade = 'ads'`;
      } catch { /* o erro original é o que importa */ }
    }
    return json({ ok: false, erro: msg }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
