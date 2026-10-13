import { useState } from 'react';
import { ROTA, mesmoEvento } from './rota';
import { CalendarClock, ChevronDown, History, Target, Users, Zap } from 'lucide-react';

/* Dashboard da Máquina de Vendas (réplica da aba "Dashboard" do app da Lovable), com dados da Central.
   Onde a Central ainda não coleta o dado (visitas à LP, checkouts, VIP, origem da cortesia) aparece "—", nunca zero. */

export interface Evento {
  id: number; cidade: string; mes_evento: string; data_evento: string | null; capacidade: number | null; meta_ingressos: number | null;
  realizado: number; pagos: number; cortesias: number; faturamento: number; primeira_venda: string | null;
}
export interface MetaEvento { cidade: string; mes_evento: string; investimento: number; impressoes: number; cliques: number }
export interface HubEvento { cidade: string; mes_evento: string; compradores: number; compradores_hubspot: number; compradores_qualificados: number }
export interface Presenca { cidade: string; mes_evento: string; esperados: number; presentes: number }

/* Metas padrão por cidade (DEFAULT_CITY_GOALS e FUNNEL_GOALS do original). */
const META = { investimento: 100000, vendas: 250, cortesias: 100, totalPartic: 350, ticket: 97, receita: 250 * 97, cac: 400, cacQualif: 800, capacidade: 350, cpm: 36, ctr: 1, qualif: 50 };
const PLANO = { receitaRota: 218250 };

const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const pct = (v: number | null | undefined, c = 0) => (v == null ? '—' : `${v.toFixed(c)}%`);
const dm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const hojeISO = () => new Date().toISOString().slice(0, 10);
const dias = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); const h = new Date(); return Math.round((new Date(y, m - 1, d).getTime() - new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime()) / 86400000); };
const somaN = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
const div = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : a / b);

type Tom = 'ok' | 'warn' | 'bad' | 'neutro';
const COR: Record<Tom, string> = { ok: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-red-400', neutro: 'text-foreground' };
const BAR: Record<Tom, string> = { ok: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-500', neutro: 'bg-muted-foreground' };
const tomPct = (p: number | null): Tom => (p == null ? 'neutro' : p >= 100 ? 'ok' : p >= 70 ? 'warn' : p >= 40 ? 'warn' : 'bad');

function Cartao({ rotulo, valor, sub, tom = 'neutro' }: { rotulo: string; valor: string; sub?: string; tom?: Tom }) {
  return <div className="rounded-lg border border-border bg-secondary/30 p-3 flex flex-col gap-1"><span className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold">{rotulo}</span><span className={`text-sm font-bold ${COR[tom]}`}>{valor}</span>{sub && <span className="text-[9px] text-muted-foreground">{sub}</span>}</div>;
}
function Meta({ rotulo, atual, meta, fmt, menorMelhor, barra = true }: { rotulo: string; atual: number | null; meta: number; fmt: (v: number | null) => string; menorMelhor?: boolean; barra?: boolean }) {
  const p = atual == null || !meta ? null : (100 * atual) / meta;
  const tom: Tom = p == null ? 'neutro' : menorMelhor ? (p <= 100 ? 'ok' : 'bad') : tomPct(p);
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 flex flex-col gap-1">
      <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold">{rotulo}</span>
      <div className="flex items-baseline justify-between"><span className="text-sm font-bold text-foreground">{fmt(atual)}</span><span className={`text-[10px] font-semibold ${COR[tom]}`}>{pct(p)}</span></div>
      {barra && <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${BAR[tom]}`} style={{ width: `${Math.min(p ?? 0, 100)}%` }} /></div>}
      <span className="text-[9px] text-muted-foreground">Meta: {fmt(meta)}</span>
    </div>
  );
}

interface Props { eventos: Evento[]; meta: MetaEvento[]; hub: HubEvento[]; presenca: Presenca[]; carregando: boolean }

export default function DashboardRota({ eventos, meta, hub, presenca, carregando }: Props) {
  const [histAberto, setHistAberto] = useState(false);
  const hoje = hojeISO();
  const linhas = ROTA.cidades.map((c) => {
    const ev = eventos.find((e) => mesmoEvento(e, c));
    const m = meta.find((x) => mesmoEvento(x, c));
    const h = hub.find((x) => mesmoEvento(x, c));
    const inv = m ? Number(m.investimento) : null;
    const vendas = ev ? ev.pagos : null; const cort = ev ? ev.cortesias : null;
    const fat = ev ? Number(ev.faturamento) : null;
    const qual = h ? h.compradores_qualificados : null;
    return { c, ev, m, h, inv, vendas, cort, fat, ocup: ev ? ev.realizado : null, cap: ev?.capacidade ?? META.capacidade, qual, dias: dias(ev?.data_evento ?? c.data), data: ev?.data_evento ?? c.data };
  });
  const T = {
    vendas: somaN(linhas.map((l) => l.vendas)), cort: somaN(linhas.map((l) => l.cort)), fat: somaN(linhas.map((l) => l.fat)), inv: somaN(linhas.map((l) => l.inv)),
    ocup: somaN(linhas.map((l) => l.ocup)), qual: somaN(linhas.map((l) => l.qual)), comp: somaN(linhas.map((l) => l.h?.compradores_hubspot)),
    impr: somaN(linhas.map((l) => (l.m ? Number(l.m.impressoes) : null))), cliq: somaN(linhas.map((l) => (l.m ? Number(l.m.cliques) : null))),
  };
  const n = ROTA.cidades.length;
  const ingressos = T.ocup;
  const cpa = div(T.inv, ingressos);
  const ticket = div(T.fat, T.vendas);
  const liquido = T.fat != null && T.inv != null ? T.fat - T.inv : null;
  const roas = div(T.fat, T.inv);
  const cacVendas = div(T.inv, T.vendas);
  const cacQual = div(T.inv, T.qual);
  const pctQual = div(T.qual, T.comp) == null ? null : 100 * (T.qual! / T.comp!);
  const cpm = T.impr ? (T.inv! / T.impr) * 1000 : null;
  const ctr = T.impr ? (100 * (T.cliq ?? 0)) / T.impr : null;

  const futuras = linhas.filter((l) => l.dias >= 0);
  const passadas = linhas.filter((l) => l.dias < 0);
  const Aviso = ({ t }: { t: string }) => <p className="text-[10px] text-muted-foreground">{t}</p>;
  const Bloco = ({ titulo, icone, children, extra }: { titulo: string; icone?: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode }) => (
    <section className="surface p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap"><div className="flex items-center gap-2 text-primary">{icone}<h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{titulo}</h3></div>{extra}</div>
      {children}
    </section>
  );

  return (
    <div className="space-y-4">
      {/* Meta (plano) vs Realizado */}
      <Bloco titulo={`Meta (plano) vs Realizado — ${ROTA.nome}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { r: 'Ingressos', meta: num(Math.round((n * META.investimento) / META.cac)), real: num(ingressos), ok: ingressos != null && ingressos >= (n * META.investimento) / META.cac },
            { r: 'Receita', meta: brl(PLANO.receitaRota), real: brl(T.fat), ok: T.fat != null && T.fat >= PLANO.receitaRota },
            { r: 'Investimento (↓ melhor)', meta: brl(n * META.investimento), real: brl(T.inv), ok: T.inv != null && T.inv <= n * META.investimento },
            { r: 'CPA (↓ melhor)', meta: brl(META.cac), real: brl(cpa), ok: cpa != null && cpa <= META.cac },
          ].map((x) => (
            <div key={x.r} className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{x.r}</div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <div><div className="text-[8px] uppercase text-muted-foreground">Meta</div><div className="text-sm mono font-bold text-foreground">{x.meta}</div></div>
                <div className="text-right"><div className="text-[8px] uppercase text-muted-foreground">Realizado</div><div className={`text-sm mono font-bold ${x.real === '—' ? 'text-muted-foreground' : x.ok ? 'text-emerald-400' : 'text-red-400'}`}>{x.real}</div></div>
              </div>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Próximas cidades */}
      <Bloco titulo="Próximas Cidades 2026" icone={<CalendarClock className="h-4 w-4" />} extra={<span className="text-[10px] text-muted-foreground">{futuras.length} restantes · {passadas.length}/{n} concluídas · <span className="text-red-400">≤ 7 dias</span> · <span className="text-amber-400">≤ 14 dias</span></span>}>
        <div className="relative h-1.5 rounded-full bg-secondary overflow-hidden"><div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-primary" style={{ width: `${Math.round((100 * passadas.length) / n)}%` }} /></div>
        <div className="flex flex-wrap gap-1.5">
          {linhas.map((l) => {
            const urg = l.dias >= 0 && l.dias <= 7; const av = l.dias > 7 && l.dias <= 14; const passou = l.dias < 0;
            return (
              <div key={l.c.cidade} className={`relative rounded-lg px-3 py-2 text-center border ${passou ? 'bg-emerald-500/10 border-emerald-500/20' : urg ? 'bg-red-500/15 border-red-500/50' : av ? 'bg-amber-500/15 border-amber-500/40' : 'bg-blue-500/10 border-blue-500/20'}`}>
                {l.dias >= 0 && <span className={`absolute -top-1.5 -right-1.5 text-[8px] font-bold px-1.5 py-[1px] rounded-full leading-none ${urg ? 'bg-red-500 text-white' : av ? 'bg-amber-500 text-black' : 'bg-blue-500 text-white'}`}>{l.dias === 0 ? 'hoje' : `${l.dias}d`}</span>}
                <div className="text-[10px] font-bold text-foreground truncate">{l.c.cidade}</div>
                <div className="text-[9px] text-muted-foreground">{dm(l.data)}</div>
              </div>
            );
          })}
        </div>
      </Bloco>

      {/* Histórico de cidades realizadas */}
      {passadas.length > 0 && (
        <section className="surface">
          <button onClick={() => setHistAberto((o) => !o)} className="w-full flex items-center justify-between p-4 text-left">
            <span className="flex items-center gap-2.5"><History className="h-4 w-4 text-emerald-400" /><span className="text-xs font-bold uppercase tracking-widest text-foreground">Histórico de Cidades Realizadas</span><span className="text-[10px] text-muted-foreground">{passadas.length} {passadas.length === 1 ? 'cidade concluída' : 'cidades concluídas'}</span></span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${histAberto ? 'rotate-180' : ''}`} />
          </button>
          {histAberto && (
            <div className="px-4 pb-4 flex flex-wrap gap-1.5">
              {passadas.map((l) => {
                const p = presenca.find((x) => mesmoEvento(x, l.c));
                return (
                  <div key={l.c.cidade} className="rounded-lg px-3 py-2 text-center bg-emerald-500/10 border border-emerald-500/20 min-w-[110px]">
                    <div className="text-[10px] font-bold text-foreground">{l.c.cidade}</div><div className="text-[9px] text-muted-foreground">{dm(l.data)}</div>
                    <div className="mt-1 pt-1 border-t border-emerald-500/20">
                      <div className="text-[11px] font-extrabold text-emerald-400">{p ? num(p.presentes) : '—'}</div><div className="text-[8px] text-emerald-400/90 font-semibold">Compareceram</div>
                      {p && p.esperados > 0 && <><div className="text-[8px] text-muted-foreground">de {num(p.esperados)} ingressos</div><div className="text-[10px] font-bold text-primary">{Math.round((100 * p.presentes) / p.esperados)}% <span className="text-[7px] text-muted-foreground font-semibold">comparecimento</span></div></>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Capacidade dos eventos */}
      <Bloco titulo="Capacidade dos Eventos" icone={<Users className="h-4 w-4" />} extra={<span className="text-sm font-bold text-foreground">{num(T.ocup)} / {num(linhas.reduce((a, l) => a + l.cap, 0))}</span>}>
        <Aviso t="Ocupação = vendas pagas + cortesias · Capacidade contratada do espaço por cidade" />
        {linhas.filter((l) => (l.ocup ?? 0) >= l.cap).length > 0 && (
          <div className="rounded-lg border-2 border-red-500 bg-red-500/10 p-3"><p className="text-sm font-black uppercase text-red-400">ATENÇÃO — {linhas.filter((l) => (l.ocup ?? 0) >= l.cap).map((l) => l.c.cidade.toUpperCase()).join(', ')} LOTADO(S)</p><p className="text-[11px] font-bold text-red-300">NÃO vender mais ingressos · NÃO liberar cortesias · Capacidade máxima atingida</p></div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {linhas.map((l) => {
            const p = l.ocup == null ? null : (100 * l.ocup) / l.cap; const lot = p != null && p >= 100; const tom: Tom = p == null ? 'neutro' : p >= 100 ? 'ok' : p >= 70 ? 'warn' : p >= 40 ? 'warn' : 'bad';
            return (
              <div key={l.c.cidade} className={`rounded-lg border p-3 flex flex-col gap-1.5 ${lot ? 'border-2 border-red-500 bg-red-500/15' : 'border-border bg-secondary/30'}`}>
                <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-foreground">{l.c.cidade}</span><span className="text-[9px] text-muted-foreground">{dm(l.data)}</span></div>
                <div className="flex items-baseline justify-between"><span className="text-sm font-bold text-foreground">{num(l.ocup)} <span className="text-muted-foreground font-normal">/ {num(l.cap)}</span></span><span className={`text-[11px] font-bold ${COR[tom]}`}>{pct(p)}</span></div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${BAR[tom]}`} style={{ width: `${Math.min(p ?? 0, 100)}%` }} /></div>
                <span className="text-[9px] font-semibold text-muted-foreground">{l.ocup == null ? 'sem dado de vendas' : lot ? 'NÃO VENDER · NÃO DAR CORTESIA' : `${num(l.cap - l.ocup)} lugares restantes`}</span>
              </div>
            );
          })}
        </div>
      </Bloco>

      {/* Metas da rota */}
      <Bloco titulo={`Meta Global — ${ROTA.nome} (${n} Cidades)`} icone={<Target className="h-4 w-4" />}>
        <Aviso t={`${brl(n * META.investimento)} de investimento total (líquido, já descontado imposto Meta 12,15%) · ${num(n * META.vendas)} ingressos · CPA ${brl(META.cac)}`} />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <Meta rotulo="Investimento" atual={T.inv} meta={n * META.investimento} fmt={brl} menorMelhor barra={false} />
          <Meta rotulo="ING - Vendas" atual={T.vendas} meta={n * META.vendas} fmt={num} barra={false} />
          <Cartao rotulo="ING - VIP" valor="—" sub="sem dado na Central" />
          <Meta rotulo="Cortesias" atual={T.cort} meta={n * META.cortesias} fmt={num} barra={false} />
          <Meta rotulo="Total Partic." atual={T.ocup} meta={n * META.totalPartic} fmt={num} barra={false} />
          <Meta rotulo="ING - Ticket" atual={ticket} meta={META.ticket} fmt={brl} barra={false} />
          <Meta rotulo="ING - Receita" atual={T.fat} meta={n * META.receita} fmt={brl} barra={false} />
          <Meta rotulo="ING - CAC" atual={cacVendas} meta={META.cac} fmt={brl} menorMelhor barra={false} />
          <Meta rotulo="CAC Qualif." atual={cacQual} meta={META.cacQualif} fmt={brl} menorMelhor barra={false} />
          <Cartao rotulo="Qualificação Compradores" valor={pct(pctQual)} sub={`Meta: ${META.qual}% · ${num(T.qual)} qual. de ${num(T.comp)} com HubSpot`} tom={pctQual == null ? 'neutro' : pctQual >= META.qual ? 'ok' : 'warn'} />
          <Cartao rotulo="Eficiência da Verba" valor={(() => { const pp = div(ingressos, n * META.totalPartic); const pi = div(T.inv, n * META.investimento); return pp != null && pi ? `${(pp / pi).toFixed(2)}x` : '—'; })()} sub={`${pct(div(ingressos, n * META.totalPartic) == null ? null : 100 * div(ingressos, n * META.totalPartic)!)} da meta com ${pct(div(T.inv, n * META.investimento) == null ? null : 100 * div(T.inv, n * META.investimento)!)} da verba`} />
          <Cartao rotulo="Cortesia CS" valor="—" sub="origem não coletada" />
          <Cartao rotulo="Cortesia Comercial" valor="—" sub="origem não coletada" />
        </div>
        <div className="space-y-3 pt-2 border-t border-border">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Metas por Cidade</h4>
          {linhas.map((l) => {
            const pp = l.ocup == null ? null : (100 * l.ocup) / META.totalPartic; const pi = l.inv == null ? null : (100 * l.inv) / META.investimento;
            return (
              <div key={l.c.cidade} className="rounded-lg border border-border bg-secondary/10 p-4">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-foreground">{l.c.cidade} <span className="ml-2 text-muted-foreground font-normal normal-case">· evento {dm(l.data)}</span></h4>
                  {l.dias > 0 && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${l.dias <= 7 ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'bg-blue-500/15 text-blue-400 border-blue-500/40'}`}>faltam {l.dias} {l.dias === 1 ? 'dia' : 'dias'}</span>}
                  {l.dias === 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/40">hoje!</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
                  <Meta rotulo="Investimento" atual={l.inv} meta={META.investimento} fmt={brl} menorMelhor barra={false} />
                  <Meta rotulo="ING - Vendas" atual={l.vendas} meta={META.vendas} fmt={num} barra={false} />
                  <Meta rotulo="Cortesias" atual={l.cort} meta={META.cortesias} fmt={num} barra={false} />
                  <Meta rotulo="Total Partic." atual={l.ocup} meta={META.totalPartic} fmt={num} barra={false} />
                  <Meta rotulo="ING - Ticket" atual={div(l.fat, l.vendas)} meta={META.ticket} fmt={brl} barra={false} />
                  <Meta rotulo="ING - Receita" atual={l.fat} meta={META.receita} fmt={brl} barra={false} />
                  <Meta rotulo="ING - CAC" atual={div(l.inv, l.vendas)} meta={META.cac} fmt={brl} menorMelhor barra={false} />
                  <Meta rotulo="CAC Qualif." atual={div(l.inv, l.qual)} meta={META.cacQualif} fmt={brl} menorMelhor barra={false} />
                  <Cartao rotulo="Qualificação" valor={pct(div(l.qual, l.h?.compradores_hubspot ?? null) == null ? null : 100 * (l.qual! / l.h!.compradores_hubspot))} sub={`Meta: ${META.qual}%`} />
                  <Cartao rotulo="Eficiência da Verba" valor={pp != null && pi ? `${(pp / pi).toFixed(2)}x` : '—'} sub={`${pct(pp)} da meta com ${pct(pi)} da verba`} />
                </div>
              </div>
            );
          })}
        </div>
      </Bloco>

      {/* KPIs da rota */}
      <Bloco titulo={`${ROTA.nome} — KPIs (${n} cidades)`} icone={<Zap className="h-4 w-4" />}>
        <h4 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Dados de Vendas (Guru)</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <Cartao rotulo="Faturamento" valor={brl(T.fat)} /><Cartao rotulo="Vendas" valor={num(T.ocup)} /><Cartao rotulo="Produtos" valor={num(T.ocup)} />
          <Cartao rotulo="Ticket Médio" valor={brl(ticket)} /><Cartao rotulo="Cortesias" valor={num(T.cort)} /><Cartao rotulo="Vendas Pagas" valor={num(T.vendas)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <Cartao rotulo="Total em Vendas" valor={brl(T.fat)} tom="ok" /><Cartao rotulo="Total Líquido" valor={brl(liquido)} tom={liquido == null ? 'neutro' : liquido >= 0 ? 'ok' : 'bad'} />
          <Cartao rotulo="Líquido" valor={pct(liquido == null || !T.fat ? null : (100 * liquido) / T.fat, 1)} /><Cartao rotulo="Produtos Vendidos" valor={num(T.ocup)} tom="ok" />
          <Cartao rotulo="Ticket Médio" valor={brl(ticket)} tom="ok" /><Cartao rotulo="Lucro Médio" valor={brl(liquido == null || !T.vendas ? null : liquido / T.vendas)} />
          <Cartao rotulo="ROAS" valor={roas == null ? '—' : `${roas.toFixed(2)}x`} tom={roas == null ? 'neutro' : roas >= 1 ? 'ok' : 'warn'} /><Cartao rotulo="Retorno Líquido" valor={brl(liquido)} tom={liquido == null ? 'neutro' : liquido >= 0 ? 'ok' : 'bad'} />
        </div>
        <h4 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Meta Ads</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <Cartao rotulo="Investimento" valor={brl(T.inv)} /><Cartao rotulo="Impressões" valor={num(T.impr)} /><Cartao rotulo="CPM" valor={cpm == null ? '—' : brl(cpm)} />
          <Cartao rotulo="CTR" valor={pct(ctr, 2)} /><Cartao rotulo="Conect Rate" valor="—" sub="sem visitas à LP" /><Cartao rotulo="Conversão" valor="—" sub="sem visitas à LP" />
          <Cartao rotulo="Vendas (Guru)" valor={num(T.vendas)} /><Cartao rotulo="CAC Geral (Vendas)" valor={brl(cacVendas)} />
          <Cartao rotulo="CAC por Comprador Qualificado" valor={brl(cacQual)} />
        </div>
      </Bloco>

      <Bloco titulo={`Funil de Tráfego por Cidade — ${ROTA.nome}`}>
        <Aviso t="CPM, CTR, vendas e CAC vêm da Central. Cliques no link, visitas à LP e checkouts ainda não são coletados para as campanhas de evento (aparecem como “—”)." />
        <div className="space-y-2">
          {linhas.map((l) => {
            const cp = l.m && Number(l.m.impressoes) ? (Number(l.m.investimento) / Number(l.m.impressoes)) * 1000 : null;
            const ct = l.m && Number(l.m.impressoes) ? (100 * Number(l.m.cliques)) / Number(l.m.impressoes) : null;
            const passos: [string, string][] = [['CPM', cp == null ? '—' : brl(cp)], ['CTR', pct(ct, 2)], ['Cliques ao link', '—'], ['Connect', '—'], ['Visitas LP', '—'], ['Checkouts', '—'], ['Vendas', num(l.vendas)], ['CAC', brl(div(l.inv, l.vendas))]];
            return (
              <div key={l.c.cidade} className="rounded-lg border border-border bg-secondary/10 p-3">
                <div className="text-xs font-semibold text-foreground mb-2">{l.c.cidade} <span className="text-[10px] text-muted-foreground font-normal">· {dm(l.data)}</span></div>
                <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">{passos.map(([r, v]) => <div key={r} className="rounded bg-secondary/40 px-2 py-1.5 text-center"><div className="text-[8px] uppercase tracking-wider text-muted-foreground">{r}</div><div className={`text-xs font-bold mono ${v === '—' ? 'text-muted-foreground' : 'text-foreground'}`}>{v}</div></div>)}</div>
              </div>
            );
          })}
        </div>
      </Bloco>

      <Bloco titulo="Ainda não replicado neste Dashboard">
        <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
          <li>FORM_NATIVO por rota, gráficos de rosca (campanhas, públicos, criativos), Métricas Avançadas e Tabela por cidade: dependem de dados por campanha, público e anúncio das campanhas de evento.</li>
          <li>Funil completo (cliques no link, visitas à LP, checkouts): falta coletar esses campos das campanhas de evento.</li>
          <li>ING - VIP e origem da cortesia (CS e Comercial): falta a classificação na Guru.</li>
          <li>Seletor de período e filtro por cidade clicando na linha do tempo.</li>
        </ul>
        {carregando && <Aviso t="Carregando dados…" />}
      </Bloco>
    </div>
  );
}
