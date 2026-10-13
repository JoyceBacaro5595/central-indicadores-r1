import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { ROTA, mesmoEvento } from './rota';
import CadastroEvento from './CadastroEvento';
import CidadeCard, { type CidadeIng } from './CidadeCard';
import { META, num, brl, pct, dm, dias, type Evento, type MetaEvento, type HubEvento, type Presenca, type Cadeiras } from './DashboardRota';

const INICIO_ANO = '2026-01-01';
const mesISO = (offset: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7) + '-01'; };

/** Cards por cidade da rota (visão geral Realizado, Previsto, %), com cadastro de evento e de meta; usado na página Eventos e metas. */
export default function CardsRota() {
  const { pode } = useAuth();
  const de = mesISO(-1); const ate = mesISO(4);
  const eventos = useQuery({ queryKey: ['mv-eventos', de, ate], queryFn: () => r1Rpc<Evento[]>('eventos_listar', { p_de: de, p_ate: ate }), refetchInterval: 5 * 60_000 });
  const eventosHist = useQuery({ queryKey: ['mv-eventos-hist', ate], queryFn: () => r1Rpc<Evento[]>('eventos_listar', { p_de: INICIO_ANO, p_ate: ate }), refetchInterval: 15 * 60_000 });
  const meta = useQuery({ queryKey: ['mv-meta', de, ate], queryFn: () => r1Rpc<MetaEvento[]>('meta_eventos', { p_de: de, p_ate: ate }), refetchInterval: 15 * 60_000 });
  const hub = useQuery({ queryKey: ['mv-hub', de, ate], queryFn: () => r1Rpc<HubEvento[]>('hubspot_eventos', { p_inicio: de, p_fim: ate }), refetchInterval: 15 * 60_000 });
  const presenca = useQuery({ queryKey: ['mv-presenca', INICIO_ANO, ate], queryFn: () => r1Rpc<Presenca[]>('presenca_eventos', { p_inicio: INICIO_ANO, p_fim: ate }), enabled: pode('presenca'), refetchInterval: 5 * 60_000 });
  const detalhe = useQuery({ queryKey: ['mv-cidade-ingressos', INICIO_ANO, ate], queryFn: () => r1Rpc<CidadeIng[]>('mv_cidade_ingressos', { p_de: INICIO_ANO, p_ate: ate }), refetchInterval: 5 * 60_000 });

  const linhas = ROTA.cidades.map((c) => {
    const ev = (eventos.data ?? []).find((e) => mesmoEvento(e, c));
    const m = (meta.data ?? []).find((x) => mesmoEvento(x, c)) ?? null;
    const h = (hub.data ?? []).find((x) => mesmoEvento(x, c)) ?? null;
    const pr = (presenca.data ?? []).find((x) => mesmoEvento(x, c));
    const ocup = pr && pr.esperados > 0 ? pr.esperados : ev ? ev.realizado : null;
    return {
      c, ev: ev ?? null, m, h, inv: m ? Number(m.investimento) : null, vendas: ev ? ev.pagos : null, cort: ev ? ev.cortesias : null,
      fat: ev ? Number(ev.faturamento) : null, ocup, cap: ev?.capacidade ?? META.capacidade, qual: h ? h.compradores_qualificados : null,
      dias: dias(ev?.data_evento ?? c.data), data: ev?.data_evento ?? c.data,
    };
  });

  return (
    <section className="surface p-5 space-y-4" aria-label="Cards por cidade">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="section-label">Cards por cidade · {ROTA.nome}</span>
          <p className="text-[10px] text-muted-foreground mt-1">Visão geral por evento: Realizado, Previsto e % atingido. Os detalhes de cada assunto abrem em modais.</p>
        </div>
        <CadastroEvento eventos={eventosHist.data ?? []} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {linhas.map((l) => <CidadeCard key={l.c.cidade} l={l} det={(detalhe.data ?? []).find((x) => mesmoEvento(x, l.c)) ?? null} fmt={{ num, brl, pct, dm }} meta={META} />)}
      </div>
    </section>
  );
}
