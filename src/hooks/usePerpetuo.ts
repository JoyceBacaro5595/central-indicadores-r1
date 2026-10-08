import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';

// Perpétuo RGV · Fluxo de Tráfego: lê a RPC perpetuo_funil_v2 do Supabase r1-indicadores
// (contrato em docs/perpetuo-backend.md). Tudo que a RPC devolve nulo é "Não disponível" na tela.

export interface PerpetuoCiclo { ciclo: string; numero: number; inicio: string; fim: string; dias: number }

/** Métricas comuns a todos os grãos (total, criativo, LP). */
export interface PerpetuoMetricas {
  // Mídia
  investimento: number | null; impressoes: number | null; alcance: number | null; cliques: number | null;
  visualizacoes_lp: number | null; cpm: number | null; ctr: number | null; cpc: number | null;
  // Leads
  leads_pixel: number | null; leads_crm: number | null; mql: number | null;
  // Jornada
  contato_efetivo: number | null; sql: number | null; reunioes_agendadas: number | null; reunioes_realizadas: number | null;
  noshow: number | null; vendas: number | null; faturamento: number | null;
  // Custos
  cpl_pixel: number | null; cpl: number | null; cpmql: number | null; custo_reuniao: number | null; cac: number | null; roas: number | null;
  // Conversões (%)
  conversao_lp: number | null; taxa_mql: number | null; taxa_contato: number | null; taxa_sql: number | null;
  taxa_agendamento: number | null; taxa_comparecimento: number | null; taxa_fechamento: number | null;
  /** Chaves como a RPC devolve (rgv.aggregate_front). */
  cobertura?: {
    dias_esperados?: number; dias_carregados?: number;
    midia_completa?: boolean; crm_completo?: boolean; historico_completo?: boolean; custos_validos?: boolean;
  } | null;
}

export interface PerpetuoDia extends PerpetuoMetricas { data: string }
/** Campos descritivos opcionais; a RPC v2 ainda não os devolve (ficam "Não disponível"). */
export interface PerpetuoDescritivo {
  campanha_status?: string | null; anuncio_status?: string | null; destino_url?: string | null;
  diario?: PerpetuoDia[] | null;
  nome_curto?: string | null; thumb?: string | null; tipo?: 'imagem' | 'video' | string | null; status?: 'no_ar' | 'pausado' | string | null;
  arte_em?: string | null; campanhas?: number | null; anuncios?: number | null; pecas?: number | null; inicio?: string | null; fim?: string | null;
}
export interface PerpetuoCriativo extends PerpetuoMetricas, PerpetuoDescritivo { id: string; criativo: string | null }
export interface PerpetuoLp extends PerpetuoMetricas, PerpetuoDescritivo { id: string; pagina: string | null }
export interface PerpetuoCampanha extends PerpetuoMetricas, PerpetuoDescritivo { id: string; campanha: string | null }

/** Metas do plano do ciclo (em %). A RPC ainda não devolve; quando devolver, a tela usa. */
export interface PerpetuoMetas {
  ciclo?: string;
  conexao?: number | null; qualificacao?: number | null; agendamento?: number | null;
  comparecimento?: number | null; fechamento?: number | null; mql_venda?: number | null;
}

export interface PerpetuoFunil {
  versao?: string;
  publicacao?: {
    status?: string | null; corte_publicado?: string | null; publicado_em?: string | null;
    motivo?: string | null; solucao?: string | null;
  } | null;
  atualizado_em: string | null;
  periodo: { inicio: string; fim: string };
  ciclos: PerpetuoCiclo[];
  fontes: {
    meta_ate?: string | null; funil_ate?: string | null; meta_no_periodo?: boolean; funil_no_periodo?: boolean;
    criativo?: boolean; lp?: boolean; [k: string]: unknown;
  };
  resumo: PerpetuoMetricas;
  diario: PerpetuoDia[];
  por_campanha?: PerpetuoCampanha[] | null;
  por_criativo: PerpetuoCriativo[] | null;
  por_lp: PerpetuoLp[] | null;
  metas?: PerpetuoMetas | null;
}

export function usePerpetuo(de?: string, ate?: string) {
  return useQuery({
    queryKey: ['perpetuo-funil-v2', de, ate],
    queryFn: () => r1Rpc<PerpetuoFunil>('perpetuo_funil_v2', { p_de: de ?? null, p_ate: ate ?? null }),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
