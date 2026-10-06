import { useQuery } from '@tanstack/react-query';

// Central de ingressos lê o Supabase r1-indicadores (Guru sincronizada de hora em hora).
// A função RPC devolve só agregados, sem dados pessoais de comprador.
import { R1_URL, r1Headers } from '@/integrations/r1/client';

export interface CentralEvento {
  evento: string;
  linha: string;
  cidade_evento: string | null;
  mes_evento: string | null;
  ingressos_comuns_pagos: number | null;
  ingressos_vip_pagos: number | null;
  cortesias: number | null;
  ingressos_total: number | null;
  pedidos_pagos: number;
  compradores_unicos: number;
  faturamento_bruto: number | null;
  faturamento_liquido: number | null;
  ticket_medio_ingresso: number | null;
  reembolsos: number;
  valor_reembolsado: number | null;
  pendentes: number;
  nao_convertidos: number;
  conversao_checkout_pct: number | null;
  ingressos_grazi: number | null;
  ingressos_ult_7d: number | null;
  primeira_venda: string | null;
  ultima_venda: string | null;
}

export interface CentralIngressos {
  atualizado_em: string;
  periodo: { inicio: string; fim: string };
  resumo: {
    ingressos_pagos: number;
    ingressos_comuns: number;
    ingressos_vip: number;
    cortesias: number;
    pedidos_pagos: number;
    compradores_unicos: number;
    faturamento_bruto: number;
    faturamento_liquido: number;
    desconto: number;
    reembolsos: number;
    valor_reembolsado: number;
    pendentes: number;
    nao_convertidos: number;
    pedidos_iniciados: number;
    com_utm: number;
  };
  ritmo: { hoje: number; ontem: number; ult_7d: number; '7d_anteriores': number; fat_hoje: number };
  eventos: CentralEvento[];
  diario: { data: string; comuns: number; vip: number; cortesias: number; faturamento: number }[];
  canais: { canal: string; ingressos: number | null; cortesias: number | null; faturamento: number }[];
  pagamento: { metodo: string; pedidos: number; faturamento: number; parcelas_media: number | null }[];
  origem: { origem: string; pedidos: number; ingressos: number }[];
  uf_comprador: { uf: string; ingressos: number }[];
  reembolsos: { evento: string; qtd: number; valor: number }[];
  qualidade: { sem_cidade: number; sem_mes: number };
}

async function fetchCentral(inicio: string, fim: string): Promise<CentralIngressos> {
  const res = await fetch(`${R1_URL}/rest/v1/rpc/central_ingressos`, {
    method: 'POST',
    headers: await r1Headers(),
    body: JSON.stringify({ p_inicio: inicio, p_fim: fim }),
  });
  if (!res.ok) throw new Error(`Falha ao carregar central: ${res.status} ${await res.text()}`);
  return res.json();
}

export function useCentralIngressos(inicio: string, fim: string) {
  return useQuery({
    queryKey: ['central-ingressos', inicio, fim],
    queryFn: () => fetchCentral(inicio, fim),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
}
