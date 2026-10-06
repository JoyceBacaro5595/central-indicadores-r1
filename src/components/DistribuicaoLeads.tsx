import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export interface DistItem {
  name: string;
  value: number;
}

export interface DistGrupo {
  campanhas: DistItem[];
  publicos: DistItem[];
  criativos: DistItem[];
}

const COLORS = [
  'hsl(0 72% 51%)',
  'hsl(0 55% 44%)',
  'hsl(0 40% 36%)',
  'hsl(0 25% 30%)',
  'hsl(220 10% 42%)',
  'hsl(220 8% 34%)',
  'hsl(228 8% 28%)',
  'hsl(228 6% 22%)',
  'hsl(0 15% 26%)',
];

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function DonutSection({ title, data }: { title: string; data: DistItem[] }) {
  const safe = (data || []).filter((d) => d.value > 0);
  const top = safe.slice(0, 8);
  const outros = safe.slice(8).reduce((s, e) => s + e.value, 0);
  const chartData = [...top, ...(outros > 0 ? [{ name: 'Outros', value: outros }] : [])];
  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex-1 min-w-[280px]">
      <span className="section-label">{title}</span>
      {chartData.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="flex items-start gap-4 mt-4">
          <div className="w-[140px] h-[140px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={65}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(220 20% 18%)',
                    border: '1px solid hsl(220 15% 28%)',
                    borderRadius: 10,
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                  itemStyle={{ color: '#ffffff' }}
                  formatter={(value: number, name: string) => [`${value} leads`, name]}
                  labelStyle={{ display: 'none' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1.5 overflow-hidden pt-1 min-w-0 flex-1">
            {chartData.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <div
                  className="w-2.5 h-2.5 rounded flex-shrink-0"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span className="text-foreground truncate min-w-0 flex-1" title={d.name}>
                  {truncate(d.name, 32)}
                </span>
                <span className="text-muted-foreground flex-shrink-0 mono">{d.value}</span>
                <span className="text-foreground font-bold flex-shrink-0 mono w-[46px] text-right">
                  {total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : '0%'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  titulo: string;
  subtitulo: string;
  total?: number;
  dist?: DistGrupo;
}

export function DistribuicaoLeads({ titulo, subtitulo, total, dist }: Props) {
  return (
    <div className="surface px-5 py-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <span className="section-label">{subtitulo}</span>
          <h2 className="text-xl font-extrabold text-foreground mt-1">{titulo}</h2>
        </div>
        {total != null && (
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {total} leads
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-8 mt-6">
        <DonutSection title="Campanhas" data={dist?.campanhas ?? []} />
        <DonutSection title="Públicos" data={dist?.publicos ?? []} />
        <DonutSection title="Criativos" data={dist?.criativos ?? []} />
      </div>
    </div>
  );
}
