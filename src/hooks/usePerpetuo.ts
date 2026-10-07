import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';

// Perpétuo RGV: agregados de mídia (conta Meta PERPETUO RGV) e funil (MQL → reunião → venda) vindos do
// Supabase r1-indicadores. Quebras por criativo e por LP chegam nulas enquanto o ETL não traz esse nível.

export interface PerpetuoCiclo { ciclo: string; numero: number; inicio: string; fim: string; dias: number }

export interface PerpetuoResumo {
  investimento: number | null; impressoes: number | null; cliques: number | null; alcance: number | null;
  cpm: number | null; ctr: number | null; cpc: number | null;
  mql: number | null; reunioes_agendadas: number | null; reunioes_realizadas: number | null; noshow: number | null;
  vendas: number | null; faturamento: number | null;
  cpl: number | null; custo_reuniao: number | null; cac: number | null; roas: number | null;
}

export interface PerpetuoDia {
  data: string; investimento: number | null; impressoes: number | null; cliques: number | null;
  mql: number | null; reunioes_realizadas: number | null; vendas: number | null; faturamento: number | null;
}

export interface PerpetuoCriativo {
  criativo: string; investimento: number | null; impressoes: number | null; cliques: number | null; ctr: number | null;
  leads: number | null; mql: number | null; cpl: number | null; vendas: number | null;
}

export interface PerpetuoLp {
  pagina: string; visualizacoes: number | null; leads: number | null; conversao: number | null; mql: number | null; vendas: number | null;
}

export interface PerpetuoFunil {
  atualizado_em: string | null;
  periodo: { inicio: string; fim: string };
  ciclos: PerpetuoCiclo[];
  fontes: { meta_ate: string | null; funil_ate: string | null; meta_no_periodo: boolean; funil_no_periodo: boolean; criativo: boolean; lp: boolean };
  resumo: PerpetuoResumo;
  diario: PerpetuoDia[];
  por_criativo: PerpetuoCriativo[] | null;
  por_lp: PerpetuoLp[] | null;
}

export function usePerpetuo(de?: string, ate?: string) {
  return useQuery({
    queryKey: ['perpetuo-funil-v2', de, ate],
    queryFn: async () => {
      type MetricasV2 = { leads_crm: number | null; visualizacoes_lp: number | null; conversao_lp: number | null; cpmql: number | null };
      type RespostaV2 = Omit<PerpetuoFunil, 'resumo' | 'por_criativo' | 'por_lp'> & {
        resumo: PerpetuoResumo & MetricasV2;
        por_criativo: (PerpetuoCriativo & MetricasV2)[] | null;
        por_lp: (PerpetuoLp & MetricasV2)[] | null;
      };
      const data = await r1Rpc<RespostaV2>('perpetuo_funil_v2', { p_de: de ?? null, p_ate: ate ?? null });
      return {
        ...data,
        // O cartão existente representa custo por MQL; CPL continua próprio nas tabelas.
        resumo: { ...data.resumo, cpl: data.resumo.cpmql },
        por_criativo: data.por_criativo?.map((linha) => ({ ...linha, leads: linha.leads_crm })) ?? null,
        por_lp: data.por_lp?.map((linha) => ({ ...linha, leads: linha.leads_crm, visualizacoes: linha.visualizacoes_lp, conversao: linha.conversao_lp })) ?? null,
      };
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
