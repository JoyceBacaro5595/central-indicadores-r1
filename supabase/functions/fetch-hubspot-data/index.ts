import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface DailyEntry {
  date: string;
  inscricoes: number;
  qualificados: number;
}

async function hubspotGet(token: string, path: string) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`HubSpot request failed [${res.status}]: ${errBody}`);
    throw new Error(`HubSpot error ${res.status}: ${errBody}`);
  }
  return res.json();
}

/** Nome do formulário de captação da Máquina de Vendas Online. */
const FORM_NAME = '[FORM][TI<>MKT][TURNEMAQUINADEVENDAS] - Online - Julho/2026 - 2';

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Cache do id do formulário (não muda) e do resultado por período. */
let formIdsCache: { ids: string[]; at: number } | null = null;
const FORM_TTL = 60 * 60 * 1000; // 1h
const RESULT_TTL = 10 * 60 * 1000; // 10min
const resultCache = new Map<string, { at: number; payload: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/** Lista os formulários de marketing com o nome alvo. */
async function listSosForms(token: string): Promise<string[]> {
  if (formIdsCache && Date.now() - formIdsCache.at < FORM_TTL) return formIdsCache.ids;
  const formIds: string[] = [];
  const target = normalize(FORM_NAME);
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ limit: '100' });
    if (after) qs.set('after', after);
    const json = await hubspotGet(token, `/marketing/v3/forms?${qs}`);
    for (const f of json.results || []) {
      const name: string = f.name || '';
      if (normalize(name) === target) {
        formIds.push(f.id);
      }
    }
    after = json.paging?.next?.after;
    if (!after || formIds.length) break;
  }
  formIdsCache = { ids: formIds, at: Date.now() };
  return formIds;
}

/**
 * Converte a resposta de faturamento em um valor mensal aproximado (R$).
 * Exemplos: "100 mil a 200 mil por mês", "Acima de 1 milhão", "Até 50 mil".
 */
function parseFaturamento(raw: string): number | null {
  if (!raw) return null;
  const txt = raw.toLowerCase();
  const nums = [...txt.matchAll(/(\d+(?:[.,]\d+)?)\s*(milh[^\s]*|mi\b|mil)?/g)]
    .map((m) => {
      const n = parseFloat(m[1].replace(',', '.'));
      const unit = m[2] || '';
      if (unit.startsWith('milh') || unit === 'mi') return n * 1_000_000;
      if (unit === 'mil') return n * 1_000;
      return n;
    })
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  const piso = Math.min(...nums);
  // "menor que X", "até X", "abaixo de X" => o teto da faixa é X, então o piso é 0
  if (/menor|menos de|abaixo|at[ée]\s/.test(txt)) return 0;
  // "acima de X" / "mais de X" => usa X; faixas => usa o piso da faixa
  return piso;
}

export interface DistBuckets {
  campanhas: Record<string, number>;
  publicos: Record<string, number>;
  criativos: Record<string, number>;
}

const novaDist = (): DistBuckets => ({ campanhas: {}, publicos: {}, criativos: {} });

const SEM_DADOS = 'Sem dados';

function addDist(
  dist: DistBuckets,
  values: Array<{ name?: string; value?: string }>,
) {
  const get = (n: string) => (values.find((v) => v.name === n)?.value || '').trim() || SEM_DADOS;
  dist.campanhas[get('utm_campaign')] = (dist.campanhas[get('utm_campaign')] || 0) + 1;
  dist.publicos[get('utm_term')] = (dist.publicos[get('utm_term')] || 0) + 1;
  dist.criativos[get('utm_content')] = (dist.criativos[get('utm_content')] || 0) + 1;
}

/** Normaliza a URL da página: host + caminho, sem protocolo, query ou barra final. */
function normalizePageUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.host}${path}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/** Busca submissões de um formulário dentro do intervalo e agrupa por dia. */
async function collectFormSubmissions(
  token: string,
  formId: string,
  startTs: number,
  endTs: number,
  dailyMap: Record<string, number>,
  qualMap: Record<string, number>,
  faixas: Record<string, number>,
  counters: { qualificados: number; semResposta: number },
  distMql: DistBuckets,
  distAbaixo: DistBuckets,
  distTodos: DistBuckets,
  cargos: Record<string, number>,
  cargosMql: Record<string, number>,
  paginas: Record<string, { leads: number; mql: number }>,
): Promise<void> {
  let after: string | undefined;
  for (let page = 0; page < 400; page++) {
    const qs = new URLSearchParams({ limit: '50' });
    if (after) qs.set('after', after);
    let json: { results?: Array<Record<string, unknown>>; paging?: { next?: { after?: string } } };
    try {
      json = await hubspotGet(
        token,
        `/form-integrations/v1/submissions/forms/${formId}?${qs}`,
      );
    } catch (e) {
      // Some form types don't support the submissions endpoint — skip them.
      if (e instanceof Error && e.message.includes('404')) return;
      throw e;
    }
    let reachedOlder = false;
    for (const s of json.results || []) {
      const submittedAt = s.submittedAt as number | undefined;
      if (!submittedAt) continue;
      // A API retorna do mais recente para o mais antigo: ao passar do início
      // do período não há mais nada útil nas próximas páginas.
      if (submittedAt < startTs) {
        reachedOlder = true;
        continue;
      }
      if (submittedAt <= endTs) {
        const values = (s.values as Array<{ name?: string; value?: string }>) || [];

        // Desconsidera submissões de teste apenas pelos dados do contato.
        // Não verifica UTMs: a campanha válida se chama "Teste de LP".
        const textoContato = values
          .filter((v) => ['firstname', 'lastname', 'email'].includes(v.name || ''))
          .map((v) => (v.value || '').toLowerCase())
          .join(' ');
        if (/teste|barbosa/.test(textoContato)) continue;

        const day = new Date(submittedAt).toISOString().split('T')[0];
        dailyMap[day] = (dailyMap[day] || 0) + 1;
        addDist(distTodos, values);

        const pageRaw = (s.pageUrl as string | undefined) || '';
        // Páginas de teste com sufixo de variante no CAMINHO da URL (-v1, -v2)
        // viram "LP V<n>", a mesma chave usada no agrupamento do Meta pelo
        // nome do conjunto. O sufixo só vale no path — query strings (fbclid,
        // utm_id "..._v2_s08") geram falsos positivos.
        let pagePath = pageRaw;
        try { pagePath = new URL(pageRaw).pathname; } catch { /* mantém raw */ }
        const variante = pagePath.match(/[-_/]v\s*(\d+)(?:[-_/]|$)/i);
        const pageKey = variante
          ? `LP V${variante[1]}`
          : (pageRaw ? normalizePageUrl(pageRaw) : 'Sem página identificada');
        const pagina = paginas[pageKey] ?? { leads: 0, mql: 0 };
        pagina.leads += 1;
        paginas[pageKey] = pagina;

        const cargo = (values.find((v) => v.name === 'ti__form____cargo')?.value || '').trim() || SEM_DADOS;
        cargos[cargo] = (cargos[cargo] || 0) + 1;

        const rev = values.find((v) => v.name === 'annualrevenue')?.value || '';
        if (!rev) {
          counters.semResposta += 1;
        } else {
          faixas[rev] = (faixas[rev] || 0) + 1;
          const valor = parseFaturamento(rev);
          if (valor !== null && valor >= 100_000) {
            counters.qualificados += 1;
            qualMap[day] = (qualMap[day] || 0) + 1;
            cargosMql[cargo] = (cargosMql[cargo] || 0) + 1;
            addDist(distMql, values);
            pagina.mql += 1;
          } else if (valor !== null) {
            addDist(distAbaixo, values);
          }
        }
      }
    }
    after = json.paging?.next?.after;
    if (!after || reachedOlder) break;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get('HubSpot_token') ?? Deno.env.get('HUBSPOT_API_TOKEN');
    if (!token) throw new Error('HubSpot token not configured');

    const url = new URL(req.url);
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const startParam = url.searchParams.get('startDate');
    const endParam = url.searchParams.get('endDate');
    const startDate = startParam && dateRe.test(startParam) ? startParam : '2026-01-01';
    const endDate = endParam && dateRe.test(endParam)
      ? endParam
      : new Date().toISOString().split('T')[0];

    const startTs = new Date(`${startDate}T00:00:00.000Z`).getTime();
    const endTs = new Date(`${endDate}T23:59:59.999Z`).getTime();

    const forms = await listSosForms(token);
    console.log(`Found ${forms.length} SOS forms`);

    if (url.searchParams.get('raw') === '1') {
      const sample: unknown[] = [];
      for (const formId of forms.slice(0, 2)) {
        const json = await hubspotGet(
          token,
          `/form-integrations/v1/submissions/forms/${formId}?limit=3`,
        );
        sample.push({ formId, results: json.results });
      }
      return new Response(JSON.stringify({ sample }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (url.searchParams.get('pages') === '1') {
      const hist: Record<string, number> = {};
      for (const formId of forms) {
        let after: string | undefined;
        for (let page = 0; page < 400; page++) {
          const qs = new URLSearchParams({ limit: '50' });
          if (after) qs.set('after', after);
          let json: { results?: Array<Record<string, unknown>>; paging?: { next?: { after?: string } } };
          try {
            json = await hubspotGet(token, `/form-integrations/v1/submissions/forms/${formId}?${qs}`);
          } catch { break; }
          let older = false;
          for (const s of json.results || []) {
            const ts = s.submittedAt as number | undefined;
            if (!ts) continue;
            if (ts < startTs) { older = true; continue; }
            if (ts <= endTs) {
              const p = (s.pageUrl as string | undefined) || '(vazio)';
              hist[p] = (hist[p] || 0) + 1;
            }
          }
          const next = json.paging?.next?.after;
          if (!next || older) break;
          after = next;
        }
      }
      return new Response(JSON.stringify({ pageUrls: hist }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const cacheKey = `${startDate}:${endDate}`;
    const force = url.searchParams.get('force') === '1';
    const cached = resultCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.at < RESULT_TTL) {
      return new Response(JSON.stringify(cached.payload), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'hit' },
        status: 200,
      });
    }

    const existing = inflight.get(cacheKey);
    const work = existing ?? (async () => {
      const dailyMap: Record<string, number> = {};
      const qualMap: Record<string, number> = {};
      const faixas: Record<string, number> = {};
      const counters = { qualificados: 0, semResposta: 0 };
      const distMql = novaDist();
      const distAbaixo = novaDist();
      const distTodos = novaDist();
      const cargos: Record<string, number> = {};
      const cargosMql: Record<string, number> = {};
      const paginas: Record<string, { leads: number; mql: number }> = {};
      for (const formId of forms) {
        await collectFormSubmissions(
          token, formId, startTs, endTs, dailyMap, qualMap, faixas, counters,
          distMql, distAbaixo, distTodos, cargos, cargosMql, paginas,
        );
      }

      const toList = (m: Record<string, number>) =>
        Object.entries(m)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);
      const serializar = (d: DistBuckets) => ({
        campanhas: toList(d.campanhas),
        publicos: toList(d.publicos),
        criativos: toList(d.criativos),
      });

      const totalInscricoes = Object.values(dailyMap).reduce((a, b) => a + b, 0);
      const daily: DailyEntry[] = Object.entries(dailyMap)
        .map(([date, inscricoes]) => ({
          date,
          inscricoes,
          qualificados: qualMap[date] || 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const taxaQualificacao = totalInscricoes > 0
        ? (counters.qualificados / totalInscricoes) * 100
        : 0;

      return {
        inscricoes: totalInscricoes,
        qualificados: counters.qualificados,
        semResposta: counters.semResposta,
        taxaQualificacao,
        faixas,
        daily,
        distMql: serializar(distMql),
        distAbaixo100k: serializar(distAbaixo),
        distTodos: serializar(distTodos),
        distCargos: toList(cargos),
        distCargosMql: toList(cargosMql),
        paginas: Object.entries(paginas)
          .map(([name, p]) => ({ name, leads: p.leads, mql: p.mql }))
          .sort((a, b) => b.leads - a.leads),
      };
    })();

    if (!existing) inflight.set(cacheKey, work);
    let payload: unknown;
    try {
      payload = await work;
    } finally {
      if (!existing) inflight.delete(cacheKey);
    }
    resultCache.set(cacheKey, { at: Date.now(), payload });

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'miss' },
      status: 200,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching HubSpot data:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
