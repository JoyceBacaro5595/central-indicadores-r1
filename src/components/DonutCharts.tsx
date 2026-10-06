import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { BreakdownEntry } from '@/hooks/useDashboardData';

interface DonutChartsProps {
  campaigns: BreakdownEntry[];
  audiences: BreakdownEntry[];
  creatives: BreakdownEntry[];
}

const COLORS = [
  'hsl(0 55% 48%)',
  'hsl(0 35% 38%)',
  'hsl(0 20% 32%)',
  'hsl(220 15% 35%)',
  'hsl(220 10% 28%)',
  'hsl(228 12% 24%)',
  'hsl(228 10% 20%)',
  'hsl(228 8% 30%)',
  'hsl(0 10% 25%)',
  'hsl(220 8% 38%)',
];

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function formatCurrency(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DonutSection({ title, data, valueKey }: { title: string; data: BreakdownEntry[]; valueKey: 'spend' | 'purchases' }) {
  const safeData = data || [];
  const top = safeData.slice(0, 8);
  const others = safeData.slice(8);
  const othersSum = others.reduce((s, e) => s + e[valueKey], 0);
  const chartData = [
    ...top.map(e => ({ name: e.name, value: e[valueKey] })),
    ...(othersSum > 0 ? [{ name: 'Outros', value: othersSum }] : []),
  ].filter(d => d.value > 0);

  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex-1 min-w-[280px]">
      <span className="section-label">{title}</span>
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
                  background: 'hsl(0 0% 98%)',
                  border: '1px solid hsl(220 10% 85%)',
                  borderRadius: 10,
                  color: 'hsl(228 12% 14%)',
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: '0 8px 32px -4px hsl(228 30% 4% / 0.2)',
                }}
                formatter={(value: number, name: string) => [
                  valueKey === 'spend' ? formatCurrency(value) : `${value} vendas`,
                  name,
                ]}
                labelStyle={{ display: 'none' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-1.5 overflow-hidden pt-1 min-w-0 flex-1">
          {chartData.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <div className="w-2.5 h-2.5 rounded flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="text-foreground truncate min-w-0 flex-1" title={d.name}>
                {truncate(d.name, 32)}
              </span>
              <span className="text-muted-foreground flex-shrink-0 mono">
                {valueKey === 'purchases' ? `${d.value}v` : formatCurrency(d.value)}
              </span>
              <span className="text-foreground font-bold flex-shrink-0 mono w-[42px] text-right">
                {total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : '0%'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DonutCharts({ campaigns, audiences, creatives }: DonutChartsProps) {
  return (
    <div className="section-container">
      <div className="flex flex-wrap gap-8">
        <DonutSection title="Campanhas" data={campaigns} valueKey="purchases" />
        <DonutSection title="Públicos" data={audiences} valueKey="purchases" />
        <DonutSection title="Criativos" data={creatives} valueKey="purchases" />
      </div>
    </div>
  );
}
