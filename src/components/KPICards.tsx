import { Totals } from '@/hooks/useDashboardData';

function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

interface KPICardsProps {
  totals: Totals;
  guruVendas?: number;
}

export function KPICards({ totals, guruVendas }: KPICardsProps) {
  const vendas = guruVendas ?? totals.purchases;
  const custoVenda = vendas > 0 ? totals.spend / vendas : 0;
  const conversao = totals.landingPageViews > 0 ? (vendas / totals.landingPageViews) * 100 : 0;

  const kpis = [
    { label: 'Investimento', value: formatCurrency(totals.spend), highlight: true },
    { label: 'Impressões', value: formatNumber(totals.impressions) },
    { label: 'CPM', value: formatCurrency(totals.cpm) },
    { label: 'CTR', value: formatPercent(totals.ctr) },
    { label: 'Connect Rate', value: formatPercent(totals.connectRate) },
    { label: 'Conversão', value: formatPercent(conversao) },
    { label: 'Vendas (Guru)', value: formatNumber(vendas) },
    { label: 'Custo por Venda', value: formatCurrency(custoVenda), highlight: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
      {kpis.map(({ label, value, highlight }) => (
        <div key={label} className={highlight ? 'kpi-card-highlight' : 'kpi-card'}>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value mono">{value}</div>
        </div>
      ))}
    </div>
  );
}
