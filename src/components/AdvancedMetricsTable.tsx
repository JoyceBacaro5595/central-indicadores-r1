import { DailyData } from '@/hooks/useDashboardData';
import { GuruDailyEntry } from '@/hooks/useGuruData';
import { TrendingUp, TrendingDown, AlertTriangle, Trophy, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface AdvancedMetricsTableProps {
  daily: DailyData[];
  guruDaily?: GuruDailyEntry[];
}

function fmt(v: number, decimals = 2): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(v: number): string {
  return `R$ ${fmt(v)}`;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function movingAverage(values: number[], index: number, window: number): number | null {
  if (index < window - 1) return null;
  let sum = 0;
  for (let i = index - window + 1; i <= index; i++) {
    sum += values[i];
  }
  return sum / window;
}

function getScore(cpv: number, ctr: number, connectRate: number, txConv: number): { value: number; label: string; color: string } {
  let score = 0;
  if (cpv <= 350) score += 30;
  else if (cpv <= 450) score += 22;
  else if (cpv <= 550) score += 15;
  else if (cpv <= 650) score += 8;
  else score += 3;

  if (ctr >= 3) score += 20;
  else if (ctr >= 2.5) score += 16;
  else if (ctr >= 2) score += 12;
  else if (ctr >= 1.5) score += 8;
  else score += 3;

  if (connectRate >= 82) score += 25;
  else if (connectRate >= 78) score += 20;
  else if (connectRate >= 74) score += 15;
  else if (connectRate >= 70) score += 10;
  else score += 4;

  if (txConv >= 3) score += 25;
  else if (txConv >= 2.5) score += 20;
  else if (txConv >= 2) score += 15;
  else if (txConv >= 1.5) score += 10;
  else score += 4;

  if (score >= 80) return { value: score, label: 'Ótimo', color: 'text-emerald-400' };
  if (score >= 65) return { value: score, label: 'Bom', color: 'text-green-400' };
  if (score >= 50) return { value: score, label: 'Regular', color: 'text-amber-400' };
  return { value: score, label: 'Atenção', color: 'text-red-400' };
}

function ChangeIndicator({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const isPositive = invert ? value < 0 : value > 0;
  const color = isPositive ? 'text-emerald-400' : 'text-red-400';
  const arrow = value > 0 ? '↑' : '↓';
  return (
    <span className={`text-[10px] font-medium ${color}`}>
      {arrow} {fmt(Math.abs(value), 1)}%
    </span>
  );
}

function AlertIcon({ cpv, prevCpv }: { cpv: number; prevCpv: number | null }) {
  if (prevCpv === null) return null;
  const change = pctChange(cpv, prevCpv);
  if (change !== null && change > 20) {
    return <AlertTriangle className="w-3 h-3 text-red-400 inline mr-1" />;
  }
  if (change !== null && change < -15) {
    return <TrendingDown className="w-3 h-3 text-emerald-400 inline mr-1" />;
  }
  return null;
}

// Mini sparkline bar chart
function Sparkline({ values, invert = false }: { values: number[]; invert?: boolean }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const trending = invert ? last < prev : last > prev;
  const barColor = trending ? 'bg-emerald-400/60' : 'bg-red-400/60';
  const lastBarColor = trending ? 'bg-emerald-400' : 'bg-red-400';

  return (
    <div className="flex items-end gap-[2px] h-6">
      {values.slice(-10).map((v, i, arr) => {
        const height = ((v - min) / range) * 100;
        const isLast = i === arr.length - 1;
        return (
          <div
            key={i}
            className={`w-[4px] rounded-sm ${isLast ? lastBarColor : barColor}`}
            style={{ height: `${Math.max(height, 8)}%` }}
          />
        );
      })}
    </div>
  );
}

// Trend card component
function TrendCard({ label, currentValue, change, sparkData, invert = false, prefix = '' }: {
  label: string;
  currentValue: string;
  change: number | null;
  sparkData: number[];
  invert?: boolean;
  prefix?: string;
}) {
  const isPositive = change !== null ? (invert ? change < 0 : change > 0) : null;
  const TrendIcon = change === null ? Minus : (change > 0 ? ArrowUpRight : ArrowDownRight);
  const trendColor = isPositive === null ? 'text-muted-foreground' : isPositive ? 'text-emerald-400' : 'text-red-400';
  const bgGlow = isPositive === null ? '' : isPositive ? 'border-emerald-400/20' : 'border-red-400/20';

  return (
    <div className={`surface flex flex-col gap-2 p-3 rounded-xl border ${bgGlow}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
        <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="text-base font-bold text-foreground mono">{prefix}{currentValue}</span>
          {change !== null && (
            <span className={`ml-2 text-[10px] font-semibold ${trendColor}`}>
              {change > 0 ? '+' : ''}{fmt(change, 1)}%
            </span>
          )}
        </div>
        <Sparkline values={sparkData} invert={invert} />
      </div>
    </div>
  );
}

export function AdvancedMetricsTable({ daily, guruDaily }: AdvancedMetricsTableProps) {
  const guruMap = new Map<string, GuruDailyEntry>();
  guruDaily?.forEach(g => guruMap.set(g.date, g));

  const sortedDaily = [...daily].sort((a, b) => a.date.localeCompare(b.date));

  const rows = sortedDaily.map((d) => {
    const guru = guruMap.get(d.date);
    const vendas = guru?.vendas ?? 0;
    const cpv = vendas > 0 ? d.spend / vendas : 0;
    const cpm = d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0;
    const cpc = d.clicks > 0 ? d.spend / d.clicks : 0;
    const ctr = d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0;
    const connectRate = d.clicks > 0 ? (d.landingPageViews / d.clicks) * 100 : 0;
    const txConv = d.landingPageViews > 0 ? (vendas / d.landingPageViews) * 100 : 0;
    const cPagina = d.landingPageViews > 0 ? d.spend / d.landingPageViews : 0;

    return { date: d.date, spend: d.spend, vendas, cpv, cpm, cpc, ctr, connectRate, txConv, cPagina, faturamento: guru?.faturamento ?? 0 };
  });

  const cpvArr = rows.map(r => r.cpv);

  const enrichedRows = rows.map((r, i) => ({
    ...r,
    ma3: movingAverage(cpvArr, i, 3),
    ma7: movingAverage(cpvArr, i, 7),
    ma14: movingAverage(cpvArr, i, 14),
    prevCpv: i > 0 ? rows[i - 1].cpv : null,
    prevVendas: i > 0 ? rows[i - 1].vendas : null,
    cpvChange: i > 0 ? pctChange(r.cpv, rows[i - 1].cpv) : null,
    vendasChange: i > 0 ? pctChange(r.vendas, rows[i - 1].vendas) : null,
    score: getScore(r.cpv, r.ctr, r.connectRate, r.txConv),
  }));

  const displayRows = enrichedRows; // ascending order

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  // Trend data (last 7 days)
  const recent7 = enrichedRows.slice(-7);
  const prev7 = enrichedRows.slice(-14, -7);

  const avg = (arr: typeof rows, key: keyof typeof rows[0]) => {
    const vals = arr.map(r => r[key] as number).filter(v => v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const sum = (arr: typeof rows, key: keyof typeof rows[0]) => {
    return arr.reduce((a, r) => a + (r[key] as number), 0);
  };

  const trendCpv = { current: avg(recent7, 'cpv'), prev: avg(prev7, 'cpv') };
  const trendVendas = { current: sum(recent7, 'vendas'), prev: sum(prev7, 'vendas') };
  const trendCtr = { current: avg(recent7, 'ctr'), prev: avg(prev7, 'ctr') };
  const trendConv = { current: avg(recent7, 'txConv'), prev: avg(prev7, 'txConv') };
  const trendConnect = { current: avg(recent7, 'connectRate'), prev: avg(prev7, 'connectRate') };
  const trendFat = { current: sum(recent7, 'faturamento'), prev: sum(prev7, 'faturamento') };

  return (
    <div className="section-container overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="section-label">Métricas Avançadas para Decisão</span>
          <p className="text-[10px] text-muted-foreground mt-1">
            Δ = variação dia anterior · MA3/7/14 = média móvel · Score = eficiência composta
          </p>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-amber-400" /> 500K+</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Ótimo</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Atenção</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-400" /> Alerta</span>
        </div>
      </div>

      {/* Trend Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <TrendCard
          label="CPV Médio"
          currentValue={fmt(trendCpv.current)}
          change={pctChange(trendCpv.current, trendCpv.prev)}
          sparkData={enrichedRows.slice(-14).map(r => r.cpv)}
          invert
          prefix="R$ "
        />
        <TrendCard
          label="Vendas 7D"
          currentValue={String(trendVendas.current)}
          change={pctChange(trendVendas.current, trendVendas.prev)}
          sparkData={enrichedRows.slice(-14).map(r => r.vendas)}
        />
        <TrendCard
          label="Faturamento 7D"
          currentValue={fmt(trendFat.current, 0)}
          change={pctChange(trendFat.current, trendFat.prev)}
          sparkData={enrichedRows.slice(-14).map(r => r.faturamento)}
          prefix="R$ "
        />
        <TrendCard
          label="CTR Médio"
          currentValue={`${fmt(trendCtr.current)}%`}
          change={pctChange(trendCtr.current, trendCtr.prev)}
          sparkData={enrichedRows.slice(-14).map(r => r.ctr)}
        />
        <TrendCard
          label="TX. Conversão"
          currentValue={`${fmt(trendConv.current)}%`}
          change={pctChange(trendConv.current, trendConv.prev)}
          sparkData={enrichedRows.slice(-14).map(r => r.txConv)}
        />
        <TrendCard
          label="Connect Rate"
          currentValue={`${fmt(trendConnect.current)}%`}
          change={pctChange(trendConnect.current, trendConnect.prev)}
          sparkData={enrichedRows.slice(-14).map(r => r.connectRate)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border">
              {['DATA', 'INVEST.', 'VENDAS', 'FATUR.', 'RETORNO', 'CPV', 'MA3', 'MA7', 'MA14', 'CPM', 'CPC', 'CTR', 'CONNECT', 'TX. CONV.', 'C/PÁGINA', 'SCORE'].map(h => (
                <th key={h} className="text-left px-2 py-2.5 font-semibold text-foreground uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => {
              const prevRow = idx > 0 ? enrichedRows[idx - 1] : null;
              
              return (
                <tr
                  key={row.date}
                  className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                >
                  <td className="px-2 py-2.5 font-medium text-foreground whitespace-nowrap">
                    {formatDate(row.date)}
                  </td>
                  <td className="px-2 py-2.5 mono text-foreground whitespace-nowrap">
                    {fmtCurrency(row.spend)}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className={`mono font-semibold ${row.vendas >= 100 ? 'text-emerald-400' : 'text-foreground'}`}>
                        {row.vendas >= 100 && <Trophy className="w-3 h-3 text-amber-400 inline mr-1" />}
                        {row.vendas}
                      </span>
                      <ChangeIndicator value={row.vendasChange} />
                    </div>
                  </td>
                  <td className="px-2 py-2.5 mono text-foreground whitespace-nowrap">
                    {fmtCurrency(row.faturamento)}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    {(() => {
                      const roas = row.spend > 0 ? row.faturamento / row.spend : 0;
                      const retorno = row.faturamento - row.spend;
                      return (
                        <div className="flex flex-col">
                          <span className={`mono font-semibold ${roas >= 2 ? 'text-emerald-400' : roas >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                            {fmt(roas)}x
                          </span>
                          <span className={`text-[10px] mono ${retorno >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                            {retorno >= 0 ? '+' : ''}{fmtCurrency(retorno)}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="mono font-semibold text-foreground">
                        <AlertIcon cpv={row.cpv} prevCpv={row.prevCpv} />
                        {fmtCurrency(row.cpv)}
                      </span>
                      <ChangeIndicator value={row.cpvChange} invert />
                    </div>
                  </td>
                  <td className="px-2 py-2.5 mono text-foreground whitespace-nowrap">
                    {row.ma3 !== null ? (
                      <div className="flex flex-col">
                        <span className={`font-medium ${row.ma3 < row.cpv ? 'text-emerald-400' : row.ma3 > row.cpv ? 'text-red-400' : 'text-foreground'}`}>
                          {fmtCurrency(row.ma3)}
                        </span>
                        {prevRow?.ma3 != null && row.ma3 != null && (
                          <span className="text-[10px] text-muted-foreground">
                            {fmt(pctChange(row.ma3, prevRow.ma3 as number) ?? 0, 1)}%
                          </span>
                        )}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-2 py-2.5 mono text-foreground whitespace-nowrap">
                    {row.ma7 !== null ? (
                      <span className={`font-medium ${row.ma7 < row.cpv ? 'text-emerald-400' : row.ma7 > row.cpv ? 'text-red-400' : 'text-foreground'}`}>
                        {fmtCurrency(row.ma7)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-2 py-2.5 mono text-foreground whitespace-nowrap">
                    {row.ma14 !== null ? (
                      <span className={`font-medium ${row.ma14 < row.cpv ? 'text-emerald-400' : row.ma14 > row.cpv ? 'text-red-400' : 'text-foreground'}`}>
                        {fmtCurrency(row.ma14)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <span className={`mono ${row.cpm > 60 ? 'text-red-400 font-semibold' : 'text-foreground'}`}>
                      R$ {fmt(row.cpm)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 mono text-foreground whitespace-nowrap">
                    R$ {fmt(row.cpc)}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <span className={`mono font-medium ${row.ctr >= 2.5 ? 'text-emerald-400' : row.ctr < 1.5 ? 'text-red-400' : 'text-foreground'}`}>
                      {fmt(row.ctr)}%
                    </span>
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <span className={`mono font-medium ${row.connectRate >= 80 ? 'text-emerald-400' : row.connectRate < 70 ? 'text-red-400' : 'text-foreground'}`}>
                      {fmt(row.connectRate)}%
                    </span>
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <span className={`mono font-semibold ${row.txConv >= 2.5 ? 'text-emerald-400' : row.txConv < 1.5 ? 'text-red-400 font-semibold' : 'text-foreground'}`}>
                      {fmt(row.txConv)}%
                    </span>
                  </td>
                  <td className="px-2 py-2.5 mono text-foreground whitespace-nowrap">
                    {fmtCurrency(row.cPagina)}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      row.score.label === 'Ótimo' ? 'bg-emerald-400/15 text-emerald-400' :
                      row.score.label === 'Bom' ? 'bg-green-400/15 text-green-400' :
                      row.score.label === 'Regular' ? 'bg-amber-400/15 text-amber-400' :
                      'bg-red-400/15 text-red-400'
                    }`}>
                      {row.score.value} {row.score.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Totals row */}
          {(() => {
            const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
            const totalVendas = rows.reduce((s, r) => s + r.vendas, 0);
            const totalFat = rows.reduce((s, r) => s + r.faturamento, 0);
            const avgCpv = totalVendas > 0 ? totalSpend / totalVendas : 0;
            const totalImpressions = daily.reduce((s, d) => s + d.impressions, 0);
            const totalClicks = daily.reduce((s, d) => s + d.clicks, 0);
            const totalLpv = daily.reduce((s, d) => s + d.landingPageViews, 0);
            const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
            const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
            const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
            const avgConnect = totalClicks > 0 ? (totalLpv / totalClicks) * 100 : 0;
            const avgConv = totalLpv > 0 ? (totalVendas / totalLpv) * 100 : 0;
            const avgCPagina = totalLpv > 0 ? totalSpend / totalLpv : 0;
            const totalScore = getScore(avgCpv, avgCtr, avgConnect, avgConv);

            return (
              <tfoot>
                <tr className="border-t-2 border-border bg-secondary/20 font-semibold">
                  <td className="px-2 py-3 text-foreground whitespace-nowrap">Total / Média</td>
                  <td className="px-2 py-3 mono text-foreground whitespace-nowrap">{fmtCurrency(totalSpend)}</td>
                  <td className="px-2 py-3 mono text-foreground whitespace-nowrap font-bold">{totalVendas}</td>
                  <td className="px-2 py-3 mono text-foreground whitespace-nowrap">{fmtCurrency(totalFat)}</td>
                  <td className="px-2 py-3 whitespace-nowrap">
                    {(() => {
                      const roas = totalSpend > 0 ? totalFat / totalSpend : 0;
                      const retorno = totalFat - totalSpend;
                      return (
                        <div className="flex flex-col">
                          <span className={`mono font-semibold ${roas >= 2 ? 'text-emerald-400' : roas >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                            {fmt(roas)}x
                          </span>
                          <span className={`text-[10px] mono ${retorno >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                            {retorno >= 0 ? '+' : ''}{fmtCurrency(retorno)}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-3 mono text-foreground whitespace-nowrap">{fmtCurrency(avgCpv)}</td>
                  <td className="px-2 py-3 mono text-muted-foreground whitespace-nowrap">—</td>
                  <td className="px-2 py-3 mono text-muted-foreground whitespace-nowrap">—</td>
                  <td className="px-2 py-3 mono text-muted-foreground whitespace-nowrap">—</td>
                  <td className="px-2 py-3 mono text-foreground whitespace-nowrap">R$ {fmt(avgCpm)}</td>
                  <td className="px-2 py-3 mono text-foreground whitespace-nowrap">R$ {fmt(avgCpc)}</td>
                  <td className="px-2 py-3 mono text-foreground whitespace-nowrap">{fmt(avgCtr)}%</td>
                  <td className="px-2 py-3 mono text-foreground whitespace-nowrap">{fmt(avgConnect)}%</td>
                  <td className="px-2 py-3 mono text-foreground whitespace-nowrap">{fmt(avgConv)}%</td>
                  <td className="px-2 py-3 mono text-foreground whitespace-nowrap">{fmtCurrency(avgCPagina)}</td>
                  <td className="px-2 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      totalScore.label === 'Ótimo' ? 'bg-emerald-400/15 text-emerald-400' :
                      totalScore.label === 'Bom' ? 'bg-green-400/15 text-green-400' :
                      totalScore.label === 'Regular' ? 'bg-amber-400/15 text-amber-400' :
                      'bg-red-400/15 text-red-400'
                    }`}>
                      {totalScore.value} {totalScore.label}
                    </span>
                  </td>
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>
    </div>
  );
}
