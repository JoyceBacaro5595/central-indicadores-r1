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

/** Visão funil: impressões, cliques, visitas LP, checkouts e vendas por cidade; etapas sem coleta ficam "—". */
export function FunilRota({ linhas }: { linhas: LinhaRota[] }) {
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      {linhas.map((l) => {
        const impr = l.m ? Number(l.m.impressoes) : null; const cliq = l.m ? Number(l.m.cliques) : null;
        const etapas: { r: string; v: number | null; nota?: string }[] = [
          { r: 'Impressões', v: impr }, { r: 'Cliques no link', v: cliq },
          { r: 'Visitas LP', v: null, nota: 'não coletado' }, { r: 'Checkouts', v: null, nota: 'não coletado' }, { r: 'Vendas', v: l.vendas },
        ];
        const topo = etapas[0].v;
        return (
          <div key={l.c.cidade} className="rounded-xl border border-border bg-secondary/10 p-4 space-y-2">
            <div className="flex items-baseline justify-between"><h4 className="text-sm font-extrabold text-foreground">{l.c.cidade}</h4><span className="text-[10px] text-muted-foreground">Evento {dm(l.data)}</span></div>
            {etapas.map((e, i) => {
              const ant = i > 0 ? etapas[i - 1].v : null;
              const conv = e.v != null && ant ? (100 * e.v) / ant : null;
              const larg = e.v != null && topo ? Math.max(2, (100 * e.v) / topo) : 0;
              return (
                <div key={e.r} className="space-y-0.5" title={e.v == null ? e.nota : undefined}>
                  <div className="flex items-baseline justify-between text-xs"><span className="text-muted-foreground">{e.r}</span><span><span className="font-bold text-foreground tabular-nums">{num(e.v)}</span>{conv != null && <span className="ml-2 text-[10px] text-muted-foreground">{conv.toFixed(2).replace('.', ',')}% da etapa anterior</span>}</span></div>
                  <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full rounded bg-primary/70" style={{ width: `${larg}%` }} /></div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground">Vendas = ingressos pagos. Visitas LP e checkouts ainda não são coletados do Meta, por isso aparecem "—".</p>
          </div>
        );
      })}
    </div>
  );
}
