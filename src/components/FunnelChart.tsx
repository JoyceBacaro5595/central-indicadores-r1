import { Totals } from '@/hooks/useDashboardData';

interface FunnelChartProps {
  totals: Totals;
  guruVendas?: number;
}

function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function FunnelChart({ totals, guruVendas }: FunnelChartProps) {
  const vendasValue = guruVendas ?? totals.purchases;
  const steps = [
    { label: 'Investimento', value: formatCurrency(totals.spend), width: '65%' },
    { label: 'Alcance', value: formatNumber(totals.reach), width: '75%' },
    { label: 'Impressões', value: formatNumber(totals.impressions), width: '85%' },
    { label: 'Cliques', value: formatNumber(totals.clicks), width: '65%' },
    { label: 'Visualização da Página', value: formatNumber(totals.landingPageViews), width: '65%' },
    { label: 'Initiate Checkout', value: formatNumber(totals.initiateCheckout), width: '65%' },
    { label: 'Vendas (Guru)', value: formatNumber(vendasValue), width: '65%' },
  ];

  const sideMetricsLeft = [
    { label: 'CTR', value: formatPercent(totals.ctr) },
    { label: 'Conect Rate', value: formatPercent(totals.connectRate) },
    { label: 'Tx. Conv. PV', value: formatPercent(totals.landingPageViews > 0 ? (totals.initiateCheckout / totals.landingPageViews) * 100 : 0) },
    { label: 'Conversão', value: formatPercent(totals.landingPageViews > 0 ? (vendasValue / totals.landingPageViews) * 100 : 0) },
  ];

  const sideMetricsRight = [
    { label: 'CPM', value: formatCurrency(totals.cpm) },
    { label: 'CPC', value: formatCurrency(totals.cpc) },
    { label: 'Custo por V. de Página', value: formatCurrency(totals.costPerLPV) },
    { label: 'Custo por Init. Checkout', value: formatCurrency(totals.costPerIC) },
    { label: 'Custo por Venda', value: formatCurrency(vendasValue > 0 ? totals.spend / vendasValue : 0) },
  ];

  const dropoffs = [
    null,
    null,
    totals.reach > 0 ? ((totals.impressions - totals.reach) / totals.reach * 100) : 0,
    totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100) : 0,
    totals.clicks > 0 ? ((totals.landingPageViews / totals.clicks) * 100) : 0,
    totals.landingPageViews > 0 ? ((totals.initiateCheckout / totals.landingPageViews) * 100) : 0,
    totals.initiateCheckout > 0 ? ((vendasValue / totals.initiateCheckout) * 100) : 0,
  ];

  // All metrics combined for mobile compact view
  const mobileMetrics = [
    ...steps.map(s => ({ label: s.label, value: s.value, highlight: s.label === 'Investimento' })),
    ...sideMetricsLeft.map(m => ({ label: m.label, value: m.value, highlight: false })),
    ...sideMetricsRight.map(m => ({ label: m.label, value: m.value, highlight: m.label === 'Custo por Venda' })),
  ];

  return (
    <div className="section-container">
      <span className="section-label">Funil Otimizado Meta ADS</span>
      
      {/* Desktop: 3-column funnel layout */}
      <div className="funnel-layout mt-5 funnel-desktop">
        {/* Left - TAXAS */}
        <div className="funnel-side">
          <div className="text-[9px] font-bold text-primary uppercase tracking-[0.15em] mb-3">Taxas</div>
          <div className="funnel-side-grid">
            {sideMetricsLeft.map(m => (
              <div key={m.label} className="side-metric">
                <div className="side-metric-label">{m.label}</div>
                <div className="side-metric-value mono">{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Center - FUNNEL */}
        <div className="flex-1 flex flex-col items-center gap-2">
          {steps.map((step, i) => (
            <div key={step.label} className="w-full flex justify-center">
              <div className="funnel-box" style={{ width: step.width, maxWidth: '520px' }}>
                <div className="funnel-label">{step.label}</div>
                <div className="funnel-value mono">{step.value}</div>
                {dropoffs[i] !== null && dropoffs[i] !== undefined && (
                  <div className="funnel-change absolute -bottom-1 right-3 text-[9px]">
                    ↓ {Math.abs(dropoffs[i]!).toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Right - CUSTOS */}
        <div className="funnel-side">
          <div className="text-[9px] font-bold text-primary uppercase tracking-[0.15em] mb-3 text-right">Custos</div>
          <div className="funnel-side-grid">
            {sideMetricsRight.map(m => (
              <div key={m.label} className="side-metric">
                <div className="side-metric-label">{m.label}</div>
                <div className="side-metric-value mono">{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: compact card grid */}
      <div className="funnel-mobile mt-4">
        <div className="grid grid-cols-2 gap-2">
          {mobileMetrics.map(m => (
            <div key={m.label} className={m.highlight ? 'kpi-card-highlight' : 'kpi-card'}>
              <div className="kpi-label">{m.label}</div>
              <div className="kpi-value mono text-sm">{m.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
