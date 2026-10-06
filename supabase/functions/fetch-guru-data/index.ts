const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GURU_API = 'https://digitalmanager.guru/api/v2';

interface GuruDailyEntry {
  date: string;
  vendas: number;
  faturamento: number;
}

interface GuruResult {
  faturamento: number;
  vendas: number;
  produtos: number;
  clientesNovos: number;
  reembolsos: number;
  totalLiquido: number;
  ticketMedio: number;
  lucroMedio: number;
  daily: GuruDailyEntry[];
  produtosSos: { id: string; name: string }[];
  kit: { vendas: number; faturamento: number; ticketMedio: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Guru rate-limits aggressively (429). Retry with exponential backoff and
// keep a small gap between calls.
async function guruFetch(url: string, token: string, label: string): Promise<any> {
  let delay = 1500;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.ok) {
      await sleep(400);
      return await res.json();
    }
    const detail = await res.text();
    if (res.status === 429 || res.status >= 500) {
      console.log(`Guru ${label} ${res.status}, retry in ${delay}ms (attempt ${attempt + 1})`);
      await sleep(delay);
      delay = Math.min(delay * 2, 15000);
      continue;
    }
    throw new Error(`Guru ${label} error: ${res.status} ${detail.slice(0, 300)}`);
  }
  throw new Error(`Guru ${label} error: rate limited after retries`);
}

// List products whose name contains "SOS" (case-insensitive).
async function fetchSosProducts(token: string): Promise<{ id: string; name: string }[]> {
  const found: { id: string; name: string }[] = [];
  let cursor: string | null = null;
  let pages = 0;
  while (pages < 100) {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const data = await guruFetch(`${GURU_API}/products?${params}`, token, 'products');
    for (const p of (data.data || [])) {
      const name: string = p.name || p.title || '';
      if (/\bSOS\b/i.test(name)) {
        found.push({ id: p.id || p.uuid, name });
      }
    }
    pages++;
    if (!data.has_more_pages || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  console.log(`Guru products: ${found.length} SOS products found in ${pages} pages`);
  return found;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// Guru API limits each request window to 180 days. Split the full range into
// <=179-day chunks.
function chunkDateRange(startDate: string, endDate: string): [string, string][] {
  const chunks: [string, string][] = [];
  let cur = startDate;
  while (cur <= endDate) {
    const endChunk = addDays(cur, 179);
    const chunkEnd = endChunk > endDate ? endDate : endChunk;
    chunks.push([cur, chunkEnd]);
    cur = addDays(chunkEnd, 1);
  }
  return chunks;
}

async function fetchProductTransactions(
  productId: string,
  productName: string,
  startDate: string,
  endDate: string,
  token: string,
  acc: {
    contactIds: Set<string>;
    dailyMap: Record<string, { vendas: number; faturamento: number }>;
    faturamento: number; vendas: number; produtos: number;
    reembolsos: number; totalLiquido: number;
    kitVendas: number; kitFaturamento: number;
  },
): Promise<void> {
  for (const [chunkStart, chunkEnd] of chunkDateRange(startDate, endDate)) {
    let cursor: string | null = null;
    let hasMore = true;
    let pages = 0;
    while (hasMore && pages < 100) {
      const params = new URLSearchParams({
        confirmed_at_ini: chunkStart,
        confirmed_at_end: chunkEnd,
        limit: '100',
        product_id: productId,
      });
      if (cursor) params.set('cursor', cursor);
      const data = await guruFetch(`${GURU_API}/transactions?${params}`, token, 'transactions');
      console.log(`Guru [${productName}] chunk ${chunkStart}→${chunkEnd} page ${pages} items=${data.data?.length || 0} hasMore=${!!data.has_more_pages}`);
      pages++;
      for (const t of (data.data || [])) {
        // Defensive: still confirm the product name contains SOS.
        const name = t.product?.name || productName || '';
        if (!/\bSOS\b/i.test(name)) continue;

        const status = t.status;
        const gross = t.payment?.gross || 0;
        const net = t.payment?.net || 0;
        const qty = t.product?.qty || t.items?.[0]?.qty || 1;
        const contactId = t.contact?.id;
        const confirmedAt = t.dates?.confirmed_at;
        const dateStr = confirmedAt
          ? new Date(confirmedAt * 1000).toISOString().split('T')[0]
          : '';

        if (status === 'approved') {
          acc.faturamento += gross;
          acc.totalLiquido += net;
          acc.vendas++;
          acc.produtos += qty;
          // Kit "GRAVAÇÃO E MATERIAL" — receita do kit vendido
          if (/GRAVA/i.test(name)) {
            acc.kitVendas++;
            acc.kitFaturamento += gross;
          }
          if (contactId) acc.contactIds.add(contactId);
          if (dateStr) {
            if (!acc.dailyMap[dateStr]) acc.dailyMap[dateStr] = { vendas: 0, faturamento: 0 };
            acc.dailyMap[dateStr].vendas++;
            acc.dailyMap[dateStr].faturamento += gross;
          }
        } else if (status === 'refunded' || status === 'chargedback') {
          acc.reembolsos++;
        }
      }
      hasMore = !!data.has_more_pages && !!data.next_cursor;
      cursor = data.next_cursor || null;
    }
  }
}

// Cache results per range to avoid hammering the Guru API (and to survive 429s).
const CACHE_TTL_MS = 3 * 60 * 1000;
const cache = new Map<string, { at: number; result: GuruResult }>();
const inFlight = new Map<string, Promise<GuruResult>>();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate') || '2026-01-01';
  const endDate = url.searchParams.get('endDate') || new Date().toISOString().split('T')[0];
  const cacheKey = `${startDate}|${endDate}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return new Response(JSON.stringify(cached.result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  try {
    const token = Deno.env.get('GURU_API_TOKEN');
    if (!token) throw new Error('GURU_API_TOKEN not configured');


    let promise = inFlight.get(cacheKey);
    if (!promise) {
      promise = (async (): Promise<GuruResult> => {
        const sosProducts = await fetchSosProducts(token);
        const acc = {
          contactIds: new Set<string>(),
          dailyMap: {} as Record<string, { vendas: number; faturamento: number }>,
          faturamento: 0, vendas: 0, produtos: 0, reembolsos: 0, totalLiquido: 0,
          kitVendas: 0, kitFaturamento: 0,
        };
        for (const p of sosProducts) {
          await fetchProductTransactions(p.id, p.name, startDate, endDate, token, acc);
        }
        const ticketMedio = acc.vendas > 0 ? acc.faturamento / acc.vendas : 0;
        const lucroMedio = acc.vendas > 0 ? acc.totalLiquido / acc.vendas : 0;
        const daily = Object.entries(acc.dailyMap)
          .map(([date, d]) => ({ date, ...d }))
          .sort((a, b) => a.date.localeCompare(b.date));
        return {
          faturamento: acc.faturamento, vendas: acc.vendas, produtos: acc.produtos,
          clientesNovos: acc.contactIds.size, reembolsos: acc.reembolsos,
          totalLiquido: acc.totalLiquido, ticketMedio, lucroMedio, daily,
          produtosSos: sosProducts.map(({ id, name }) => ({ id, name })),
          kit: {
            vendas: acc.kitVendas,
            faturamento: acc.kitFaturamento,
            ticketMedio: acc.kitVendas > 0 ? acc.kitFaturamento / acc.kitVendas : 0,
          },
        };
      })().finally(() => inFlight.delete(cacheKey));
      inFlight.set(cacheKey, promise);
    }

    const result = await promise;
    cache.set(cacheKey, { at: Date.now(), result });
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching Guru data:', msg);
    // Serve the last known good data instead of breaking the dashboard.
    if (cached) {
      return new Response(JSON.stringify(cached.result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
