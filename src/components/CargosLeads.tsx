import { Briefcase } from 'lucide-react';

interface Props {
  /** Total investido no período */
  investido?: number;
  /** Total de leads do período */
  inscritos?: number;
  /** Leads por cargo */
  cargos?: { name: string; value: number }[];
  /** MQL por cargo */
  cargosMql?: { name: string; value: number }[];
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function CargosLeads({ investido, inscritos, cargos, cargosMql }: Props) {
  const totalLeads = cargos?.reduce((s, c) => s + c.value, 0) ?? 0;
  const cpl = investido != null && inscritos != null && inscritos > 0 ? investido / inscritos : null;
  const mqlMap = new Map((cargosMql ?? []).map((c) => [c.name, c.value]));

  const lista = (cargos ?? [])
    .map((c) => ({ ...c, mql: mqlMap.get(c.name) ?? 0 }))
    .sort((a, b) => b.value - a.value);

  const maxPct = lista.length > 0 && totalLeads > 0
    ? Math.max(...lista.map((c) => c.value / totalLeads))
    : 0;

  return (
    <div className="surface px-5 py-4">
      <div className="flex items-center gap-2.5">
        <Briefcase className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
          Cargos dos leads
        </span>
      </div>

      {lista.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {lista.map((c, i) => {
            const pct = totalLeads > 0 ? (c.value / totalLeads) * 100 : 0;
            const width = maxPct > 0 ? Math.max((c.value / totalLeads / maxPct) * 100, 2) : 0;
            const custoMql = cpl != null && c.mql > 0 ? (cpl * c.value) / c.mql : null;
            return (
              <div key={c.name} className="flex items-center gap-4">
                <span className="w-64 shrink-0 text-right text-xs text-muted-foreground leading-tight">
                  {c.name}
                </span>
                <div className="flex-1">
                  <div
                    className="h-4 rounded-sm bg-red-600"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-xs mono text-foreground">
                    {c.value} ({pct.toFixed(1)}%)
                  </span>
                  {custoMql != null && (
                    <span className="block text-[10px] text-muted-foreground/80">
                      custo/mql {brl(custoMql)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
