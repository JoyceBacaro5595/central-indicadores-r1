// Upsell: carga das vendas ganhas de Clube R1 e Trator direto do HubSpot para rgv.vendas_clube_trator (pedido da Joyce, 19/10).
// Busca todos os negócios ganhos (hs_is_closed_won) com produto "Clube R1" ou "Operação Trator" fechados desde 01/01/2026,
// em qualquer funil, e faz upsert por deal_id. Negócio que deixou de ser ganho vira etapa 'Reaberto' (nada é apagado).
// Tag de ciclo: o HubSpot guarda ids de tag (hs_tag_ids). O id -> "RGV nn" é aprendido das vendas já tagueadas e fica em
// rgv.hubspot_tag_ciclo (ajustável à mão para ciclos novos). Venda sem tag conhecida fica com evento_tag nulo.
// Campanha: negócio sem utm_camp herda a campanha do contato associado (utm_campaign do contato ou, se faltar, o utm_campaign do link da primeira página), em rgv.vendas_clube_trator.campanha_contato.
// Autenticação: header x-guru-sync-key = vault 'guru_sync_key' (verify_jwt=false). Precisa do secret HUBSPOT_TOKEN.
import postgres from "npm:postgres@3.4.4";

const HS = "https://api.hubapi.com";
const PRODUTOS: Record<string, "clube_r1" | "trator"> = { "Clube R1": "clube_r1", "Operação Trator": "trator" };
const DESDE_MS = String(Date.parse("2026-01-01T00:00:00-03:00"));
const PROPS = ["dealname", "amount", "closedate", "produto", "pipeline", "origem_dos_negocios", "utm_camp", "utm_term", "hs_tag_ids"];
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hs(token: string, body: unknown, t = 0): Promise<any> {
  const r = await fetch(`${HS}/crm/v3/objects/deals/search`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (r.status === 429 && t < 4) { await sleep(2000 * (t + 1)); return hs(token, body, t + 1); }
  if (!r.ok) throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

async function hsPost(token: string, path: string, body: unknown): Promise<any> {
  const r = await fetch(`${HS}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}
const campanhaDaUrl = (u: string | null) => { try { return u ? new URL(u).searchParams.get("utm_campaign") : null; } catch { return null; } };
const dataSP = (iso: string | null) => iso ? new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10) : null;

Deno.serve(async (req) => {
  const token = Deno.env.get("HUBSPOT_TOKEN");
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
  try {
    const dado = req.headers.get("x-guru-sync-key") ?? "";
    const [k] = await sql`select decrypted_secret as s from vault.decrypted_secrets where name = 'guru_sync_key'`;
    const esp = k?.s ?? "";
    if (!(esp.length > 0 && dado.length === esp.length && dado === esp)) return json({ ok: false, erro: "exige x-guru-sync-key" }, 403);
    if (!token) return json({ ok: false, erro: "HUBSPOT_TOKEN nao configurado" }, 500);

    const deals: any[] = [];
    let after: string | undefined;
    for (let pg = 0; pg < 30; pg++) {
      const r = await hs(token, {
        filterGroups: [{ filters: [
          { propertyName: "hs_is_closed_won", operator: "EQ", value: "true" },
          { propertyName: "produto", operator: "IN", values: Object.keys(PRODUTOS) },
          { propertyName: "closedate", operator: "GTE", value: DESDE_MS },
        ] }],
        sorts: [{ propertyName: "closedate", direction: "ASCENDING" }], properties: PROPS, limit: 100, ...(after ? { after } : {}),
      });
      deals.push(...(r.results ?? []));
      after = r.paging?.next?.after;
      if (!after) break;
      await sleep(150);
    }
    if (!deals.length) return json({ ok: false, erro: "HubSpot devolveu 0 negócios; nada foi alterado" }, 500);

    // aprende id de tag -> ciclo a partir das vendas que já têm evento_tag
    const atuais = await sql`select deal_id, evento_tag from rgv.vendas_clube_trator`;
    const tagAtual = new Map<string, string | null>(atuais.map((a: any) => [a.deal_id, a.evento_tag || null]));
    const tally = new Map<string, Map<string, number>>();
    for (const d of deals) {
      const ev = tagAtual.get(d.id);
      if (!ev) continue;
      for (const t of String(d.properties.hs_tag_ids ?? "").split(";").filter(Boolean)) {
        const m = tally.get(t) ?? new Map<string, number>(); m.set(ev, (m.get(ev) ?? 0) + 1); tally.set(t, m);
      }
    }
    for (const [t, m] of tally) {
      const tot = [...m.values()].reduce((a, b) => a + b, 0);
      const [nome, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
      if (n >= 2 && n / tot >= 0.9) {
        await sql`insert into rgv.hubspot_tag_ciclo (tag_id, evento_tag, n) values (${t}, ${nome}, ${n})
          on conflict (tag_id) do update set evento_tag = excluded.evento_tag, n = excluded.n, atualizado_em = now() where not rgv.hubspot_tag_ciclo.manual`;
      }
    }
    const mapa = new Map<string, string>((await sql`select tag_id, evento_tag from rgv.hubspot_tag_ciclo`).map((r: any) => [r.tag_id, r.evento_tag]));

    const linhas = deals.map((d) => {
      const p = d.properties;
      const ids = String(p.hs_tag_ids ?? "").split(";").filter(Boolean);
      const evs = [...new Set(ids.map((t) => mapa.get(t)).filter(Boolean))] as string[];
      return {
        deal_id: String(d.id), nome: p.dealname ?? null, produto: p.produto, grupo: PRODUTOS[p.produto] ?? "sem_produto", etapa: "Ganho",
        data_fechamento: dataSP(p.closedate), valor: p.amount != null && p.amount !== "" ? Number(p.amount) : null,
        evento_tag: tagAtual.get(String(d.id)) || (evs.length === 1 ? evs[0] : null),
        origem_negocios: p.origem_dos_negocios ?? null, utm_campanha: p.utm_camp ?? null, utm_term: p.utm_term ?? null,
        pipeline: p.pipeline ?? null, hs_tag_ids: ids.join(";") || null,
      };
    });
    for (let i = 0; i < linhas.length; i += 100) {
      const lote = linhas.slice(i, i + 100);
      await sql`insert into rgv.vendas_clube_trator ${sql(lote, "deal_id", "nome", "produto", "grupo", "etapa", "data_fechamento", "valor", "evento_tag", "origem_negocios", "utm_campanha", "utm_term", "pipeline", "hs_tag_ids")}
        on conflict (deal_id) do update set nome = excluded.nome, produto = excluded.produto, grupo = excluded.grupo, etapa = 'Ganho',
          data_fechamento = excluded.data_fechamento, valor = excluded.valor,
          evento_tag = coalesce(excluded.evento_tag, rgv.vendas_clube_trator.evento_tag),
          origem_negocios = coalesce(nullif(excluded.origem_negocios, ''), rgv.vendas_clube_trator.origem_negocios),
          utm_campanha = coalesce(nullif(excluded.utm_campanha, ''), rgv.vendas_clube_trator.utm_campanha),
          utm_term = coalesce(nullif(excluded.utm_term, ''), rgv.vendas_clube_trator.utm_term),
          pipeline = excluded.pipeline, hs_tag_ids = excluded.hs_tag_ids, carregado_em = now(), sincronizado_em = now()`;
    }
    // campanha vinda do contato, só para negócios sem utm_camp (falha aqui não derruba a carga)
    let campanhaContato = 0;
    try {
      const sem = linhas.filter((l) => !l.utm_campanha).map((l) => l.deal_id);
      const porDeal = new Map<string, string[]>();
      for (let i = 0; i < sem.length; i += 100) {
        const a = await hsPost(token, "/crm/v4/associations/deals/contacts/batch/read", { inputs: sem.slice(i, i + 100).map((id) => ({ id })) });
        for (const r of a.results ?? []) porDeal.set(String(r.from.id), (r.to ?? []).map((t: any) => String(t.toObjectId)));
        await sleep(150);
      }
      const contatos = [...new Set([...porDeal.values()].flat())];
      const props = new Map<string, any>();
      for (let i = 0; i < contatos.length; i += 100) {
        const r = await hsPost(token, "/crm/v3/objects/contacts/batch/read", { properties: ["utm_campaign", "hs_analytics_first_url"], inputs: contatos.slice(i, i + 100).map((id) => ({ id })) });
        for (const c of r.results ?? []) props.set(String(c.id), c.properties);
        await sleep(150);
      }
      for (const [deal, cs] of porDeal) {
        const ps = cs.map((c) => props.get(c) ?? {});
        const camp = ps.map((p) => p.utm_campaign).find(Boolean) ?? ps.map((p) => campanhaDaUrl(p.hs_analytics_first_url ?? null)).find(Boolean) ?? null;
        if (camp) { await sql`update rgv.vendas_clube_trator set campanha_contato = ${camp} where deal_id = ${deal}`; campanhaContato++; }
      }
    } catch (e) { console.error("campanha do contato:", (e as Error).message); }
    const ids = linhas.map((l) => l.deal_id);
    const reab = await sql`update rgv.vendas_clube_trator set etapa = 'Reaberto', sincronizado_em = now()
      where grupo in ('clube_r1', 'trator') and etapa = 'Ganho' and not (deal_id = any(${ids})) returning deal_id`;
    const semTag = linhas.filter((l) => !l.evento_tag).length;
    return json({ ok: true, lidos: deals.length, clube_r1: linhas.filter((l) => l.grupo === "clube_r1").length, trator: linhas.filter((l) => l.grupo === "trator").length, sem_tag: semTag, campanha_do_contato: campanhaContato, reabertos: reab.length });
  } catch (e) {
    return json({ ok: false, erro: String((e as Error)?.message ?? e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
