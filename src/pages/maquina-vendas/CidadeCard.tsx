import { mesmoEvento } from './rota';

export interface CidadeIng {
  cidade: string; mes_evento: string; ingressos: number; comuns_pagos: number; vip_pagos: number; vip_total: number; cortesias: number;
  cortesia_cs: number; cortesia_comercial: number; cortesia_social_selling: number; cortesia_seller: number; faturamento: number;
}

/* Card de uma cidade, no padrão dos cards da Lovable (funil + rodapé) com os indicadores das tabelas por cidade.
   Onde a Central ainda não coleta o dado aparece "—", nunca zero. */
interface Linha { c: { cidade: string; data: string }; ev: unknown; m: { investimento: number; impressoes: number; cliques: number } | null; h: { compradores_hubspot: number } | null; inv: number | null; vendas: number | null; cort: number | null; fat: number | null; ocup: number | null; cap: number; qual: number | null; dias: number; data: string }
type Fmt = { num: (v: number | null | undefined) => string; brl: (v: number | null | undefined) => string; pct: (v: number | null | undefined, c?: number) => string; dm: (iso: string) => string };
type MetaCfg = { investimento: number; vendas: number; cortesias: number; totalPartic: number; ticket: number; receita: number; cac: number; cacQualif: number; qualif: number; cpm: number; ctr: number }
const div = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : a / b);
void mesmoEvento;

/* Metas do funil de tráfego (FUNNEL_GOALS do original), por cidade. */
const FUNIL = { cliques: 13889, connect: 75, visitas: 10417, checkouts: 250, convPagina: 2.4, convCheckout: 40 };

type Linha2 = { rotulo: string; atual: number | null; meta: number | null; f: (v: number | null) => string; menorMelhor?: boolean; nota?: string };
const TOM = { ok: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-red-400', neutro: 'text-muted-foreground' } as const;

/** Tom do % atingido: para custos (menor é melhor) a leitura se inverte. */
function tom(p: number | null, menorMelhor?: boolean): keyof typeof TOM {
  if (p == null) return 'neutro';
  const v = menorMelhor ? (p === 0 ? 100 : 10000 / p) : p;
  return v >= 100 ? 'ok' : v >= 70 ? 'warn' : 'bad';
}

export default function CidadeCard({ l, det, fmt, meta }: { l: Linha; det: CidadeIng | null; fmt: Fmt; meta: MetaCfg }) {
  const { num, brl, pct, dm } = fmt;
  const impr = l.m ? Number(l.m.impressoes) : null; const cliq = l.m ? Number(l.m.cliques) : null;
  const cpm = l.m && impr ? (Number(l.m.investimento) / impr) * 1000 : null;
  const ctr = impr ? (100 * (cliq ?? 0)) / impr : null;
  const ticket = div(l.fat, l.vendas); const cac = div(l.inv, l.vendas); const cacQ = div(l.inv, l.qual);
  const roas = div(l.fat, l.inv);
  const qualPct = l.qual != null && l.h?.compradores_hubspot ? (100 * l.qual) / l.h.compradores_hubspot : null;
  const lotado = l.ocup != null && l.ocup >= l.cap;
  const dd = (k: keyof CidadeIng) => (det ? (det[k] as number) : null);
  const outras = det ? det.cortesias - det.cortesia_cs - det.cortesia_comercial - det.cortesia_social_selling - det.cortesia_seller : null;
  const n2 = (v: number | null) => num(v); const p1 = (v: number | null) => pct(v, 1); const p2 = (v: number | null) => pct(v, 2);
  const x2 = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}x`);

  const grupos: { titulo: string; linhas: Linha2[] }[] = [
    { titulo: 'Funil de tráfego', linhas: [
      { rotulo: 'Investimento', atual: l.inv, meta: meta.investimento, f: brl, menorMelhor: true },
      { rotulo: 'CPM', atual: cpm, meta: meta.cpm, f: brl, menorMelhor: true },
      { rotulo: 'CTR', atual: ctr, meta: meta.ctr, f: p2 },
      { rotulo: 'Cliques no link', atual: null, meta: FUNIL.cliques, f: n2, nota: 'não coletado' },
      { rotulo: 'Connect rate', atual: null, meta: FUNIL.connect, f: p1, nota: 'não coletado' },
      { rotulo: 'Visitas LP', atual: null, meta: FUNIL.visitas, f: n2, nota: 'não coletado' },
      { rotulo: 'Conversão página', atual: null, meta: FUNIL.convPagina, f: p1, nota: 'não coletado' },
      { rotulo: 'Checkouts', atual: null, meta: FUNIL.checkouts, f: n2, nota: 'não coletado' },
      { rotulo: 'Conversão checkout', atual: null, meta: FUNIL.convCheckout, f: p1, nota: 'não coletado' },
    ] },
    { titulo: 'Ingressos', linhas: [
      { rotulo: 'ING - Vendas', atual: l.vendas, meta: meta.vendas, f: n2 },
      { rotulo: 'ING - VIP', atual: dd('vip_total'), meta: null, f: n2 },
      { rotulo: 'Cortesias', atual: l.cort, meta: meta.cortesias, f: n2 },
      { rotulo: 'Cortesia CS', atual: dd('cortesia_cs'), meta: null, f: n2 },
      { rotulo: 'Cortesia Comercial', atual: dd('cortesia_comercial'), meta: null, f: n2 },
      { rotulo: 'Cortesia Grazi / SS', atual: dd('cortesia_social_selling'), meta: null, f: n2 },
      { rotulo: 'Cortesia Seller', atual: dd('cortesia_seller'), meta: null, f: n2 },
      { rotulo: 'Total participantes', atual: l.ocup, meta: meta.totalPartic, f: n2 },
      { rotulo: 'Ocupação (capacidade)', atual: l.ocup, meta: l.cap, f: n2 },
    ] },
    { titulo: 'Financeiro', linhas: [
      { rotulo: 'ING - Receita', atual: l.fat, meta: meta.receita, f: brl },
      { rotulo: 'ING - Ticket', atual: ticket, meta: meta.ticket, f: brl },
      { rotulo: 'ING - CAC', atual: cac, meta: meta.cac, f: brl, menorMelhor: true },
      { rotulo: 'CAC qualificado', atual: cacQ, meta: meta.cacQualif, f: brl, menorMelhor: true },
      { rotulo: 'Qualificação', atual: qualPct, meta: meta.qualif, f: p1 },
      { rotulo: 'ROAS', atual: roas, meta: null, f: x2 },
    ] },
  ];

  return (
    <div className="rounded-xl border border-border bg-secondary/10 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-lg font-extrabold text-foreground">{l.c.cidade}</h4>
          <p className="text-xs text-muted-foreground">Evento {dm(l.data)}</p>
        </div>
        <div className="flex gap-1.5">
          {lotado && <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-red-500/15 text-red-400 border-red-500/40">LOTADO</span>}
          {l.dias > 0 && <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${l.dias <= 7 ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'bg-blue-500/15 text-blue-400 border-blue-500/40'}`}>faltam {l.dias} {l.dias === 1 ? 'dia' : 'dias'}</span>}
          {l.dias === 0 && <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/40">hoje!</span>}
        </div>
      </div>

      {grupos.map((g) => (
        <table key={g.titulo} className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th scope="col" className="text-left font-bold py-1.5">{g.titulo}</th>
              <th scope="col" className="text-right font-bold py-1.5">Realizado</th>
              <th scope="col" className="text-right font-bold py-1.5">Meta</th>
              <th scope="col" className="text-right font-bold py-1.5">% atingido</th>
            </tr>
          </thead>
          <tbody>
            {g.linhas.map((r) => {
              const p = r.atual != null && r.meta ? (100 * r.atual) / r.meta : null;
              const t = tom(p, r.menorMelhor);
              return (
                <tr key={r.rotulo} className="border-b border-border/40 last:border-0">
                  <th scope="row" className="text-left font-medium text-foreground py-1.5">{r.rotulo}</th>
                  <td className="text-right font-bold tabular-nums text-foreground" title={r.atual == null ? r.nota : undefined}>{r.f(r.atual)}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{r.meta == null ? '—' : r.f(r.meta)}</td>
                  <td className={`text-right font-bold tabular-nums ${TOM[t]}`}>{p == null ? '—' : `${p.toFixed(0)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
      {outras != null && outras > 0 && <p className="text-[10px] text-muted-foreground">{num(outras)} cortesias de outras origens (ex.: Comunidade R1, Ricardo R1) ainda sem linha própria.</p>}
      <p className="text-[10px] text-muted-foreground">"—" = a Central ainda não coleta esse dado. Para custos (investimento, CPM, CAC), abaixo de 100% é melhor.</p>
    </div>
  );
}
