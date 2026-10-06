import { useQuery } from '@tanstack/react-query';

// Relatório de vendas de ingressos (Supabase r1-indicadores, RPC public.relatorio_ingressos).
// Todos os status entram; aprovados, reembolsos e não convertidos vêm separados em cada linha.
import { R1_URL, r1Headers } from '@/integrations/r1/client';

export interface RelatorioLinha {
  chave: string;
  pedidos: number;
  ingressos: number;
  pedidos_aprovados: number;
  ingressos_aprovados: number;
  ingressos_pagos: number;
  vip_pagos: number;
  cortesias: number;
  compradores: number;
  faturamento_bruto: number;
  faturamento_liquido: number;
  ticket_medio: number | null;
  reembolsos: number;
  valor_reembolsado: number;
  nao_convertidos: number;
  pendentes: number;
  conversao_pct: number | null;
}

export interface RelatorioCidadeMes {
  cidade: string;
  mes: string;
  ingressos_aprovados: number;
  ingressos_pagos: number;
  cortesias: number;
  faturamento_bruto: number;
}

export interface RelatorioFiltros {
  linha?: string | null;
  cidade?: string | null;
  tipo?: string | null;
  pagamento?: string | null;
  status?: string | null;
}

export interface RelatorioIngressos {
  atualizado_em: string;
  gerado_em: string;
  periodo: { inicio: string; fim: string };
  total: RelatorioLinha | null;
  por_mes: RelatorioLinha[];
  por_cidade: RelatorioLinha[];
  por_tipo: RelatorioLinha[];
  por_canal: RelatorioLinha[];
  por_linha: RelatorioLinha[];
  por_pagamento: RelatorioLinha[];
  por_status: RelatorioLinha[];
  por_parcelas: RelatorioLinha[];
  cidade_mes: RelatorioCidadeMes[];
  opcoes: { linhas: string[]; cidades: string[] };
}

async function fetchRelatorio(inicio: string, fim: string, f: RelatorioFiltros): Promise<RelatorioIngressos> {
  const res = await fetch(`${R1_URL}/rest/v1/rpc/relatorio_ingressos`, {
    method: 'POST',
    headers: await r1Headers(),
    body: JSON.stringify({
      p_inicio: inicio,
      p_fim: fim,
      p_linha: f.linha || null,
      p_cidade: f.cidade || null,
      p_tipo: f.tipo || null,
      p_pagamento: f.pagamento || null,
      p_status: f.status || null,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao gerar relatório: ${res.status} ${await res.text()}`);
  return res.json();
}

export function useRelatorioIngressos(inicio: string, fim: string, filtros: RelatorioFiltros) {
  return useQuery({
    queryKey: ['relatorio-ingressos', inicio, fim, filtros],
    queryFn: () => fetchRelatorio(inicio, fim, filtros),
    refetchInterval: 15 * 60 * 1000,
    staleTime: 60 * 1000,
  });
}
