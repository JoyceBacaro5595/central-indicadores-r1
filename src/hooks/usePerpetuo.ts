import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
  /** Calculados pelo backend (rgv.funil_calc, 08/10): MQL → venda e custos por etapa = investimento / quantidade. */
  taxa_mql_venda?: number | null; custo_contato?: number | null; custo_sql?: number | null; custo_agendado?: number | null;
  /** Chaves como a RPC devolve (rgv.aggregate_front). Custos por etapa só valem com `custos_validos === true`. */
  cobertura?: {
    dias_esperados?: number; dias_carregados?: number;
    midia_completa?: boolean; crm_completo?: boolean; historico_completo?: boolean; custos_validos?: boolean;
  } | null;
  /** Motivo, vindo do backend, de as taxas entre etapas estarem nulas (ex.: coorte não comparável). */
  taxas_observacao?: string | null;
}

export interface PerpetuoDia extends PerpetuoMetricas { data: string }
/** Campos descritivos por item. Contrato observado na RPC v2 (08/10/2026): `thumb` (com `imagem_url`,
 * `preview_url` e `thumbnail_url` como cópias), `destino_url`, `status`/`campanha_status`/`anuncio_status`
 * com 'no_ar' | 'pausado', `atribuicao_completa` e `motivo_indisponivel`. O que faltar fica "Não disponível". */
export interface PerpetuoDescritivo {
  campanha_status?: 'no_ar' | 'pausado' | string | null; anuncio_status?: 'no_ar' | 'pausado' | string | null; destino_url?: string | null;
  imagem_url?: string | null; preview_url?: string | null; thumbnail_url?: string | null;
  /** false = funil CRM deste item ainda não tem atribuição comprovada; `motivo_indisponivel` explica. */
  atribuicao_completa?: boolean | null; motivo_indisponivel?: string | null;
  /** Dia a dia do item. Para peças (09/10/2026) vem só a mídia do Meta por dia; o que faltar fica "Não disponível". */
  diario?: (Partial<PerpetuoMetricas> & { data: string; midia_completa?: boolean | null })[] | null;
  /** IDs dos anúncios somados na peça (abre o Gerenciador de Anúncios já filtrado). */
  anuncio_ids?: string[] | null;
  /** Link de visualização do anúncio de referência da peça (preview_shareable_link do Meta). */
  anuncio_link?: string | null;
  /** Página: campanhas que levam a ela, com o investimento do período (maior primeiro). */
  campanhas_lista?: { id: string; nome: string | null; investimento: number | null; status?: string | null }[] | null;
  nome_curto?: string | null; thumb?: string | null; tipo?: 'imagem' | 'video' | string | null; status?: 'no_ar' | 'pausado' | string | null;
  arte_em?: string | null; campanhas?: number | null; anuncios?: number | null; pecas?: number | null; inicio?: string | null; fim?: string | null;
  /** Peça criativa: código do anúncio mais recente, todos os códigos somados e quantas variações de nome a peça tem. */
  codigo?: string | null; codigos?: string[] | null; variacoes?: number | null; padrao?: boolean | null;
}
export interface PerpetuoCriativo extends PerpetuoMetricas, PerpetuoDescritivo { id: string; criativo: string | null }
export interface PerpetuoLp extends PerpetuoMetricas, PerpetuoDescritivo { id: string; pagina: string | null }
export interface PerpetuoCampanha extends PerpetuoMetricas, PerpetuoDescritivo { id: string; campanha: string | null }

/** Metas do plano do ciclo (em %). A RPC ainda não devolve; quando devolver, a tela usa. */
export interface PerpetuoMetas {
  ciclo?: string; numero?: number; fonte?: string | null;
  conexao?: number | null; qualificacao?: number | null; agendamento?: number | null;
  comparecimento?: number | null; fechamento?: number | null; mql_venda?: number | null;
}

/** Qualidade geral do lote publicado. */
export interface PerpetuoQualidade {
  motivo?: string | null; atribuicao_completa?: boolean | null;
  periodo_completo_inicio?: string | null; periodo_completo_fim?: string | null;
  /** Parcial em tempo real (09/10/2026): dias depois do corte publicado, recalculados a cada meia hora pelo cron. */
  parcial?: boolean | null; parcial_ate?: string | null; parcial_atualizado_em?: string | null;
  parcial_meta_coletado_em?: string | null; parcial_hubspot_em?: string | null;
}

/** Horas de atualização das fontes e do último lote publicado (rgv.fontes_atualizacao). */
export interface PerpetuoFontesAtualizacao {
  hubspot_atualizado_em?: string | null; hubspot_ultima_execucao?: string | null;
  meta_coletado_em?: string | null; meta_ultimo_dia?: string | null;
  lote_publicado_em?: string | null; lote_corte?: string | null;
  lote_proximo?: { status?: string | null; quando?: string | null; motivo?: string | null } | null;
  /** Última verificação do cron horário (minuto 00) e a próxima prevista. */
  verificacao_ultima?: string | null; verificacao_proxima?: string | null; verificacao_cron?: string | null;
  capacidade?: { ok?: boolean; db_bytes?: number; limit_bytes?: number } | null;
}

/** Cobertura da atribuição por anúncio (nome do anúncio na UTM do negócio) no período. */
export interface PerpetuoAtribuicao { leads_com_campanha?: number; leads_com_anuncio?: number; leads_sem_anuncio?: number }

export interface PerpetuoFunil {
  versao?: string | number;
  atribuicao?: PerpetuoAtribuicao | null;
  fontes_atualizacao?: PerpetuoFontesAtualizacao | null;
  qualidade?: PerpetuoQualidade | null;
  publicacao?: {
    status?: string | null; corte_publicado?: string | null; publicado_em?: string | null;
    motivo?: string | null; solucao?: string | null;
  } | null;
  atualizado_em: string | null;
  periodo: { inicio: string; fim: string; fim_solicitado?: string | null; corte_publicado?: string | null; parcial?: boolean };
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

export function usePerpetuo(de?: string, ate?: string, habilitado = true) {
  return useQuery({
    queryKey: ['perpetuo-funil-v2', de, ate],
    queryFn: () => r1Rpc<PerpetuoFunil>('perpetuo_funil_v2', { p_de: de ?? null, p_ate: ate ?? null }),
    enabled: habilitado,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
