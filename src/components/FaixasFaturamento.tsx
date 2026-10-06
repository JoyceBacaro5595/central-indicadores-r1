import { BarChart3 } from 'lucide-react';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

interface Props {
  /** Faixas de faturamento vindas do formulário do HubSpot */
  faixas?: Record<string, number>;
  /** Total de leads do período (inclui quem não respondeu) */
  inscritos?: number;
  /** Investimento total do período para calcular custo por faixa */
  investido?: number;
}

export function FaixasFaturamento({ faixas, inscritos, investido }: Props) {
  const lista = Object.entries(faixas ?? {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const total = inscritos && inscritos > 0
    ? inscritos
    : lista.reduce((s, f) => s + f.value, 0);

  const maxPct = lista.length > 0 && total > 0
    ? Math.max(...lista.map((f) => f.value / total))
    : 0;

  return (
    <div className="surface px-5 py-4">
      <div className="flex items-center gap-2.5">
        <BarChart3 className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
          Faixa de faturamento
        </span>
      </div>

      {lista.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {lista.map((f, i) => {
            const pct = total > 0 ? (f.value / total) * 100 : 0;
            const width = maxPct > 0 ? Math.max((f.value / total / maxPct) * 100, 2) : 0;
            const custo = investido && f.value > 0 ? investido / f.value : 0;
            return (
              <div key={f.name} className="flex items-center gap-4">
                <span className="w-64 shrink-0 text-right text-xs text-muted-foreground leading-tight">
                  {f.name}
                </span>
                <div className="flex-1">
                  <div
                    className={`h-4 rounded-sm ${i === 0 ? 'bg-muted-foreground/60' : 'bg-red-600'}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-xs mono text-foreground">
                    {f.value} ({pct.toFixed(1)}%)
                  </span>
                  {custo > 0 && (
                    <span className="block text-[10px] text-muted-foreground/80">
                      custo {brl(custo)}
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
