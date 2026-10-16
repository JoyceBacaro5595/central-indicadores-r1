import type { CidadeIng } from './CidadeCard';
import { META, num, brl, pct, dm } from './DashboardRota';

export interface LinhaRota {
  c: { cidade: string; data: string }; m: { investimento: number; impressoes: number; cliques: number } | null; h: { compradores_hubspot: number } | null;
  inv: number | null; vendas: number | null; cort: number | null; fat: number | null; ocup: number | null; cap: number; qual: number | null; dias: number; data: string;
}
const div = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : a / b);
const TOM = { ok: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-red-400', neutro: 'text-muted-foreground' } as const;
const tom = (p: number | null, menorMelhor?: boolean): keyof typeof TOM => {
  if (p == null) return 'neutro';
  const v = menorMelhor ? (p === 0 ? 100 : 10000 / p) : p;
  return v >= 100 ? 'ok' : v >= 70 ? 'warn' : 'bad';
};

/** Célula "realizado + % da meta" para a tabela. */
function Cel({ v, f, meta, menorMelhor }: { v: number | null; f: (x: number | null) => string; meta?: number | null; menorMelhor?: boolean }) {
  const p = v != null && meta ? (100 * v) / meta : null;
  return <td className="py-2 text-right tabular-nums"><span className="font-bold text-foreground">{f(v)}</span>{p != null && <span className={`block text-[10px] ${TOM[tom(p, menorMelhor)]}`}>{p.toFixed(0)}% de {f(meta ?? null)}</span>}</td>;
}

/** Visão lista: uma linha por cidade com os indicadores principais (Realizado e % da meta). */
export function TabelaRota({ linhas, detalhe, mesmo }: { linhas: LinhaRota[]; detalhe: CidadeIng[]; mesmo: (a: CidadeIng, c: LinhaRota['c']) => boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[1000px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            {['Cidade', 'Evento', 'Investimento', 'Vendas', 'Cortesias', 'Participantes', 'VIP', 'Receita', 'Ticket', 'CAC', 'CAC qualif.', 'Qualificação'].map((h, i) => <th key={h} scope="col" className={`py-2 font-bold ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const det = detalhe.find((d) => mesmo(d, l.c)) ?? null;
            const qualPct = l.qual != null && l.h?.compradores_hubspot ? (100 * l.qual) / l.h.compradores_hubspot : null;
            const lotado = l.ocup != null && l.ocup >= l.cap;
            return (
              <tr key={l.c.cidade} className="border-b border-border/40">
                <th scope="row" className="py-2 text-left font-semibold text-foreground">{l.c.cidade}{lotado && <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/40">LOTADO</span>}</th>
                <td className="py-2 text-left text-muted-foreground">{dm(l.data)}{l.dias > 0 && <span className="block text-[10px]">faltam {l.dias} {l.dias === 1 ? 'dia' : 'dias'}</span>}</td>
                <Cel v={l.inv} f={brl} meta={META.investimento} menorMelhor />
                <Cel v={l.vendas} f={num} meta={META.vendas} />
                <Cel v={l.cort} f={num} meta={META.cortesias} />
                <Cel v={l.ocup} f={num} meta={l.cap} />
                <td className="py-2 text-right tabular-nums font-bold text-foreground">{num(det ? det.vip_total : null)}</td>
                <Cel v={l.fat} f={brl} meta={META.receita} />
                <Cel v={div(l.fat, l.vendas)} f={brl} meta={META.ticket} />
                <Cel v={div(l.inv, l.vendas)} f={brl} meta={META.cac} menorMelhor />
                <Cel v={div(l.inv, l.qual)} f={brl} meta={META.cacQualif} menorMelhor />
                <Cel v={qualPct} f={(x) => pct(x, 1)} meta={META.qualif} />
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-2">"—" = a Central ainda não coleta esse dado. Para custos (investimento, CAC), abaixo de 100% da meta é melhor. Participantes comparam com a capacidade do espaço.</p>
    </div>
  );
}

/** Taxas-alvo entre etapas (as mesmas do detalhe da cidade). As metas de cada etapa saem da meta de vendas ativa (META.vendas, que o plano da rota
 *  sobrescreve), trabalhando de trás para frente: checkouts = vendas / conv. checkout; visitas = checkouts / conv. página; cliques = visitas / connect rate. */
const TAXA = { connect: 75, convPagina: 2.4, convCheckout: 40 };
const metasFunil = () => {
  const checkouts = META.vendas / (TAXA.convCheckout / 100);
  const visitas = checkouts / (TAXA.convPagina / 100);
  return { checkouts, visitas, cliques: visitas / (TAXA.connect / 100) };
};
const BARRA = { ok: 'bg-emerald-400', warn: 'bg-amber-400', bad: 'bg-red-400', neutro: 'bg-border' } as const;

/** Visão funil (gestor de tráfego): CPM → Cliques → Visitas LP → Checkouts → Vendas, cada etapa mais baixa que a anterior, com a meta,
 *  o % atingido (verde ≥100%, âmbar ≥70%, vermelho abaixo) e a conversão entre etapas. Embaixo, os indicadores financeiros com a meta.
 *  Etapas que a Central ainda não coleta (Visitas LP, Checkouts) ficam "—", nunca zero. */
export function FunilRota({ linhas }: { linhas: LinhaRota[] }) {
  const FM = metasFunil();
  return (
    <div className="grid gap-4 grid-cols-1">
      {linhas.map((l) => {
        const impr = l.m ? Number(l.m.impressoes) : null; const cliq = l.m ? Number(l.m.cliques) : null; const inv = l.m ? Number(l.m.investimento) : l.inv;
        const cpm = impr ? (1000 * (inv as number)) / impr : null;
        const ctr = impr && cliq != null ? (100 * cliq) / impr : null;
        const convVenda = null as number | null; // vendas / checkouts: depende de checkouts
        const cpa = div(inv, l.vendas);
        const ticket = div(l.fat, l.vendas);
        const etapas: { r: string; v: number | null; f: (x: number | null) => string; meta: number | null; menor?: boolean; sub?: string }[] = [
          { r: 'CPM', v: cpm, f: brl, meta: META.cpm, menor: true, sub: impr != null ? `${num(impr)} impressões` : undefined },
          { r: 'Cliques no link', v: cliq, f: num, meta: FM.cliques },
          { r: 'Visitas LP', v: null, f: num, meta: FM.visitas },
          { r: 'Checkouts', v: null, f: num, meta: FM.checkouts },
          { r: 'Vendas', v: l.vendas, f: num, meta: META.vendas },
        ];
        const chips: { r: string; v: number | null; meta: string; menor?: boolean; m: number }[] = [
          { r: 'CTR', v: ctr, meta: pct(META.ctr, 2), m: META.ctr },
          { r: 'Connect rate', v: null, meta: pct(TAXA.connect, 0), m: TAXA.connect },
          { r: 'Visit. → checkout', v: null, meta: pct(TAXA.convPagina, 1), m: TAXA.convPagina },
          { r: 'Conv. venda', v: convVenda, meta: pct(TAXA.convCheckout, 0), m: TAXA.convCheckout },
        ];
        const kpis: { r: string; v: string; meta: string; t: keyof typeof TOM }[] = [
          { r: 'Investimento', v: brl(inv), meta: brl(META.investimento), t: 'neutro' },
          { r: 'Ticket médio', v: brl(ticket), meta: brl(META.ticket), t: tom(ticket != null ? (100 * ticket) / META.ticket : null) },
          { r: 'Receita', v: brl(l.fat), meta: brl(META.receita), t: tom(l.fat != null ? (100 * l.fat) / META.receita : null) },
          { r: 'Conv. página', v: '—', meta: pct(TAXA.convPagina, 1), t: 'neutro' },
          { r: 'CPA', v: brl(cpa), meta: brl(META.cac), t: tom(cpa != null ? (100 * cpa) / META.cac : null, true) },
          { r: 'Verba usada', v: inv != null ? pct((100 * inv) / META.investimento, 0) : '—', meta: '100%', t: 'neutro' },
        ];
        return (
          <div key={l.c.cidade} className="rounded-xl border border-border bg-secondary/10 p-5 space-y-4">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <h4 className="text-lg font-extrabold text-foreground font-mono">{l.c.cidade}</h4>
              <span className="text-[10px] text-muted-foreground">Evento {dm(l.data)}{l.dias > 0 ? ` · faltam ${l.dias} ${l.dias === 1 ? 'dia' : 'dias'}` : l.dias === 0 ? ' · hoje' : ' · concluído'}</span>
            </div>
            <div className="overflow-x-auto">
              <div className="flex items-center min-w-[760px]">
                {etapas.map((e, i) => {
                  const p = e.v != null && e.meta ? (100 * e.v) / e.meta : null;
                  const t = tom(p, e.menor);
                  const altura = 100 - i * 14; // % da altura: cada etapa mais baixa que a anterior
                  return (
                    <div key={e.r} className="flex items-center flex-1 min-w-0">
                      <div className="flex-1 min-w-0 flex items-center justify-center" style={{ height: 150 }}>
                        <div className={`relative overflow-hidden w-full rounded-md border border-border bg-secondary/40 flex flex-col items-center justify-center text-center px-1 ${e.v == null ? 'border-dashed' : ''}`} style={{ height: `${altura}%` }}
                          title={e.v == null ? 'Ainda não coletado do Meta' : undefined}>
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{e.r}</span>
                          <span className={`text-lg font-extrabold tabular-nums font-mono ${TOM[t]}`}>{e.f(e.v)}</span>
                          <span className="text-[9px] text-muted-foreground">meta {e.f(e.meta)}{p != null ? ` · ${p.toFixed(0)}%` : ''}</span>
                          {e.sub && <span className="text-[9px] text-muted-foreground">{e.sub}</span>}
                          <span className={`absolute left-0 bottom-0 h-1 ${BARRA[t]}`} style={{ width: `${Math.min(100, p ?? 0)}%` }} />
                        </div>
                      </div>
                      {i < chips.length && (() => {
                        const c = chips[i]; const ct = tom(c.v != null ? (100 * c.v) / c.m : null);
                        return (
                          <div className="shrink-0 mx-1 text-center w-[74px]">
                            <div className="text-[8px] uppercase tracking-wider text-muted-foreground leading-3">{c.r}</div>
                            <div className={`text-xs font-extrabold tabular-nums ${TOM[ct]}`}>{c.v != null ? pct(c.v, 2) : '—'}</div>
                            <div className="text-[8px] text-muted-foreground">meta {c.meta}</div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 border-t border-border/50 pt-3">
              {kpis.map((x) => (
                <div key={x.r} className="text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{x.r}</div>
                  <div className={`text-sm font-extrabold tabular-nums font-mono ${TOM[x.t]}`}>{x.v}</div>
                  <div className="text-[9px] text-muted-foreground">meta {x.meta}</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Vendas = ingressos pagos. "—" = a Central ainda não coleta Visitas LP e Checkouts do Meta. Para custos (CPM, CPA), abaixo da meta é melhor.</p>
          </div>
        );
      })}
    </div>
  );
}
