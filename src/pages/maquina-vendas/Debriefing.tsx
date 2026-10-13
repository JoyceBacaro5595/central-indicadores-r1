import { useMemo, useState } from 'react';
import { HISTORICO, mesmoEvento } from './rota';
import { brl, num, pct } from './DashboardRota';
import type { Evento, MetaEvento } from './DashboardRota';

/* Debriefing por cidade (modelo do painel da Joyce, pedido do Jonathas para o Ricardo ter o histórico de cada evento).
   Só mostra o que a Central calcula; vendas/CAC RGV, conversão da página, classificação e diagnóstico ficam "—" até as regras serem definidas. */
const META_ING = 350;
const META_CPA = 286;
const dataBR = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);

export default function Debriefing({ eventos, meta }: { eventos: Evento[]; meta: MetaEvento[] }) {
  const [busca, setBusca] = useState('');
  const hoje = new Date().toISOString().slice(0, 10);
  const linhas = useMemo(() => HISTORICO.filter((c) => c.data <= hoje).map((c) => {
    const ev = eventos.find((x) => mesmoEvento(x, c));
    const m = meta.find((x) => mesmoEvento(x, c));
    const inv = m?.investimento == null ? null : Number(m.investimento);
    const ing = ev?.pagos ?? null;
    const cpa = inv != null && ing ? inv / ing : null;
    return { ...c, inv, ing, cpa, pctMeta: ing == null ? null : (100 * ing) / (ev?.meta_ingressos ?? META_ING) };
  }).filter((l) => !busca || l.cidade.toLowerCase().includes(busca.toLowerCase())), [eventos, meta, busca, hoje]);
  const totInv = linhas.reduce((a, l) => a + (l.inv ?? 0), 0);
  const totIng = linhas.reduce((a, l) => a + (l.ing ?? 0), 0);
  const th = 'py-2 pr-3 font-semibold whitespace-nowrap uppercase text-[10px] tracking-wide';
  return (
    <section className="surface p-4 overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="section-label">Debriefing por cidade · histórico de cada evento</span>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar cidade" className="text-xs bg-secondary rounded px-2 py-1 text-foreground" />
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{linhas.length} eventos realizados · investimento {brl(totInv)} · {num(totIng)} ingressos pagos · CPA médio {totIng ? brl(totInv / totIng) : '—'} (meta {brl(META_CPA)} · {META_ING} ingressos)</p>
      <table className="w-full text-xs mt-3">
        <thead><tr className="text-left text-muted-foreground">
          {['Data', 'Cidade', 'Invest.', 'Ingressos', 'CPA real', '% meta', 'Conv. pág.', 'Vendas RGV', 'CAC RGV', 'Classificação', 'Diagnóstico'].map((h) => <th key={h} className={th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.cidade + l.data} className="border-t border-border/50">
              <td className="py-2 pr-3 mono">{dataBR(l.data)}</td>
              <td className="pr-3 font-semibold text-foreground whitespace-nowrap">{l.cidade}</td>
              <td className="pr-3 mono">{brl(l.inv)}</td>
              <td className="pr-3 mono">{num(l.ing)}</td>
              <td className={`pr-3 mono font-semibold ${l.cpa != null && l.cpa > META_CPA ? 'text-amber-400' : 'text-foreground'}`}>{brl(l.cpa)}</td>
              <td className="pr-3 mono">{pct(l.pctMeta)}</td>
              <td className="pr-3 mono text-muted-foreground">—</td><td className="pr-3 mono text-muted-foreground">—</td><td className="pr-3 mono text-muted-foreground">—</td>
              <td className="pr-3 text-muted-foreground">—</td><td className="text-muted-foreground">—</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-3">“—” = sem dado ou regra ainda não definida (não é zero). CPA real = investimento Meta ÷ ingressos pagos. Os dados de Meta estão parados desde 07/10 por token expirado.</p>
    </section>
  );
}
