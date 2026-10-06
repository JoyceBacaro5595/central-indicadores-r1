import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const META_API_VERSION = 'v21.0';
const AD_ACCOUNT_ID = 'act_171474008015977';
const CAMPAIGN_TAG = 'MVONLINE-SET26';
const CACHE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;

interface MetaInsight {
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  reach?: string;
  cpm?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;

  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  ad_id?: string;
}

interface BreakdownEntry {
  name: string;
  spend: number;
  purchases: number;
}

interface AudienceData extends BreakdownEntry {
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  leads: number;
  cpmWeighted: number;
  ctrWeighted: number;
}

interface CreativeData extends BreakdownEntry {
  id: string;
  campaignName: string;
  clicks: number;
  impressions: number;
  leads: number;
  costPerResult: number;
  cpm: number;
  ctr: number;
  cpmWeighted: number;
  ctrWeighted: number;

  thumbnailUrl: string;
  previewUrl: string;
  videoUrl: string;
  status: string;
}

const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
let rateLimitedUntil = 0;

function getActionValue(actions: MetaInsight['actions'], type: string): number {
  const action = actions?.find((item) => item.action_type === type);
  return action ? Number.parseFloat(action.value) || 0 : 0;
}

function getLeadValue(actions: MetaInsight['actions']): number {
  return Math.max(
    getActionValue(actions, 'onsite_conversion.lead_grouped'),
    getActionValue(actions, 'lead'),
    getActionValue(actions, 'offsite_conversion.fb_pixel_lead'),
  );
}

function addBreakdown(target: Record<string, BreakdownEntry>, name: string, spend: number, purchases: number) {
  const current = target[name] ?? { name, spend: 0, purchases: 0 };
  current.spend += spend;
  current.purchases += purchases;
  target[name] = current;
}

async function fetchAllPages(url: string): Promise<MetaInsight[]> {
  const rows: MetaInsight[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 400 && (detail.includes('80004') || detail.includes('2446079'))) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      }
      throw new Error(`Meta insights error: ${response.status} - ${detail}`);
    }
    const page = await response.json();
    rows.push(...(page.data ?? []));
    nextUrl = page.paging?.next;
  }

  return rows;
}

interface AdCreativeInfo {
  thumbnailUrl: string;
  previewUrl: string;
  videoUrl: string;
  status: string;
  linkUrl: string;
}

/** Extrai a URL de destino do criativo (link_data, video_data ou asset_feed). */
function extractLinkUrl(node: unknown, depth = 0): string | undefined {
  if (!node || depth > 6) return undefined;
  if (typeof node !== 'object') return undefined;
  const obj = node as Record<string, unknown>;
  for (const key of ['link', 'website_url']) {
    const v = obj[key];
    if (typeof v === 'string' && v.startsWith('http')) return v;
  }
  for (const value of Object.values(obj)) {
    const found = extractLinkUrl(value, depth + 1);
    if (found) return found;
  }
  return undefined;
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

const CREATIVE_TTL_MS = 30 * 60 * 1000;
let creativeCache: { at: number; map: Record<string, AdCreativeInfo> } | null = null;
let creativeInflight: Promise<Record<string, AdCreativeInfo>> | null = null;

/** Busca o player embutido (iframe) dos anúncios em vídeo. */
async function fetchAdPreviews(token: string, adIds: string[]): Promise<Record<string, string>> {
  const previews: Record<string, string> = {};
  const formats = ['INSTAGRAM_STANDARD', 'MOBILE_FEED_STANDARD'];
  await Promise.all(
    adIds.map(async (adId) => {
      for (const format of formats) {
        try {
          const params = new URLSearchParams({ ad_format: format, access_token: token });
          const res = await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/${adId}/previews?${params}`,
          );
          if (!res.ok) continue;
          const json = await res.json();
          const body: string = json?.data?.[0]?.body ?? '';
          const src = body.match(/src="([^"]+)"/)?.[1];
          if (src) {
            previews[adId] = src.replace(/&amp;/g, '&');
            return;
          }
        } catch (e) {
          console.error('Meta preview fetch failed', e);
        }
      }
    }),
  );
  return previews;
}


/** Procura recursivamente um video_id em qualquer nível do criativo. */
function findVideoId(node: unknown, depth = 0): string | undefined {
  if (!node || depth > 6) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findVideoId(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const direct = obj.video_id;
    if (typeof direct === 'string' && direct) return direct;
    if (typeof direct === 'number') return String(direct);
    for (const value of Object.values(obj)) {
      const found = findVideoId(value, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** Busca uma única vez (com cache de 30min) a imagem e o link de cada anúncio. */
async function fetchAdCreatives(token: string): Promise<Record<string, AdCreativeInfo>> {
  if (creativeCache && Date.now() - creativeCache.at < CREATIVE_TTL_MS) return creativeCache.map;
  if (creativeInflight) return creativeInflight;

  creativeInflight = (async () => {
    const map: Record<string, AdCreativeInfo> = {};
    const videoByAd: Record<string, string> = {};
    const params = new URLSearchParams({
      fields:
        'id,name,effective_status,creative.thumbnail_width(600).thumbnail_height(600){thumbnail_url,image_url,video_id,effective_object_story_id,instagram_permalink_url,object_story_spec{link_data{link},video_data{call_to_action}}}',

      filtering: JSON.stringify([
        { field: 'campaign.name', operator: 'CONTAIN', value: CAMPAIGN_TAG },
      ]),
      limit: '100',
      access_token: token,
    });
    let nextUrl: string | undefined =
      `https://graph.facebook.com/${META_API_VERSION}/${AD_ACCOUNT_ID}/ads?${params}`;
    while (nextUrl) {
      const response = await fetch(nextUrl);
      if (!response.ok) {
        console.error(`Meta ads error: ${response.status} - ${await response.text()}`);
        break;
      }
      const page = await response.json();
      for (const ad of page.data ?? []) {
        const c = ad.creative ?? {};
        const storyId: string | undefined = c.effective_object_story_id;
        const videoId = findVideoId(c);
        if (videoId) videoByAd[ad.id] = videoId;
        map[ad.id] = {
          thumbnailUrl: c.image_url || c.thumbnail_url || '',
          previewUrl: c.instagram_permalink_url
            || (storyId ? `https://www.facebook.com/${storyId.replace('_', '/posts/')}` : ''),
          videoUrl: '',
          status: ad.effective_status ?? 'UNKNOWN',
          linkUrl: extractLinkUrl(c.object_story_spec) || extractLinkUrl(c.asset_feed_spec) || '',
        };
      }
      nextUrl = page.paging?.next;
    }

    const videoAdIds = Object.keys(videoByAd);
    if (videoAdIds.length) {
      const previews = await fetchAdPreviews(token, videoAdIds);
      console.log(`anúncios em vídeo: ${videoAdIds.length}, players: ${Object.keys(previews).length}`);
      for (const adId of videoAdIds) {
        if (previews[adId] && map[adId]) map[adId].videoUrl = previews[adId];
      }
    }



    if (Object.keys(map).length) creativeCache = { at: Date.now(), map };
    return map;
  })().finally(() => { creativeInflight = null; });

  return creativeInflight;
}


async function fetchMetaInsights(token: string, startDate: string, endDate: string) {
  const fields = 'date_start,spend,impressions,clicks,inline_link_clicks,reach,cpm,ctr,actions,campaign_name,adset_name,ad_name,ad_id';
  const filtering = JSON.stringify([
    { field: 'campaign.name', operator: 'CONTAIN', value: CAMPAIGN_TAG },
  ]);
  const params = new URLSearchParams({
    fields,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    time_increment: '1',
    level: 'ad',
    filtering,
    limit: '500',
    access_token: token,
  });
  const url = `https://graph.facebook.com/${META_API_VERSION}/${AD_ACCOUNT_ID}/insights?${params}`;
  const [rows, creativeInfo] = await Promise.all([
    fetchAllPages(url),
    fetchAdCreatives(token).catch(() => ({} as Record<string, AdCreativeInfo>)),
  ]);

  const dailyMap: Record<string, {
    date: string; spend: number; impressions: number; clicks: number; linkClicks: number;
    reach: number; landingPageViews: number; initiateCheckout: number; purchases: number;
  }> = {};
  const campaignMap: Record<string, BreakdownEntry> = {};
  const audienceMap: Record<string, AudienceData> = {};
  const creativeMap: Record<string, CreativeData> = {};
  const paginaMap: Record<string, {
    name: string; spend: number; impressions: number; clicks: number;
    linkClicks: number; landingPageViews: number;
  }> = {};

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalLinkClicks = 0;
  let totalReach = 0;
  let totalLPV = 0;
  let totalIC = 0;
  let totalPurchases = 0;

  for (const row of rows) {
    if (!row.campaign_name?.toUpperCase().includes(CAMPAIGN_TAG)) continue;

    const spend = Number.parseFloat(row.spend ?? '0') || 0;
    const impressions = Number.parseInt(row.impressions ?? '0', 10) || 0;
    const clicks = Number.parseInt(row.clicks ?? '0', 10) || 0;
    const linkClicks = Number.parseInt(row.inline_link_clicks ?? '0', 10) || 0;
    const reach = Number.parseInt(row.reach ?? '0', 10) || 0;
    const rowCpm = Number.parseFloat(row.cpm ?? '0') || 0;
    const rowCtr = Number.parseFloat(row.ctr ?? '0') || 0;

    const lpv = getActionValue(row.actions, 'landing_page_view');
    const initiateCheckout = getActionValue(row.actions, 'initiate_checkout');
    const purchases = getActionValue(row.actions, 'purchase');
    const leads = getLeadValue(row.actions);

    totalSpend += spend;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalLinkClicks += linkClicks;
    totalReach += reach;
    totalLPV += lpv;
    totalIC += initiateCheckout;
    totalPurchases += purchases;

    const day = dailyMap[row.date_start] ?? {
      date: row.date_start, spend: 0, impressions: 0, clicks: 0, linkClicks: 0,
      reach: 0, landingPageViews: 0, initiateCheckout: 0, purchases: 0,
    };
    day.spend += spend;
    day.impressions += impressions;
    day.clicks += clicks;
    day.linkClicks += linkClicks;
    day.reach += reach;
    day.landingPageViews += lpv;
    day.initiateCheckout += initiateCheckout;
    day.purchases += purchases;
    dailyMap[row.date_start] = day;

    const campaignName = row.campaign_name ?? 'Campanha sem nome';
    const audienceName = row.adset_name ?? 'Público sem nome';
    addBreakdown(campaignMap, campaignName, spend, purchases);
    const audience = audienceMap[audienceName] ?? {
      name: audienceName, spend: 0, purchases: 0, impressions: 0, clicks: 0,
      linkClicks: 0, landingPageViews: 0, leads: 0, cpmWeighted: 0, ctrWeighted: 0,
    };
    audience.spend += spend;
    audience.purchases += purchases;
    audience.impressions += impressions;
    audience.clicks += clicks;
    audience.linkClicks += linkClicks;
    audience.landingPageViews += lpv;
    audience.leads += leads;
    audience.cpmWeighted += rowCpm * impressions;
    audience.ctrWeighted += rowCtr * impressions;
    audienceMap[audienceName] = audience;

    const adId = row.ad_id ?? row.ad_name ?? 'Anúncio sem identificação';
    const creative = creativeMap[adId] ?? {
      id: adId,
      name: row.ad_name ?? 'Anúncio sem nome',
      campaignName,
      spend: 0,
      clicks: 0,
      impressions: 0,
      purchases: 0,
      leads: 0,
      costPerResult: 0,
      cpm: 0,
      ctr: 0,
      cpmWeighted: 0,
      ctrWeighted: 0,
      thumbnailUrl: '',
      previewUrl: '',
      videoUrl: '',
      status: 'UNKNOWN',
    };
    creative.spend += spend;
    creative.clicks += clicks;
    creative.impressions += impressions;
    creative.purchases += purchases;
    creative.leads += leads;
    creative.cpmWeighted += rowCpm * impressions;
    creative.ctrWeighted += rowCtr * impressions;
    creativeMap[adId] = creative;

    // Painel de páginas: só a campanha de teste de LP. Na campanha de teste, a
    // página é o conjunto ("… - LP V2"); o link de destino só entra quando o
    // conjunto não traz a variante.
    const ehTesteLp = /teste de lp/i.test(campaignName);
    const ehTesteCriativos = /teste de criativos/i.test(campaignName);
    const ehValidados = /validados/i.test(campaignName);
    if (ehTesteLp || ehTesteCriativos || ehValidados) {
      const destino = row.ad_id ? creativeInfo[row.ad_id]?.linkUrl : '';
      const variante = (row.adset_name ?? '').match(/lp\s*v\s*(\d+)/i);
      const chave = ehTesteCriativos
        ? 'Teste de Criativos'
        : ehValidados
          ? 'Validados'
          : variante
            ? `LP V${variante[1]}`
            : (destino ? normalizePageUrl(destino) : 'Sem página identificada');

      const pagina = paginaMap[chave] ?? {
        name: chave, spend: 0, impressions: 0, clicks: 0, linkClicks: 0, landingPageViews: 0,
      };
      pagina.spend += spend;
      pagina.impressions += impressions;
      pagina.clicks += clicks;
      pagina.linkClicks += linkClicks;
      pagina.landingPageViews += lpv;
      paginaMap[chave] = pagina;
    }
  }


  const creativeCards = Object.values(creativeMap).map((creative) => ({
    ...creative,
    ...(creativeInfo[creative.id] ?? {}),
    costPerResult: creative.purchases > 0 ? creative.spend / creative.purchases : 0,
    cpm: creative.impressions > 0 ? creative.cpmWeighted / creative.impressions : 0,
    ctr: creative.impressions > 0 ? creative.ctrWeighted / creative.impressions : 0,

  })).sort((a, b) => b.spend - a.spend);
  const sortBySpend = (items: BreakdownEntry[]) => items.sort((a, b) => b.spend - a.spend);

  return {
    daily: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
    totals: {
      spend: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      linkClicks: totalLinkClicks,
      reach: totalReach,
      landingPageViews: totalLPV,
      initiateCheckout: totalIC,
      purchases: totalPurchases,
      ctr: totalImpressions > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0,
      cpc: totalLinkClicks > 0 ? totalSpend / totalLinkClicks : 0,
      cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      costPerPurchase: totalPurchases > 0 ? totalSpend / totalPurchases : 0,
      connectRate: totalLinkClicks > 0 ? (totalLPV / totalLinkClicks) * 100 : 0,
      conversionRate: totalLPV > 0 ? (totalPurchases / totalLPV) * 100 : 0,
      costPerLPV: totalLPV > 0 ? totalSpend / totalLPV : 0,
      costPerIC: totalIC > 0 ? totalSpend / totalIC : 0,
      txConvCheckout: totalIC > 0 ? (totalPurchases / totalIC) * 100 : 0,
      txConvPV: totalLPV > 0 ? (totalPurchases / totalLPV) * 100 : 0,
    },
    campaigns: sortBySpend(Object.values(campaignMap)),
    audiences: Object.values(audienceMap)
      .map((a) => ({
        ...a,
        cpm: a.impressions > 0 ? a.cpmWeighted / a.impressions : 0,
        ctr: a.impressions > 0 ? a.ctrWeighted / a.impressions : 0,
      }))
      .sort((a, b) => b.spend - a.spend),
    creatives: creativeCards.map(({ name, spend, purchases }) => ({ name, spend, purchases })),
    creativeCards,
    paginas: Object.values(paginaMap).sort((a, b) => b.spend - a.spend),
  };
}

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Método não permitido' }, 405);

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate') ?? '2026-09-14';
  const endDate = url.searchParams.get('endDate') ?? '2026-09-21';
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(startDate) || !datePattern.test(endDate) || startDate > endDate) {
    return json({ error: 'Período inválido' }, 400);
  }

  const key = `${startDate}|${endDate}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return json(cached.data);
  if (Date.now() < rateLimitedUntil) {
    if (cached) return json(cached.data);
    return json({ error: 'A Meta limitou temporariamente a consulta. Aguarde alguns minutos.' }, 429);
  }

  try {
    const token = Deno.env.get('META_ADS_TOKEN');
    if (!token) return json({ error: 'Token da Meta não configurado' }, 500);

    let request = inflight.get(key);
    if (!request) {
      request = fetchMetaInsights(token, startDate, endDate).finally(() => inflight.delete(key));
      inflight.set(key, request);
    }
    const data = await request;
    cache.set(key, { at: Date.now(), data });
    return json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Error fetching Meta Ads data:', message);
    if (cached) return json(cached.data);
    return json({ error: message }, Date.now() < rateLimitedUntil ? 429 : 500);
  }
});
