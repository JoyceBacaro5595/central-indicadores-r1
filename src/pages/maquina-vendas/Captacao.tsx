import { ROTA, mesmoEvento } from './rota';
import { brl, num } from './DashboardRota';
import type { Evento, MetaEvento } from './DashboardRota';

/* Em captação: ritmo atual x ritmo necessário para a meta, por cidade da Rota em andamento (modelo do painel da Joyce).
   A coluna Ação depende de regra ainda não definida e fica "—". */
const META_ING = 350;
const dia = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
const DIA = 86400000;

export default function Captacao({ eventos, meta }: { eventos: Evento[]; meta: MetaEvento[] }) {
  const hoje = dia(new Date().toISOString().slice(0, 10));
  const linhas = ROTA.cidades.filter((c) => dia(c.data) >= hoje).map((c) => {
    const ev = eventos.find((x) => mesmoEvento(x, c));
    const m = meta.find((x) => mesmoEvento(x, c));
    const ing = ev?.pagos ?? 0;
    const inv = m?.investimento == null ? null : Number(m.investimento);
    const rodando = Math.max(1, Math.round((hoje - dia(c.inicio)) / DIA));
    const restam = Math.max(1, Math.round((dia(ev?.data_evento ?? c.data) - hoje) / DIA));
    const alvo = ev?.meta_ingressos ?? META_ING;
    const ritmo = ing / rodando;
    return { c, ing, inv, rodando, restam, alvo, cpa: inv != null && ing ? inv / ing : null, ritmo, nec: Math.max(0, alvo - ing) / restam, proj: Math.round(ing + ritmo * restam) };
  });
  const semMidia = linhas.filter((l) => l.inv == null || l.inv === 0).length;
  const th = 'py-2 pr-3 font-semibold whitespace-nowrap uppercase text-[10px] tracking-wide';
  return (
    <section className="surface p-4 overflow-x-auto">
      <span className="section-label">Pacing · ritmo atual x ritmo necessário para {META_ING} · {ROTA.nome}</span>
      <p className="text-[10px] text-muted-foreground mt-1">{linhas.length} cidades em captação · {semMidia} sem investimento Meta registrado · investido {brl(linhas.reduce((a, l) => a + (l.inv ?? 0), 0))}</p>
      <table className="w-full text-xs mt-3">
        <thead><tr className="text-left text-muted-foreground">
          {['Cidade', 'Dias rodando / restantes', 'Investido', 'Ingressos', 'Progresso', 'CPA real', 'Ritmo / dia', 'Necessário / dia', 'Projeção', 'Ação'].map((h) => <th key={h} className={th}>{h}</th>)}
        </tr></thead>
        <tbody>{linhas.map((l) => (
          <tr key={l.c.cidade} className="border-t border-border/50">
            <td className="py-2 pr-3 font-semibold text-foreground whitespace-nowrap">{l.c.cidade}<div className="text-[10px] text-muted-foreground font-normal">{l.c.data.slice(8)}/{l.c.data.slice(5, 7)}</div></td>
            <td className="pr-3 mono">{l.rodando} / {l.restam}</td>
            <td className="pr-3 mono">{brl(l.inv)}</td>
            <td className="pr-3 mono font-semibold text-foreground">{num(l.ing)}</td>
            <td className="pr-3 w-36"><div className="h-1.5 rounded bg-secondary"><div className="h-1.5 rounded bg-amber-400" style={{ width: `${Math.min(100, (100 * l.ing) / l.alvo)}%` }} /></div><span className="text-[10px] text-muted-foreground">{((100 * l.ing) / l.alvo).toFixed(0)}% da meta</span></td>
            <td className="pr-3 mono">{brl(l.cpa)}</td>
            <td className="pr-3 mono">{l.ritmo.toFixed(1)}</td>
            <td className="pr-3 mono font-semibold text-foreground">{l.nec.toFixed(1)}</td>
            <td className="pr-3 mono">{num(l.proj)}</td>
            <td className="text-muted-foreground">—</td>
          </tr>))}</tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-3">Dias rodando contam desde o início da captação cadastrado na Rota. Projeção = ingressos atuais + ritmo atual × dias restantes. “—” = regra de ação ainda não definida.</p>
    </section>
  );
}
