import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { Abas, PageBody, PageHeader } from '@/components/shared';
import { useAuth } from '@/auth/AuthProvider';
import { ROTA, mesmoEvento } from './maquina-vendas/rota';
import DashboardRota, { type Presenca } from './maquina-vendas/DashboardRota';

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
/* Parâmetros padrão do app original; só valem quando o evento não tem meta/capacidade próprias. */
const PADRAO = { meta: 250, capacidade: 350, investimento: 100000, cpa: 400 };
type Tom = 'verde' | 'ambar' | 'laranja' | 'vermelho' | 'neutro';
const TOM: Record<Tom, string> = { verde: 'bg-emerald-500/15 text-emerald-400', ambar: 'bg-amber-500/15 text-amber-400', laranja: 'bg-orange-500/15 text-orange-400', vermelho: 'bg-red-500/15 text-red-400', neutro: 'bg-secondary text-muted-foreground' };
const tomPct = (v: number | null): Tom => (v == null ? 'neutro' : v >= 100 ? 'verde' : v >= 75 ? 'ambar' : v >= 50 ? 'laranja' : 'vermelho');
const tomDias = (d: number): Tom => (d <= 7 ? 'vermelho' : d <= 14 ? 'ambar' : 'neutro');
const Selo = ({ tom, children }: { tom: Tom; children: React.ReactNode }) => <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold mono ${TOM[tom]}`}>{children}</span>;

export default function MaquinaVendas() {
  const { pode } = useAuth();
  const [aba, setAba] = useState<Aba>('dashboard');
  const [de, setDe] = useState(mesISO(-1));
  const [ate, setAte] = useState(mesISO(4));
  const eventos = useQuery({ queryKey: ['mv-eventos', de, ate], queryFn: () => r1Rpc<Evento[]>('eventos_listar', { p_de: de, p_ate: ate }), refetchInterval: 5 * 60_000 });
  const meta = useQuery({ queryKey: ['mv-meta', de, ate], queryFn: () => r1Rpc<MetaEvento[]>('meta_eventos', { p_de: de, p_ate: ate }), refetchInterval: 15 * 60_000 });
  const presenca = useQuery({ queryKey: ['mv-presenca', de, ate], queryFn: () => r1Rpc<Presenca[]>('presenca_eventos', { p_inicio: de, p_fim: ate }), enabled: pode('presenca'), refetchInterval: 5 * 60_000 });
  const hub = useQuery({ queryKey: ['mv-hub', de, ate], queryFn: () => r1Rpc<HubEvento[]>('hubspot_eventos', { p_inicio: de, p_fim: ate }), refetchInterval: 15 * 60_000 });


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

        {aba === 'dashboard' && <DashboardRota eventos={eventos.data ?? []} meta={meta.data ?? []} hub={hub.data ?? []} presenca={presenca.data ?? []} carregando={eventos.isLoading || meta.isLoading} />}

        {aba === 'controle' && (() => {
          const linhas = ROTA.cidades.flatMap((c) => {
            const ev = (eventos.data ?? []).find((x) => mesmoEvento(x, c));
            if (!ev) return [];
            const dataEv = ev.data_evento ?? c.data;
            const e = { ...ev, cidade: c.cidade, data_evento: dataEv, dias_restantes: Math.round((new Date(`${dataEv}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) };
            const metaIng = e.meta_ingressos ?? PADRAO.meta;
            const cap = e.capacidade ?? PADRAO.capacidade;
            const dias = Math.max(0, e.dias_restantes);
            const falta = Math.max(0, metaIng - e.realizado);
            const m = (meta.data ?? []).find((x) => mesmoEvento(x, c));
            const inv = m?.investimento;
            const invN = inv == null ? null : Number(inv);
            const faltaR = invN == null ? null : Math.max(0, PADRAO.investimento - invN);
            return [{ e, meta: metaIng, cap, dias, falta, invN, faltaR, pctMeta: metaIng ? (100 * e.realizado) / metaIng : null, pctCap: cap ? (100 * e.realizado) / cap : null,
              porDia: falta / Math.max(1, dias), pctInv: invN == null ? null : (100 * invN) / PADRAO.investimento, invDia: faltaR == null ? null : faltaR / Math.max(1, dias) }];
          });
          const soma = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((a, l) => a + f(l), 0);
          const comInv = linhas.filter((l) => l.invN != null);
          const t = { real: soma((l) => l.e.realizado), meta: soma((l) => l.meta), cap: soma((l) => l.cap), falta: soma((l) => l.falta), porDia: soma((l) => l.porDia),
            inv: comInv.reduce((a, l) => a + (l.invN ?? 0), 0), faltaR: comInv.reduce((a, l) => a + (l.faltaR ?? 0), 0), invDia: comInv.reduce((a, l) => a + (l.invDia ?? 0), 0), metaInv: comInv.length * PADRAO.investimento };
          const th = 'py-2 pr-3 font-semibold whitespace-nowrap uppercase text-[10px] tracking-wide';
          return (
            <section className="surface p-4 overflow-x-auto">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="section-label">Painel de Controle · meta vs realizado por cidade</span>
                <span className="text-[10px] text-muted-foreground">Data de referência: <b className="text-foreground mono">{dataBR(new Date().toISOString().slice(0, 10))}</b></span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Padrão: capacidade {PADRAO.capacidade} lugares e {brl(PADRAO.investimento)} de investimento por cidade · Meta: {PADRAO.meta} vendas · CPA alvo: {brl(PADRAO.cpa)} (usados só quando o evento não tem valor próprio cadastrado).</p>
              <table className="w-full text-xs mt-3">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    {['Cidade', 'Data evento', 'Dias até evento', 'Ingressos vendidos', 'Falta (ingressos)', '% meta ing.', 'Capacidade', '% capacidade', 'Vendas/dia necessárias', 'Investimento (R$)', 'Falta (R$)', '% meta inv.', 'Investimento/dia (R$)'].map((h) => <th key={h} className={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.e.id} className="border-t border-border/50">
                      <td className="py-2 pr-3 font-semibold text-foreground whitespace-nowrap">{l.e.cidade}</td>
                      <td className="pr-3 mono">{dataBR(l.e.data_evento)}</td>
                      <td className="pr-3">{l.e.data_evento ? <Selo tom={tomDias(l.dias)}>{l.dias}</Selo> : '—'}</td>
                      <td className="pr-3 mono font-semibold text-foreground">{num(l.e.realizado)}</td>
                      <td className="pr-3 mono text-muted-foreground">{num(l.falta)}</td>
                      <td className="pr-3"><Selo tom={tomPct(l.pctMeta)}>{pct(l.pctMeta)}</Selo></td>
                      <td className="pr-3 mono">{num(l.cap)}</td>
                      <td className="pr-3"><Selo tom={tomPct(l.pctCap)}>{pct(l.pctCap)}</Selo></td>
                      <td className="pr-3 mono">{l.porDia.toFixed(1)}</td>
                      <td className="pr-3 mono">{brl(l.invN)}</td>
                      <td className="pr-3 mono text-muted-foreground">{brl(l.faltaR)}</td>
                      <td className="pr-3"><Selo tom={tomPct(l.pctInv)}>{pct(l.pctInv)}</Selo></td>
                      <td className="pr-3 mono">{brl(l.invDia)}</td>
                    </tr>
                  ))}
                  {linhas.length > 0 && (
                    <tr className="border-t-2 border-border font-bold text-foreground">
                      <td className="py-2 pr-3">TOTAL / MÉDIA</td><td className="pr-3">—</td><td className="pr-3">—</td>
                      <td className="pr-3 mono">{num(t.real)}</td><td className="pr-3 mono">{num(t.falta)}</td>
                      <td className="pr-3"><Selo tom={tomPct(t.meta ? (100 * t.real) / t.meta : null)}>{pct(t.meta ? (100 * t.real) / t.meta : null)}</Selo></td>
                      <td className="pr-3 mono">{num(t.cap)}</td>
                      <td className="pr-3"><Selo tom={tomPct(t.cap ? (100 * t.real) / t.cap : null)}>{pct(t.cap ? (100 * t.real) / t.cap : null)}</Selo></td>
                      <td className="pr-3 mono">{t.porDia.toFixed(1)}</td>
                      <td className="pr-3 mono">{comInv.length ? brl(t.inv) : '—'}</td><td className="pr-3 mono">{comInv.length ? brl(t.faltaR) : '—'}</td>
                      <td className="pr-3"><Selo tom={tomPct(t.metaInv ? (100 * t.inv) / t.metaInv : null)}>{pct(t.metaInv ? (100 * t.inv) / t.metaInv : null)}</Selo></td>
                      <td className="pr-3 mono">{comInv.length ? brl(t.invDia) : '—'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground mt-3">“—” = sem dado na origem (não é zero): cidade sem campanha Meta ligada fica sem investimento, e o total de investimento soma só as cidades com dado. Dias até o evento não ficam abaixo de 0. Rotas 43, 44 e 45 entram na etapa seguinte.</p>
            </section>
          );
        })()}

        {(aba === 'planejamento' || aba === 'criativos' || aba === 'briefing') && (
          <section className="surface p-6 text-sm text-muted-foreground">
            Esta aba entra nas próximas etapas da réplica: {aba === 'planejamento' ? 'simulador de plano e funil padrão de 40 dias.' : aba === 'criativos' ? 'top criativos e mandala de anúncios.' : 'pedidos de peça e produção.'}
          </section>
        )}
      </PageBody>
    </div>
  );
}
