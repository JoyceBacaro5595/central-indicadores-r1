import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart, CartesianGrid } from 'recharts';
import { DailyData } from '@/hooks/useDashboardData';
import { GuruDailyEntry } from '@/hooks/useGuruData';

interface DailyChartProps {
  daily: DailyData[];
  guruDaily?: GuruDailyEntry[];
}

export function DailyChart({ daily, guruDaily }: DailyChartProps) {
  const guruMap: Record<string, number> = {};
  if (guruDaily) {
    for (const g of guruDaily) {
      guruMap[g.date] = g.vendas;
    }
  }

  const chartData = daily.map(d => {
    const guruVendas = guruMap[d.date] ?? 0;
    return {
      date: d.date.slice(5),
      Vendas: guruVendas,
      Investimento: Math.round(d.spend),
      CPA: guruVendas > 0 ? Math.round(d.spend / guruVendas) : 0,
    };
  });

  return (
    <div className="section-container">
      <div className="flex items-center justify-between mb-5">
        <span className="section-label">Investimento e Vendas por dia</span>
        <div className="flex gap-5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ background: 'hsl(0 65% 50%)' }} />
            <span className="text-[10px] text-muted-foreground font-medium">Investimento</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ background: 'hsl(0 45% 35%)' }} />
            <span className="text-[10px] text-muted-foreground font-medium">Vendas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-[2px] rounded-full" style={{ background: 'hsl(45 70% 55%)' }} />
            <span className="text-[10px] text-muted-foreground font-medium">CPA</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(228 12% 14%)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'hsl(220 10% 40%)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: 'hsl(220 10% 40%)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: 'hsl(220 10% 40%)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(228 18% 10%)',
              border: '1px solid hsl(228 14% 16%)',
              borderRadius: 10,
              color: 'hsl(210 20% 93%)',
              fontSize: 12,
              fontFamily: 'DM Sans',
              boxShadow: '0 8px 32px -4px hsl(228 30% 4% / 0.5)',
            }}
          />
          <Bar yAxisId="left" dataKey="Investimento" fill="hsl(0 65% 50%)" radius={[4, 4, 0, 0]} />
          <Bar yAxisId="left" dataKey="Vendas" fill="hsl(0 45% 35%)" radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="CPA" stroke="hsl(45 70% 55%)" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
