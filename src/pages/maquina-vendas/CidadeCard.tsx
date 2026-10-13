import type { ReactNode } from 'react';
import { mesmoEvento } from './rota';

export interface CidadeIng {
  cidade: string; mes_evento: string; ingressos: number; comuns_pagos: number; vip_pagos: number; vip_total: number; cortesias: number;
  cortesia_cs: number; cortesia_comercial: number; cortesia_social_selling: number; cortesia_seller: number; faturamento: number;
}

/* Card de uma cidade, no padrão dos cards da Lovable (funil + rodapé) com os indicadores das tabelas por cidade.
   Onde a Central ainda não coleta o dado aparece "—", nunca zero. */
interface Linha { c: { cidade: string; data: string }; ev: unknown; m: { investimento: number; impressoes: number; cliques: number } | null; h: { compradores_hubspot: number } | null; inv: number | null; vendas: number | null; cort: number | null; fat: number | null; ocup: number | null; cap: number; qual: number | null; dias: number; data: string }
type Fmt = { num: (v: number | null | undefined) => string; brl: (v: number | null | undefined) => string; pct: (v: number | null | undefined, c?: number) => string; dm: (iso: string) => string };
type MetaCfg = { investimento: number; vendas: number; cortesias: number; totalPartic: number; ticket: number; receita: number; cac: number; cacQualif: number; qual: number; cpm: number; ctr: number }
type CartaoC = (p: { rotulo: string; valor: string; sub?: string; tom?: 'ok' | 'warn' | 'bad' | 'neutro' }) => ReactNode;
type MetaC = (p: { rotulo: string; atual: number | null; meta: number; fmt: (v: number | null) => string; menorMelhor?: boolean; barra?: boolean }) => ReactNode;

const div = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : a / b);
void mesmoEvento;

export default function CidadeCard({ l, det, Meta, Cartao, fmt, meta }: { l: Linha; det: CidadeIng | null; Meta: MetaC; Cartao: CartaoC; fmt: Fmt; meta: MetaCfg }) {
  const { num, brl, pct, dm } = fmt;
  const impr = l.m ? Number(l.m.impressoes) : null; const cliq = l.m ? Number(l.m.cliques) : null;
  const cpm = l.m && impr ? (Number(l.m.investimento) / impr) * 1000 : null;
  const ctr = impr ? (100 * (cliq ?? 0)) / impr : null;
  const ticket = div(l.fat, l.vendas); const cac = div(l.inv, l.vendas); const cacQ = div(l.inv, l.qual);
  const roas = div(l.fat, l.inv);
  const qualPct = l.qual != null && l.h?.compradores_hubspot ? (100 * l.qual) / l.h.compradores_hubspot : null;
  const pp = l.ocup == null ? null : (100 * l.ocup) / meta.totalPartic; const pi = l.inv == null ? null : (100 * l.inv) / meta.investimento;
  const lotado = l.ocup != null && l.ocup >= l.cap;
  const sec = (t: string) => <h5 className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mt-1">{t}</h5>;
  const dd = (k: keyof CidadeIng) => (det ? (det[k] as number) : null);
  const outras = det ? det.cortesias - det.cortesia_cs - det.cortesia_comercial - det.cortesia_social_selling - det.cortesia_seller : null;
  return (
    <div className="rounded-xl border border-border bg-secondary/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-bold text-foreground">{l.c.cidade} <span className="ml-1 text-[10px] text-muted-foreground font-normal">· evento {dm(l.data)}</span></h4>
        <div className="flex gap-1.5">
          {lotado && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/40">LOTADO</span>}
          {l.dias > 0 && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${l.dias <= 7 ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'bg-blue-500/15 text-blue-400 border-blue-500/40'}`}>faltam {l.dias} {l.dias === 1 ? 'dia' : 'dias'}</span>}
          {l.dias === 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/40">hoje!</span>}
        </div>
      </div>

      {sec('Funil de tráfego')}
      <div className="grid grid-cols-4 gap-2">
        <Cartao rotulo="CPM" valor={brl(cpm)} sub={`meta ${brl(meta.cpm)}`} />
        <Cartao rotulo="CTR" valor={pct(ctr, 2)} sub={`meta ${pct(meta.ctr)}`} />
        <Cartao rotulo="Cliques no link" valor="—" sub="não coletado" />
        <Cartao rotulo="Connect rate" valor="—" sub="não coletado" />
        <Cartao rotulo="Visitas LP" valor="—" sub="não coletado" />
        <Cartao rotulo="Checkouts" valor="—" sub="não coletado" />
        <Cartao rotulo="Conv. página" valor="—" sub="meta 2,4%" />
        <Cartao rotulo="Conv. checkout" valor="—" sub="meta 40%" />
      </div>

      {sec('Ingressos')}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        <Meta rotulo="ING - Vendas" atual={l.vendas} meta={meta.vendas} fmt={num} barra={false} />
        <Cartao rotulo="ING - VIP" valor={num(dd('vip_total'))} sub={det ? `${num(det.vip_pagos)} pagos` : undefined} />
        <Meta rotulo="Cortesias" atual={l.cort} meta={meta.cortesias} fmt={num} barra={false} />
        <Meta rotulo="Total Partic." atual={l.ocup} meta={meta.totalPartic} fmt={num} barra={false} />
        <Cartao rotulo="Cortesia CS" valor={num(dd('cortesia_cs'))} />
        <Cartao rotulo="Cortesia Comercial" valor={num(dd('cortesia_comercial'))} />
        <Cartao rotulo="Cortesia Grazi / SS" valor={num(dd('cortesia_social_selling'))} />
        <Cartao rotulo="Cortesia Seller" valor={num(dd('cortesia_seller'))} />
      </div>
      {outras != null && outras > 0 && <p className="text-[9px] text-muted-foreground">{num(outras)} cortesias de outras origens (ex.: Comunidade R1, Ricardo R1) ainda sem coluna própria.</p>}
      <p className="text-[9px] text-muted-foreground">Capacidade: {num(l.ocup)} / {num(l.cap)} ({pct(l.ocup == null ? null : (100 * l.ocup) / l.cap)})</p>

      {sec('Financeiro')}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        <Meta rotulo="Investimento" atual={l.inv} meta={meta.investimento} fmt={brl} menorMelhor barra={false} />
        <Meta rotulo="ING - Receita" atual={l.fat} meta={meta.receita} fmt={brl} barra={false} />
        <Meta rotulo="ING - Ticket" atual={ticket} meta={meta.ticket} fmt={brl} barra={false} />
        <Meta rotulo="ING - CAC" atual={cac} meta={meta.cac} fmt={brl} menorMelhor barra={false} />
        <Meta rotulo="CAC Qualif." atual={cacQ} meta={meta.cacQualif} fmt={brl} menorMelhor barra={false} />
        <Cartao rotulo="ROAS" valor={roas == null ? '—' : `${roas.toFixed(2)}x`} />
        <Cartao rotulo="Qualificação" valor={pct(qualPct)} sub={`meta ${meta.qual}%`} />
        <Cartao rotulo="Eficiência da verba" valor={pp != null && pi ? `${(pp / pi).toFixed(2)}x` : '—'} sub={`${pct(pp)} da meta com ${pct(pi)} da verba`} />
      </div>
    </div>
  );
}
