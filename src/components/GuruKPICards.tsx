import { GuruTotals } from '@/hooks/useGuruData';
import { DollarSign, ShoppingCart, Package, Users, RotateCcw } from 'lucide-react';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

function formatPercent(gross: number, net: number): string {
  if (gross === 0) return '0%';
  return `${((net / gross) * 100).toFixed(2)}%`;
}

interface GuruKPICardsProps {
  totals: GuruTotals;
  spend?: number;
}

export function GuruKPICards({ totals, spend }: GuruKPICardsProps) {
  const roas = spend && spend > 0 ? totals.faturamento / spend : 0;
  const retornoLiquido = spend ? totals.faturamento - spend : 0;
  const cards = [
    { label: 'Faturamento', value: formatCurrency(totals.faturamento), icon: DollarSign, colorClass: 'text-emerald-400' },
    { label: 'Vendas', value: formatNumber(totals.vendas), icon: ShoppingCart },
    { label: 'Produtos', value: formatNumber(totals.produtos), icon: Package },
    { label: 'Clientes Novos', value: formatNumber(totals.clientesNovos), icon: Users },
    { label: 'Reembolsos', value: formatNumber(totals.reembolsos), icon: RotateCcw },
  ];

  const bottomCards = [
    { label: 'Total em Vendas', value: formatCurrency(totals.faturamento) },
    { label: 'Total Líquido', value: formatCurrency(totals.totalLiquido) },
    { label: 'Líquido', value: formatPercent(totals.faturamento, totals.totalLiquido) },
    { label: 'Produtos Vendidos', value: formatNumber(totals.produtos) },
    { label: 'Ticket Médio', value: formatCurrency(totals.ticketMedio) },
    { label: 'Lucro Médio', value: formatCurrency(totals.lucroMedio) },
    { label: 'ROAS', value: `${roas.toFixed(2)}x`, highlight: roas >= 2 },
    { label: 'Retorno Líquido', value: formatCurrency(retornoLiquido), colorClass: retornoLiquido >= 0 ? 'text-emerald-400' : 'text-red-400' },
  ];

  return (
    <div className="space-y-3">
      <span className="section-label">Dados de Vendas (Guru)</span>
      
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {cards.map(({ label, value, icon: Icon, colorClass }) => (
          <div key={label} className="kpi-card flex items-center justify-between gap-2">
            <div>
              <div className="kpi-label">{label}</div>
              <div className={`kpi-value mono ${colorClass || ''}`}>{value}</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {bottomCards.map(({ label, value, highlight, colorClass }) => (
          <div key={label} className={highlight ? 'kpi-card-highlight' : 'surface p-3.5'}>
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
            <div className={`text-sm font-bold mt-1.5 mono ${colorClass || 'text-foreground'}`}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
