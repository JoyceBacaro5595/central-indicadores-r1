import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { Abas, PageBody, PageHeader } from '@/components/shared';

/* Réplica da "Máquina de Vendas" da Lovable (pedido da Joyce, 13/10). Etapa 1: Dashboard e Painel de Controle,
   alimentados pelas RPCs da Central (eventos_listar, meta_eventos, hubspot_eventos), sem depender do back-end da Lovable. */

interface Evento {
  id: number; cidade: string; mes_evento: string; data_evento: string | null; capacidade: number | null;
  meta_ingressos: number | null; meta_faturamento: number | null; realizado: number; pagos: number; cortesias: number;
  faturamento: number; ult_7d: number; primeira_venda: string | null; dias_restantes: number; ritmo_atual: number;
  ritmo_necessario: number | null; pct_meta: number | null; pct_capacidade: number | null; situacao: string;
}
interface MetaEvento { cidade: string; mes_evento: string; campanhas: number; investimento: number; impressoes: number; cliques: number; faturamento: number; ingressos_pagos: number; roas: number | null; cpa: number | null }
interface HubEvento { cidade: string; mes_evento: string; compradores: number; compradores_qualificados: number; leads: number; leads_qualificados: number }

type Aba = 'dashboard' | 'controle' | 'planejamento' | 'criativos' | 'briefing';
const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: 'dashboard', rotulo: 'Dashboard' }, { valor: 'controle', rotulo: 'Painel de Controle' }, { valor: 'planejamento', rotulo: 'Planejamento' },
  { valor: 'criativos', rotulo: 'Painel de criativos' }, { valor: 'briefing', rotulo: 'Briefing & Produção' },
];

const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR'));
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(0)}%`);
const dataBR = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const mesISO = (offset: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7) + '-01'; };
/* Urgência da linha do tempo, como no app original: até 7 dias vermelho, até 14 amarelo, depois azul. */
const urgencia = (dias: number) => (dias < 0 ? 'text-muted-foreground' : dias <= 7 ? 'text-red-400' : dias <= 14 ? 'text-amber-400' : 'text-primary');

export default function MaquinaVendas() {
  const [aba, setAba] = useState<Aba>('dashboard');
  const [de, setDe] = useState(mesISO(-1));
  const [ate, setAte] = useState(mesISO(4));
  const eventos = useQuery({ queryKey: ['mv-eventos', de, ate], queryFn: () => r1Rpc<Evento[]>('eventos_listar', { p_de: de, p_ate: ate }), refetchInterval: 5 * 60_000 });
  const meta = useQuery({ queryKey: ['mv-meta', de, ate], queryFn: () => r1Rpc<MetaEvento[]>('meta_eventos', { p_de: de, p_ate: ate }), refetchInterval: 15 * 60_000 });
  const hub = useQuery({ queryKey: ['mv-hub', de, ate], queryFn: () => r1Rpc<HubEvento[]>('hubspot_eventos', { p_inicio: de, p_fim: ate }), refetchInterval: 15 * 60_000 });

  const lista = useMemo(() => [...(eventos.data ?? [])].sort((a, b) => (a.data_evento ?? '9999').localeCompare(b.data_evento ?? '9999')), [eventos.data]);
  const proximas = lista.filter((e) => e.data_evento && e.dias_restantes >= 0);
  const metaDe = (e: Evento) => (meta.data ?? []).find((m) => m.cidade === e.cidade && m.mes_evento === e.mes_evento);
  const hubDe = (e: Evento) => (hub.data ?? []).find((h) => h.cidade === e.cidade && h.mes_evento === e.mes_evento);

  const tot = lista.reduce((a, e) => ({ real: a.real + e.realizado, meta: a.meta + (e.meta_ingressos ?? 0), fat: a.fat + e.faturamento, cap: a.cap + (e.capacidade ?? 0) }), { real: 0, meta: 0, fat: 0, cap: 0 });
  const inv = lista.reduce((a, e) => a + Number(metaDe(e)?.investimento ?? 0), 0);

  const kpi = (label: string, valor: string, sub?: string) => (
    <div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value mono">{valor}</div>{sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}</div>
  );

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo="Máquina de Vendas · Presencial"
        subtitulo="Dashboard de performance dos eventos por cidade · Meta Ads, Guru e HubSpot"
        acoes={<>
          <input type="month" value={de.slice(0, 7)} onChange={(e) => setDe(`${e.target.value}-01`)} className="mono text-xs bg-secondary rounded px-2 py-1 text-foreground" />
          <span className="text-xs text-muted-foreground">a</span>
          <input type="month" value={ate.slice(0, 7)} onChange={(e) => setAte(`${e.target.value}-01`)} className="mono text-xs bg-secondary rounded px-2 py-1 text-foreground" />
        </>}
        onAtualizar={() => { eventos.refetch(); meta.refetch(); hub.refetch(); }}
        atualizando={eventos.isFetching}
      />
      <PageBody>
        <Abas<Aba> valor={aba} onChange={setAba} itens={ABAS} />
        {eventos.error && <div className="surface p-4 text-sm text-red-400">{(eventos.error as Error).message}</div>}

        {aba === 'dashboard' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {kpi('Eventos no período', num(lista.length))}
              {kpi('Ingressos realizados', num(tot.real), tot.meta ? `${pct((100 * tot.real) / tot.meta)} da meta de ${num(tot.meta)}` : 'sem meta cadastrada')}
              {kpi('Capacidade ocupada', tot.cap ? pct((100 * tot.real) / tot.cap) : '—', tot.cap ? `${num(tot.real)} de ${num(tot.cap)}` : 'sem capacidade cadastrada')}
              {kpi('Faturamento bruto', brl(tot.fat))}
              {kpi('Investimento Meta', meta.isLoading ? '…' : brl(inv), inv > 0 ? `ROAS ${(tot.fat / inv).toFixed(2)}x` : undefined)}
            </div>

            <section className="surface p-4">
              <span className="section-label">Próximas cidades</span>
              {proximas.length === 0 ? <div className="text-xs text-muted-foreground mt-3">Nenhum evento futuro com data cadastrada no período.</div> : (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                  {proximas.map((e) => (
                    <div key={e.id} className="rounded-lg bg-secondary/50 p-3">
                      <div className="text-xs font-semibold text-foreground">{e.cidade}</div>
                      <div className="text-[10px] text-muted-foreground mono">{dataBR(e.data_evento)}</div>
                      <div className={`text-lg font-bold mono ${urgencia(e.dias_restantes)}`}>{e.dias_restantes}d</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="surface p-4">
              <span className="section-label">Capacidade dos eventos</span>
              <div className="mt-3 space-y-2">
                {lista.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 text-xs">
                    <span className="w-40 shrink-0 text-foreground">{e.cidade}</span>
                    <div className="flex-1 h-2 rounded bg-secondary overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, e.pct_capacidade ?? 0)}%` }} />
                    </div>
                    <span className="mono w-28 text-right text-muted-foreground">{num(e.realizado)} / {e.capacidade ? num(e.capacidade) : '—'}</span>
                  </div>
                ))}
                {lista.length === 0 && !eventos.isLoading && <div className="text-xs text-muted-foreground">Sem eventos no período.</div>}
              </div>
            </section>
          </>
        )}

        {aba === 'controle' && (
          <section className="surface p-4 overflow-x-auto">
            <span className="section-label">Meta vs realizado por cidade</span>
            <table className="w-full text-xs mt-3">
              <thead>
                <tr className="text-left text-muted-foreground">
                  {['Cidade', 'Data', 'Dias', 'Ingressos', 'Meta', '% meta', 'Ritmo atual', 'Ritmo necessário', 'Faturamento', 'Investimento', 'CPA', 'ROAS', 'Leads', 'Qualificados', 'Situação'].map((h) => <th key={h} className="py-1.5 pr-3 font-semibold whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => {
                  const m = metaDe(e); const h = hubDe(e);
                  return (
                    <tr key={e.id} className="border-t border-border/50">
                      <td className="py-1.5 pr-3 text-foreground whitespace-nowrap">{e.cidade}</td>
                      <td className="pr-3 mono">{dataBR(e.data_evento)}</td>
                      <td className={`pr-3 mono ${urgencia(e.dias_restantes)}`}>{e.data_evento ? e.dias_restantes : '—'}</td>
                      <td className="pr-3 mono">{num(e.realizado)}</td>
                      <td className="pr-3 mono">{num(e.meta_ingressos)}</td>
                      <td className="pr-3 mono">{pct(e.pct_meta)}</td>
                      <td className="pr-3 mono">{num(e.ritmo_atual)}</td>
                      <td className="pr-3 mono">{num(e.ritmo_necessario)}</td>
                      <td className="pr-3 mono">{brl(e.faturamento)}</td>
                      <td className="pr-3 mono">{brl(m?.investimento)}</td>
                      <td className="pr-3 mono">{brl(m?.cpa)}</td>
                      <td className="pr-3 mono">{m?.roas == null ? '—' : `${Number(m.roas).toFixed(2)}x`}</td>
                      <td className="pr-3 mono">{num(h?.leads)}</td>
                      <td className="pr-3 mono">{num(h?.compradores_qualificados)}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{e.situacao}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-3">Células com “—” não têm dado na origem (não são zero). Rotas 43, 44 e 45 entram na etapa seguinte.</p>
          </section>
        )}

        {(aba === 'planejamento' || aba === 'criativos' || aba === 'briefing') && (
          <section className="surface p-6 text-sm text-muted-foreground">
            Esta aba entra nas próximas etapas da réplica: {aba === 'planejamento' ? 'simulador de plano e funil padrão de 40 dias.' : aba === 'criativos' ? 'top criativos e mandala de anúncios.' : 'pedidos de peça e produção.'}
          </section>
        )}
      </PageBody>
    </div>
  );
}
