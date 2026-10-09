// Captura a foto de cada página de destino (LP) do Perpétuo e grava em public/lp/<hash>.jpg,
// com o mapa lp_id -> arquivo em src/data/lpFotos.json. Pedido de Joyce em 09/10/2026.
// Uso: node scripts/capturar-lps.mjs [scripts/lps.json]  (lista de lp_id = "lp:<url>")
// Requer o pacote playwright e um Chromium (PLAYWRIGHT_BROWSERS_PATH ou CHROMIUM_PATH).
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const lista = JSON.parse(readFileSync(process.argv[2] || 'scripts/lps.json', 'utf8'));
const base = (id) => { const u = new URL(id.replace(/^lp:/, '')); u.search = ''; u.hash = ''; return u.toString(); };
const mapaPath = 'src/data/lpFotos.json';
const mapa = existsSync(mapaPath) ? JSON.parse(readFileSync(mapaPath, 'utf8')) : {};
mkdirSync('public/lp', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1700 }, deviceScaleFactor: 1, locale: 'pt-BR' });
const feitos = new Map();
for (const id of lista) {
  let url; try { url = base(id); } catch { console.log('ignorado (não é URL):', id); continue; }
  if (!/^https?:\/\/[^/]*metodorgv\.com\.br\//.test(url)) { console.log('ignorado (fora do domínio das LPs):', url); continue; }
  const arquivo = `lp/${createHash('sha1').update(url).digest('hex').slice(0, 12)}.jpg`;
  if (!feitos.has(url)) {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `public/${arquivo}`, type: 'jpeg', quality: 70, fullPage: true, clip: undefined });
      feitos.set(url, arquivo); console.log('ok', url, '->', arquivo);
    } catch (e) { console.log('falhou', url, String(e).slice(0, 120)); feitos.set(url, null); }
    await page.close();
  }
  if (feitos.get(url)) mapa[id] = { arquivo: '/' + feitos.get(url), url, capturado_em: new Date().toISOString().slice(0, 10) };
}
await browser.close();
writeFileSync(mapaPath, JSON.stringify(mapa, null, 1) + '\n');
console.log('mapa com', Object.keys(mapa).length, 'páginas');
