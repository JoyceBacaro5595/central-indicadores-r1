import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';

/* Guarda no navegador o último resultado das leituras pesadas (sem dados pessoais), para a tela abrir na hora e atualizar por trás. */
const CHAVE = 'r1-cache-v1';
const VALIDADE_MS = 6 * 3600_000;
const PERMITIDAS = new Set([
  'perpetuo-funil-v2', 'vg-eventos', 'vg-meta', 'vg-cidade-ingressos', 'vg-ingressos-canal',
  'mv-eventos', 'mv-meta', 'mv-eventos-hist', 'mv-cadeiras', 'mv-meta-ano', 'eventos', 'meta-eventos', 'fmm-meta',
]);

export function restaurarCache(qc: QueryClient) {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return;
    const { t, estado } = JSON.parse(bruto);
    if (Date.now() - t > VALIDADE_MS) { localStorage.removeItem(CHAVE); return; }
    hydrate(qc, estado);
  } catch { /* sem cache: carrega normal */ }
}

export function persistirCache(qc: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return qc.getQueryCache().subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const estado = dehydrate(qc, { shouldDehydrateQuery: (q) => q.state.status === 'success' && PERMITIDAS.has(String(q.queryKey[0])) });
        localStorage.setItem(CHAVE, JSON.stringify({ t: Date.now(), estado }));
      } catch { /* cheio ou bloqueado: segue sem guardar */ }
    }, 2000);
  });
}

/** Ao sair da conta, o resultado guardado não pode ficar para o próximo usuário. */
export function limparCachePersistido() {
  try { localStorage.removeItem(CHAVE); } catch { /* nada a limpar */ }
}
