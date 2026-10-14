import { HISTORICO, ROTA, mesmoEvento } from './rota';
import { num } from './DashboardRota';
import type { Evento } from './DashboardRota';

/* Calendário do ano por mês + próximas aberturas (regra E-52 produção / E-45 vendas, como no painel da Joyce). */
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const dia = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
const DIA = 86400000;
const menos = (iso: string, n: number) => new Date(dia(iso) - n * DIA).toISOString().slice(0, 10);
const dm = (iso: string) => iso.slice(8) + '/' + iso.slice(5, 7);

export default function Calendario({ eventos }: { eventos: Evento[] }) {
  const hoje = dia(new Date().toISOString().slice(0, 10));
  const todos = [...HISTORICO, ...ROTA.cidades.map(({ cidade, data }) => ({ cidade, data }))].filter((c, i, a) => a.findIndex((x) => x.cidade === c.cidade && x.data === c.data) === i);
  const ing = (c: { cidade: string; data: string }) => eventos.find((e) => mesmoEvento(e, c))?.pagos ?? null;
  const proximas = todos.filter((c) => dia(c.data) >= hoje && !ing(c));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {MESES.map((nome, i) => {
          const lista = todos.filter((c) => Number(c.data.slice(5, 7)) === i + 1).sort((a, b) => a.data.localeCompare(b.data));
          if (!lista.length) return null;
          return (
            <section key={nome} className="surface p-3">
              <div className="text-xs font-bold text-foreground">{nome} <span className="font-normal text-muted-foreground">· {lista.length} cidades</span></div>
              <ul className="mt-2 space-y-1 text-xs">
                {lista.map((c) => {
                  const n = ing(c); const futuro = dia(c.data) >= hoje;
                  return <li key={c.cidade + c.data} className="flex justify-between gap-2"><span><span className="mono text-muted-foreground">{dm(c.data)}</span> <span className={futuro ? 'text-amber-400' : 'text-foreground'}>{c.cidade}</span></span><span className="mono text-muted-foreground">{n == null ? '—' : `${num(n)} ingr.`}</span></li>;
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <section className="surface p-4 overflow-x-auto">
        <span className="section-label">Próximas aberturas · regra E-52 (produção) / E-45 (vendas)</span>
        <table className="w-full text-xs mt-3">
          <thead><tr className="text-left text-muted-foreground uppercase text-[10px]"><th className="py-2 pr-3">Evento</th><th className="pr-3">Cidade</th><th className="pr-3">Produção (E-52)</th><th className="pr-3">Abrir vendas (E-45)</th><th>Status</th></tr></thead>
          <tbody>{proximas.sort((a, b) => a.data.localeCompare(b.data)).map((c) => {
            const abre = menos(c.data, 45);
            const atraso = Math.round((hoje - dia(abre)) / DIA);
            return <tr key={c.cidade + c.data} className="border-t border-border/50"><td className="py-2 pr-3 mono">{dm(c.data)}</td><td className="pr-3 font-semibold text-foreground">{c.cidade}</td><td className="pr-3 mono">{dm(menos(c.data, 52))}</td><td className="pr-3 mono">{dm(abre)}</td><td className={atraso > 0 ? 'text-red-400' : 'text-emerald-400'}>{atraso > 0 ? `atrasado ${atraso}d` : 'no prazo'}</td></tr>;
          })}</tbody>
        </table>
        <p className="text-[10px] text-muted-foreground mt-3">Lista só eventos futuros sem ingresso vendido. As datas vêm da Rota 45 e do histórico cadastrado no código; rotas seguintes entram quando forem cadastradas em Eventos e metas.</p>
      </section>
    </div>
  );
}
