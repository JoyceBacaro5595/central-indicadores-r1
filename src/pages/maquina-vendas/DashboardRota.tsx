import { useState } from 'react';
import { HISTORICO, ROTA, mesmoEvento } from './rota';
import CadastroEvento from './CadastroEvento';
import CidadeCard, { type CidadeIng } from './CidadeCard';
import { CalendarClock, CheckCircle2, ChevronDown, History, Target, Users, Zap } from 'lucide-react';

/* Dashboard da Máquina de Vendas (réplica da aba "Dashboard" do app da Lovable), com dados da Central.
   Onde a Central ainda não coleta o dado (visitas à LP, checkouts, VIP, origem da cortesia) aparece "—", nunca zero. */

export interface Evento {
  id: number; cidade: string; mes_evento: string; data_evento: string | null; capacidade: number | null; meta_ingressos: number | null;
  realizado: number; pagos: number; cortesias: number; faturamento: number; primeira_venda: string | null;
}
export interface MetaEvento { cidade: string; mes_evento: string; investimento: number; impressoes: number; cliques: number }
export interface HubEvento { cidade: string; mes_evento: string; compradores: number; compradores_hubspot: number; compradores_qualificados: number }
export interface Cadeiras { cidade: string; mes_evento: string; total: number; comuns: number; vip: number; cortesias: number; cancelados: number }
export interface Presenca { cidade: string; mes_evento: string; esperados: number; presentes: number; presentes_cortesia?: number }

/* Metas padrão por cidade (DEFAULT_CITY_GOALS e FUNNEL_GOALS do original). */
const META = { investimento: 100000, vendas: 250, cortesias: 100, totalPartic: 350, ticket: 97, receita: 250 * 97, cac: 400, cacQualif: 800, capacidade: 350, cpm: 36, ctr: 1, qualif: 50 };
const PLANO = { receitaRota: 218250 };

const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
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

interface Props { detalhe: CidadeIng[]; eventosHist: Evento[]; eventos: Evento[]; meta: MetaEvento[]; hub: HubEvento[]; presenca: Presenca[]; cadeiras?: Cadeiras[]; carregando: boolean }

export default function DashboardRota({ detalhe, eventosHist, eventos, meta, hub, presenca, cadeiras = [], carregando }: Props) {
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
    const pr = presenca.find((x) => mesmoEvento(x, c));
    // Ocupação = e-tickets não cancelados (cancelado não é esperado no evento); sem e-ticket, cai para o aprovado na Guru.
    const ocup = pr && pr.esperados > 0 ? pr.esperados : ev ? ev.realizado : null;
    return { c, ev, m, h, inv, vendas, cort, fat, ocup, cap: ev?.capacidade ?? META.capacidade, qual, dias: dias(ev?.data_evento ?? c.data), data: ev?.data_evento ?? c.data };
  });
  const T = {
    vendas: somaN(linhas.map((l) => l.vendas)), cort: somaN(linhas.map((l) => l.cort)), fat: somaN(linhas.map((l) => l.fat)), inv: somaN(linhas.map((l) => l.inv)),
    ocup: somaN(linhas.map((l) => l.ocup)), qual: somaN(linhas.map((l) => l.qual)), comp: somaN(linhas.map((l) => l.h?.compradores_hubspot)),
    impr: somaN(linhas.map((l) => (l.m ? Number(l.m.impressoes) : null))), cliq: somaN(linhas.map((l) => (l.m ? Number(l.m.cliques) : null))),
  };
  const n = ROTA.cidades.length;
  const somaDet = (k: keyof CidadeIng) => somaN(detalhe.filter((d) => linhas.some((l) => mesmoEvento(d, l.c))).map((d) => d[k] as number));
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

  // Histórico = rotas anteriores + cidades da rota atual cujo evento já passou; "Próximas" só tem hoje e futuras.
  const passadas = [...HISTORICO.map((c) => ({ c, data: c.data })), ...linhas.filter((l) => l.dias < 0).map((l) => ({ c: l.c, data: l.data }))];
  const futuras = linhas.filter((l) => l.dias >= 0);
  const totalCid = HISTORICO.length + n;
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
      <Bloco titulo="Próximas Cidades 2026" icone={<CalendarClock className="h-4 w-4" />} extra={<span className="text-[10px] text-muted-foreground">{futuras.length} restantes · {passadas.length}/{totalCid} concluídas · <span className="text-red-400">≤ 7 dias</span> · <span className="text-amber-400">≤ 14 dias</span></span>}>
        <div className="relative h-1.5 rounded-full bg-secondary overflow-hidden"><div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-primary" style={{ width: `${Math.round((100 * passadas.length) / totalCid)}%` }} /></div>
        <div className="flex flex-wrap gap-1.5">
          {futuras.map((l) => {
            const urg = l.dias >= 0 && l.dias <= 7; const av = l.dias > 7 && l.dias <= 14; const passou = false;
            return (
              <div key={l.c.cidade} className={`relative rounded-lg px-3 py-2 text-center border ${l.dias === 0 ? 'bg-primary/20 border-primary/60' : passou ? 'bg-emerald-500/10 border-emerald-500/20' : urg ? 'bg-red-500/15 border-red-500/50' : av ? 'bg-amber-500/15 border-amber-500/40' : 'bg-blue-500/10 border-blue-500/20'}`}>
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
                const ev = eventosHist.find((x) => mesmoEvento(x, l.c));
                const esp = p?.esperados ?? 0; const pres = p?.presentes ?? 0;
                const cortTot = ev ? ev.cortesias : null; const cortPres = p?.presentes_cortesia ?? 0;
                const normTot = cortTot != null ? Math.max(0, esp - cortTot) : null; const normPres = Math.max(0, pres - cortPres);
                const taxa = (a: number, b: number) => Math.round((100 * a) / b);
                return (
                  <div key={`${l.c.cidade}-${l.data}`} className="rounded-lg px-3 py-2 text-center bg-emerald-500/10 border border-emerald-500/20 min-w-[170px]">
                    <div className="flex justify-center mb-1"><CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" /></div>
                    <div className="text-[10px] font-bold text-foreground">{l.c.cidade}</div><div className="text-[9px] text-muted-foreground">{dm(l.data)}</div>
                    <div className="mt-1 pt-1 border-t border-emerald-500/20 text-left">
                      <div className="text-center text-[11px] font-extrabold text-emerald-400">{p ? num(pres) : '—'}</div><div className="text-center text-[8px] text-emerald-400/90 font-semibold">Compareceram</div>
                      {p && esp > 0 && <>
                        <div className="text-center text-[8px] text-muted-foreground">de {num(esp)} ingressos vendidos</div>
                        <div className="mt-1.5 flex items-baseline gap-0.5"><span className={`text-[10px] font-bold ${taxa(pres, esp) >= 80 ? 'text-emerald-400' : 'text-red-500'}`}>{taxa(pres, esp)}%</span><span className="text-[7px] font-semibold text-muted-foreground">comparecimento geral</span></div>
                        {normTot != null && normTot > 0 && <div className="mt-1.5 pt-1 border-t border-emerald-500/20 flex items-baseline gap-0.5"><span className="text-[10px] font-bold text-foreground">{taxa(normPres, normTot)}%</span><span className="text-[7px] font-semibold text-muted-foreground">comparecimento normais</span><span className="text-[7px] text-muted-foreground ml-auto">{num(normPres)} / {num(normTot)}</span></div>}
                        {cortTot != null && cortTot > 0 && <div className="mt-0.5 flex items-baseline gap-0.5"><span className="text-[10px] font-bold text-amber-500">{taxa(cortPres, cortTot)}%</span><span className="text-[7px] font-semibold text-amber-500/80">comparecimento cortesias</span><span className="text-[7px] text-muted-foreground ml-auto">{num(cortPres)} / {num(cortTot)}</span></div>}
                      </>}
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
        <Aviso t="Ocupação = e-tickets não cancelados (pagos + cortesias + VIP) · Capacidade contratada do espaço por cidade" />
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
                {(() => {
                  const cd = cadeiras.find((x) => mesmoEvento(x, l.c));
                  return (
                    <details className="text-[10px] text-muted-foreground">
                      <summary className="cursor-pointer font-semibold text-foreground">Detalhes</summary>
                      {cd ? (
                        <dl className="mt-1.5 space-y-0.5">
                          {([['Vendidos (total geral)', cd.total], ['Comuns', cd.comuns], ['VIPs', cd.vip], ['Cortesias', cd.cortesias], ['Cancelados', cd.cancelados]] as [string, number][]).map(([r, v]) => (
                            <div key={r} className="flex justify-between"><dt>{r}</dt><dd className="font-bold tabular-nums text-foreground">{num(v)}</dd></div>
                          ))}
                        </dl>
                      ) : <p className="mt-1.5">sem e-tickets lidos</p>}
                    </details>
                  );
                })()}
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
          <Cartao rotulo="ING - VIP" valor={num(somaN(detalhe.filter((d) => linhas.some((l) => mesmoEvento(d, l.c))).map((d) => d.vip_total)))} sub="vendidos + cortesia" />
          <Meta rotulo="Cortesias" atual={T.cort} meta={n * META.cortesias} fmt={num} barra={false} />
          <Meta rotulo="Total Partic." atual={T.ocup} meta={n * META.totalPartic} fmt={num} barra={false} />
          <Meta rotulo="ING - Ticket" atual={ticket} meta={META.ticket} fmt={brl} barra={false} />
          <Meta rotulo="ING - Receita" atual={T.fat} meta={n * META.receita} fmt={brl} barra={false} />
          <Meta rotulo="ING - CAC" atual={cacVendas} meta={META.cac} fmt={brl} menorMelhor barra={false} />
          <Meta rotulo="CAC Qualif." atual={cacQual} meta={META.cacQualif} fmt={brl} menorMelhor barra={false} />
          <Cartao rotulo="Qualificação Compradores" valor={pct(pctQual)} sub={`Meta: ${META.qualif}% · ${num(T.qual)} qual. de ${num(T.comp)} com HubSpot`} tom={pctQual == null ? 'neutro' : pctQual >= META.qualif ? 'ok' : 'warn'} />
          <Cartao rotulo="Eficiência da Verba" valor={(() => { const pp = div(ingressos, n * META.totalPartic); const pi = div(T.inv, n * META.investimento); return pp != null && pi ? `${(pp / pi).toFixed(2)}x` : '—'; })()} sub={`${pct(div(ingressos, n * META.totalPartic) == null ? null : 100 * div(ingressos, n * META.totalPartic)!)} da meta com ${pct(div(T.inv, n * META.investimento) == null ? null : 100 * div(T.inv, n * META.investimento)!)} da verba`} />
          <Cartao rotulo="Cortesia CS" valor={num(somaDet("cortesia_cs"))} sub="oferta TIME-CS" />
          <Cartao rotulo="Cortesia Comercial" valor={num(somaDet("cortesia_comercial"))} sub="oferta COMERCIAL" />
          <Cartao rotulo="Cortesia Grazi / SS" valor={num(somaDet("cortesia_social_selling"))} sub="canal Social Selling" />
          <Cartao rotulo="Cortesia Seller" valor={num(somaDet("cortesia_seller"))} sub="canal Seller" />
        </div>
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between gap-3 flex-wrap"><h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cards por Cidade</h4><CadastroEvento eventos={eventosHist} /></div>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {linhas.map((l) => <CidadeCard key={l.c.cidade} l={l} det={detalhe.find((x) => mesmoEvento(x, l.c)) ?? null} fmt={{ num, brl, pct, dm }} meta={META} />)}
          </div>
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

      <Bloco titulo="Ainda não replicado neste Dashboard">
        <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
          <li>FORM_NATIVO por rota, gráficos de rosca (campanhas, públicos, criativos), Métricas Avançadas e Tabela por cidade: dependem de dados por campanha, público e anúncio das campanhas de evento.</li>
          <li>Funil completo (cliques no link, visitas à LP, checkouts): falta coletar esses campos das campanhas de evento.</li>
                    <li>Seletor de período e filtro por cidade clicando na linha do tempo.</li>
        </ul>
        {carregando && <Aviso t="Carregando dados…" />}
      </Bloco>
    </div>
  );
}
