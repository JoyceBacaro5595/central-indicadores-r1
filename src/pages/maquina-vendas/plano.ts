import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { META } from './DashboardRota';
import { ROTA } from './rota';

/** Metas cadastradas no Planejamento para uma rota (config.plano_rota). */
export interface PlanoRota {
  rota: string; investimento: number | null; vendas: number | null; cortesias: number | null; total_partic: number | null; capacidade: number | null;
  ticket: number | null; cac: number | null; cac_qualif: number | null; qualif: number | null; cpm: number | null; ctr: number | null;
}

const n = (v: number | null | undefined) => (v == null ? undefined : Number(v));

/** Carrega o plano e, quando a rota em andamento tem metas cadastradas, sobrescreve os padrões do código (META).
   Sem plano cadastrado (ou antes da tabela existir no banco), valem os padrões. */
export function usePlanoRota() {
  const q = useQuery({ queryKey: ['planejamento-rotas'], queryFn: () => r1Rpc<PlanoRota[]>('planejamento_rotas'), retry: false, staleTime: 5 * 60_000 });
  const p = (q.data ?? []).find((x) => x.rota === ROTA.nome);
  if (p) {
    const t = { investimento: n(p.investimento), vendas: n(p.vendas), cortesias: n(p.cortesias), totalPartic: n(p.total_partic), capacidade: n(p.capacidade),
      ticket: n(p.ticket), cac: n(p.cac), cacQualif: n(p.cac_qualif), qualif: n(p.qualif), cpm: n(p.cpm), ctr: n(p.ctr) };
    for (const [k, v] of Object.entries(t)) if (v !== undefined) (META as Record<string, number>)[k] = v;
    META.receita = META.vendas * META.ticket;
  }
  return { ...q, plano: p ?? null };
}
