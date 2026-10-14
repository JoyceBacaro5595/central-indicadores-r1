import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { PageBody, PageHeader } from '@/components/shared';
import { useAuth } from '@/auth/AuthProvider';
import { usePerpetuo, usePerpetuoVendasClubeTrator } from '@/hooks/usePerpetuo';

/* Visão geral do grupo, página inicial do app (pedido da Joyce, 14/10): fundo preto e cards no layout do Dashboard da Lovable
   (rótulo pequeno em maiúsculas, valor em destaque), com os números reais do banco. Fica acima de Máquina de Vendas. */
const INICIO_ANO = '2026-01-01';
const hoje = () => new Date().toISOString().slice(0, 10);
const mesISO = (offset: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7) + '-01'; };

/* Preto do Dashboard da Lovable: fundo 8%, cards 11%, bordas 18% (mesmas variáveis do tema, só nesta página). */
const TEMA_PRETO = { '--background': '0 0% 8%', '--card': '0 0% 11%', '--secondary': '0 0% 15%', '--muted': '0 0% 15%', '--border': '0 0% 18%' } as React.CSSProperties;

const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR'));
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const roasTxt = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`);

type Variante = 'padrao' | 'primario' | 'sucesso' | 'alerta';
const COR_VALOR: Record<Variante, string> = { padrao: 'text-foreground', primario: 'text-primary-foreground', sucesso: 'text-emerald-400', alerta: 'text-amber-400' };

function KpiCard({ rotulo, valor, variante = 'padrao' }: { rotulo: string; valor: string; variante?: Variante }) {
  return (
    <div className={`rounded-lg border flex flex-col justify-center px-3 py-2.5 gap-0.5 min-w-0 ${variante === 'primario' ? 'border-red-500/30 bg-gradient-to-br from-red-600 to-red-700' : 'bg-card border-border'}`}>
      <span className={`text-[9px] font-medium uppercase tracking-wider truncate ${variante === 'primario' ? 'text-white/70' : 'text-muted-foreground'}`}>{rotulo}</span>
      <span className={`font-bold tracking-tight text-sm whitespace-nowrap ${variante === 'primario' ? 'text-white' : COR_VALOR[variante]}`}>{valor}</span>
    </div>
  );
}

function Bloco({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{titulo}{nota && <span className="ml-2 normal-case tracking-normal font-normal">{nota}</span>}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">{children}</div>
    </section>
  );
}

interface Evento { realizado: number; pagos: number; cortesias: number; faturamento: number }
interface MetaEvento { investimento: number; impressoes: number; cliques: number; faturamento: number; ingressos_pagos: number }
const soma = <T,>(l: T[] | undefined, f: (x: T) => number) => (l ?? []).reduce((s, x) => s + (f(x) || 0), 0);

export default function VisaoGeral() {
  const { pode } = useAuth();
  const ate = mesISO(4);
  const eventos = useQuery({ queryKey: ['vg-eventos', ate], queryFn: () => r1Rpc<Evento[]>('eventos_listar', { p_de: INICIO_ANO, p_ate: ate }), refetchInterval: 5 * 60_000, enabled: pode('eventos') });
  const meta = useQuery({ queryKey: ['vg-meta', ate], queryFn: () => r1Rpc<MetaEvento[]>('meta_eventos', { p_de: INICIO_ANO, p_ate: ate }), refetchInterval: 15 * 60_000, enabled: pode('eventos') });
  const perp = usePerpetuo(INICIO_ANO, hoje(), pode('perpetuo'));
  const ct = usePerpetuoVendasClubeTrator(INICIO_ANO, hoje(), pode('perpetuo'));

  const pagos = soma(eventos.data, (e) => e.pagos), cortesias = soma(eventos.data, (e) => e.cortesias);
  const fatMV = soma(eventos.data, (e) => e.faturamento);
  const invMV = soma(meta.data, (m) => m.investimento), impMV = soma(meta.data, (m) => m.impressoes), cliMV = soma(meta.data, (m) => m.cliques);
  const temMV = eventos.data != null && meta.data != null;

  const r = perp.data?.resumo;
  const clube = ct.data?.clube_r1, trator = ct.data?.trator, semProd = ct.data?.sem_produto;
  const vRGV = r?.vendas ?? null;
  const vTotal = r && ct.data ? (vRGV ?? 0) + (clube?.vendas ?? 0) + (trator?.vendas ?? 0) + (semProd?.vendas ?? 0) : null;
  const fTotal = r && ct.data ? (r.faturamento ?? 0) + (clube?.faturamento ?? 0) + (trator?.faturamento ?? 0) + (semProd?.faturamento ?? 0) : null;
  const inv = r?.investimento ?? null;
  const cac = (q: number | null | undefined) => (inv != null && q != null ? brl(q > 0 ? inv / q : 0) : '—');

  return (
    <div className="min-h-screen bg-background" style={TEMA_PRETO}>
      <PageHeader titulo="Visão geral" subtitulo={`Todas as frentes do Grupo R1 · ${INICIO_ANO.split('-').reverse().join('/')} até hoje`} />
      <PageBody>
        <div className="space-y-5">
          {pode('eventos') && (
            <div className="space-y-3 rounded-lg border border-border bg-card/30 p-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Máquina de Vendas · Presencial</span>
              <Bloco titulo="Dados de vendas (Guru)">
                <KpiCard rotulo="Faturamento" valor={temMV ? brl(fatMV) : '—'} />
                <KpiCard rotulo="Vendas" valor={temMV ? num(pagos + cortesias) : '—'} />
                <KpiCard rotulo="Vendas pagas" valor={temMV ? num(pagos) : '—'} />
                <KpiCard rotulo="Cortesias" valor={temMV ? num(cortesias) : '—'} />
                <KpiCard rotulo="Ticket médio" valor={temMV ? brl(pagos > 0 ? fatMV / pagos : 0) : '—'} />
                <KpiCard rotulo="ROAS" valor={temMV ? roasTxt(invMV > 0 ? fatMV / invMV : 0) : '—'} variante={invMV > 0 && fatMV / invMV >= 1 ? 'sucesso' : 'alerta'} />
              </Bloco>
              <Bloco titulo="Meta Ads">
                <KpiCard rotulo="Investimento" valor={temMV ? brl(invMV) : '—'} variante="primario" />
                <KpiCard rotulo="Impressões" valor={temMV ? num(impMV) : '—'} />
                <KpiCard rotulo="CPM" valor={temMV ? brl(impMV > 0 ? (invMV / impMV) * 1000 : 0) : '—'} />
                <KpiCard rotulo="CTR" valor={temMV ? pct(impMV > 0 ? (cliMV / impMV) * 100 : 0) : '—'} />
                <KpiCard rotulo="CAC geral (vendas pagas)" valor={temMV ? brl(pagos > 0 ? invMV / pagos : 0) : '—'} variante="primario" />
              </Bloco>
            </div>
          )}
          {pode('perpetuo') && (
            <div className="space-y-3 rounded-lg border border-border bg-card/30 p-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Perpétuo RGV · Fluxo Marketing</span>
              <Bloco titulo="Funil" nota="Meta Ads e HubSpot">
                <KpiCard rotulo="Investimento" valor={brl(inv)} variante="primario" />
                <KpiCard rotulo="Lead no CRM" valor={num(r?.leads_crm)} />
                <KpiCard rotulo="MQL" valor={num(r?.mql)} />
                <KpiCard rotulo="SQL" valor={num(r?.sql)} />
                <KpiCard rotulo="Reuniões realizadas" valor={num(r?.reunioes_realizadas)} />
                <KpiCard rotulo="Custo por MQL" valor={brl(r?.cpmql)} />
              </Bloco>
              <Bloco titulo="Vendas" nota="quantidade, faturamento e CAC">
                <KpiCard rotulo="Vendas RGV" valor={num(vRGV)} />
                <KpiCard rotulo="Faturamento RGV" valor={brl(r?.faturamento)} />
                <KpiCard rotulo="CAC RGV" valor={cac(vRGV)} variante="primario" />
                <KpiCard rotulo="Vendas Clube R1" valor={num(clube?.vendas)} />
                <KpiCard rotulo="Faturamento Clube R1" valor={brl(clube?.faturamento)} />
                <KpiCard rotulo="CAC Clube R1" valor={cac(clube?.vendas)} variante="primario" />
                <KpiCard rotulo="Vendas Trator" valor={num(trator?.vendas)} />
                <KpiCard rotulo="Faturamento Trator" valor={brl(trator?.faturamento)} />
                <KpiCard rotulo="CAC Trator" valor={cac(trator?.vendas)} variante="primario" />
                <KpiCard rotulo="Total de vendas" valor={num(vTotal)} />
                <KpiCard rotulo="Faturamento total" valor={brl(fTotal)} />
                <KpiCard rotulo="CAC total" valor={cac(vTotal)} variante="primario" />
                <KpiCard rotulo="ROAS total" valor={inv && fTotal != null ? roasTxt(fTotal / inv) : '—'} variante={inv && fTotal != null && fTotal / inv >= 1 ? 'sucesso' : 'alerta'} />
              </Bloco>
            </div>
          )}
        </div>
      </PageBody>
    </div>
  );
}
