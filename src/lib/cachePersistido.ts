import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

/* Guarda no navegador o último resultado das leituras pesadas (sem dados pessoais), para a tela abrir na hora e atualizar por trás.
   O guardado pertence a um usuário e só volta para ele, com a permissão que ele tem agora. */
const CHAVE = 'r1-cache-v2';
const VALIDADE_MS = 6 * 3600_000;
/** Consulta guardada -> recurso que o usuário precisa ter para recebê-la de volta. */
const RECURSO: Record<string, string> = {
  'perpetuo-funil-v2': 'perpetuo',
  'vg-eventos': 'eventos', 'vg-meta': 'eventos', 'vg-cidade-ingressos': 'eventos', 'vg-ingressos-canal': 'eventos',
  'mv-eventos': 'eventos', 'mv-meta': 'eventos', 'mv-eventos-hist': 'eventos', 'mv-cadeiras': 'eventos', 'mv-meta-ano': 'eventos',
  'eventos': 'eventos', 'meta-eventos': 'eventos', 'fmm-meta': 'eventos',
  /* só totais por cidade/ciclo (sem nome, e-mail ou telefone) */
  'mv-hub': 'eventos', 'mv-meta-v2': 'eventos', 'fmm-meta-v2': 'eventos', 'hubspot-eventos': 'eventos', 'qualificacao-faixas': 'eventos',
  'plano-eventos': 'eventos', 'planejamento-rotas': 'eventos', 'mv-presenca': 'presenca', 'checkins-resumo': 'presenca',
  'mv-cidade-ingressos': 'eventos', 'fmm-vendas': 'eventos', 'fmm-eventos': 'eventos', 'meta-ciclo': 'perpetuo',
  /* estado das sincronizações e alertas (sem dados pessoais) */
  'gerenciador': 'gerenciador', 'gerenciador-alertas': 'gerenciador',
  'vg-black10x': 'painel', 'central-vendas-cidade-canal': 'painel', 'recuperacao-resumo': 'recuperacao',
};

let cliente: QueryClient | null = null;
let usuario: string | null = null;
let desligar: (() => void) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function guardar() {
  const qc = cliente;
  if (!qc || !usuario) return;
  try {
    const agora = Date.now();
    const estado = dehydrate(qc, {
      shouldDehydrateQuery: (q) => q.state.status === 'success' && String(q.queryKey[0]) in RECURSO && agora - q.state.dataUpdatedAt < VALIDADE_MS,
    });
    localStorage.setItem(CHAVE, JSON.stringify({ u: usuario, estado }));
  } catch { /* cheio ou bloqueado: segue sem guardar */ }
}

/** Chamar depois que o perfil do usuário é conhecido: devolve o guardado dele e passa a guardar. */
export function iniciarCache(qc: QueryClient, userId: string, permissoes: string[]) {
  cliente = qc;
  usuario = userId;
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      const { u, estado } = JSON.parse(bruto) as { u: string; estado: DehydratedState };
      if (u === userId) {
        const agora = Date.now();
        hydrate(qc, {
          ...estado,
          queries: estado.queries.filter((q) => {
            const recurso = RECURSO[String(q.queryKey[0])];
            return !!recurso && permissoes.includes(recurso) && agora - q.state.dataUpdatedAt < VALIDADE_MS;
          }),
        });
      } else {
        localStorage.removeItem(CHAVE);
      }
    }
  } catch { /* sem cache: carrega normal */ }
  desligar?.();
  desligar = qc.getQueryCache().subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(guardar, 2000);
  });
}

/** Ao sair da conta (ou sessão expirada), nada fica para o próximo usuário: nem no navegador, nem na memória. */
export function limparCachePersistido() {
  clearTimeout(timer);
  desligar?.();
  desligar = undefined;
  usuario = null;
  try {
    localStorage.removeItem(CHAVE);
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith('r1-rec-cards:')) localStorage.removeItem(k); }
  } catch { /* nada a limpar */ }
  cliente?.clear();
}
