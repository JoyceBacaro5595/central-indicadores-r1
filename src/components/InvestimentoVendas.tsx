import { BarChart3, DollarSign } from 'lucide-react';
import type { DailyData } from '@/hooks/useDashboardData';

const META_INVESTIMENTO = 66000;
const EVENTO = new Date(2026, 8, 21);

/** semáforo: verde = atingiu, amarelo = até 10% abaixo, vermelho = mais distante */
function corMetaTabela(raw: number | null, metaNum: number | null, menorMelhor = false) {
  if (raw == null || metaNum == null || metaNum === 0 || raw === 0) return 'text-foreground';
  const ratio = menorMelhor ? metaNum / raw : raw / metaNum;
  if (ratio >= 1) return 'text-emerald-500';
  if (ratio >= 0.9) return 'text-amber-500';
  return 'text-red-500';
}

/** CPMQL: acima da meta fica vermelho, na meta ou abaixo fica verde */
function corCpmql(raw: number | null, metaNum: number) {
  if (raw == null || raw === 0) return 'text-foreground';
  return raw > metaNum ? 'text-red-500' : 'text-emerald-500';
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

function diasRestantes() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diff = Math.ceil((EVENTO.getTime() - inicio.getTime()) / 86400000);
  return Math.max(diff, 0);
}

interface Props {
  investido?: number;
  daily?: DailyData[];
}

export function InvestimentoVendas({ investido: investidoProp, daily }: Props) {
  const dias = diasRestantes();
  const investido = investidoProp ?? null;
  const pct = investido != null ? (investido / META_INVESTIMENTO) * 100 : null;
  const diasRodando = daily?.length ?? 0;
  const ritmoDia = investido != null && diasRodando > 0 ? investido / diasRodando : null;
  const necessarioDia = investido != null && dias > 0
    ? Math.max(META_INVESTIMENTO - investido, 0) / dias
    : null;

  return (
    <div className="space-y-4">
      {/* Painel de meta de investimento */}
      <div className="surface px-5 py-4 border-emerald-500/40">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-500">
              Investimento atingido
            </span>
          </div>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {dias}d restantes · Evento 21/09
          </span>
        </div>

        <div className="mt-4 flex items-end gap-4 flex-wrap">
          <div>
            <p className="text-3xl font-extrabold mono tracking-tight text-foreground">
              {investido != null ? brl(investido) : '—'}
            </p>
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              {investido != null
                ? `${brl(investido)} de ${brl(META_INVESTIMENTO)} (${pct?.toFixed(1)}%)`
                : `Meta de investimento ${brl(META_INVESTIMENTO)}`}
            </p>
          </div>
        </div>

        {/* barra de progresso */}
        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${pct != null ? Math.min(pct, 100) : 0}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
            <span>{pct != null ? `${pct.toFixed(1)}% da meta` : '0% da meta'}</span>
            <span>Meta {brl(META_INVESTIMENTO)}</span>
          </div>
        </div>

        {/* mini métricas */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-border pt-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Ritmo/dia</div>
            <div className="text-sm font-bold mono text-foreground mt-1">
              {ritmoDia != null ? brl(ritmoDia) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Saldo</div>
            <div className="text-sm font-bold mono text-foreground mt-1">
              {investido != null ? brl(Math.max(META_INVESTIMENTO - investido, 0)) : brl(META_INVESTIMENTO)}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Necessário/dia</div>
            <div className="text-sm font-bold mono text-foreground mt-1">
              {necessarioDia != null ? brl(necessarioDia) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status</div>
            <div className="text-sm font-bold mono text-foreground mt-1">
              {investido != null && investido > 0 ? 'No ar' : 'Aguardando'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChartProps {
  daily?: DailyData[];
  guruDaily?: { date: string; vendas: number; faturamento: number }[];
  gratuito?: boolean;
  leadsDaily?: { date: string; inscricoes: number; qualificados?: number }[];
}

export function InvestimentoVendasChart({ daily, guruDaily, gratuito, leadsDaily }: ChartProps) {
  const vendasPorDia = new Map((guruDaily || []).map((g) => [g.date, g.vendas]));
  const leadsPorDia = new Map((leadsDaily || []).map((l) => [l.date, l]));
  const adsPorDia = new Map((daily || []).map((d) => [d.date, d]));

  const brl0 = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}%`);

  const dias = Array.from(
    new Set([
      ...(daily || []).map((d) => d.date),
      ...(gratuito ? (leadsDaily || []).map((l) => l.date) : (guruDaily || []).map((g) => g.date)),
    ]),
  ).sort();

  // metas do funil horizontal (pacing diário para leads/MQL/investimento)
  const totalDias = Math.max(dias.length, 8); // fallback para o período 14/09–21/09
  const metaInvestimentoDia = META_INVESTIMENTO / totalDias;
  const META_LEADS_DIA = 178;
  const META_MQL_DIA = 54;
  const META_CPL = 47;
  const META_CPMQL = 150;
  const META_TAXA_QUALIFICACAO = 50;
  const META_CPM = 35;
  const META_CTR = 1;
  const META_CONNECT = 75;
  const META_CONV_PAGINA = 10;

  const data = dias.map((date) => {
    const d = adsPorDia.get(date);
    const spend = d?.spend ?? 0;
    const impressions = d?.impressions ?? 0;
    const cliques = d?.linkClicks ?? d?.clicks ?? 0;
    const lpv = d?.landingPageViews ?? 0;
    const dia = date.slice(8, 10) + '/' + date.slice(5, 7);
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : null;
    const ctr = impressions > 0 ? (cliques / impressions) * 100 : null;
    const connect = cliques > 0 ? (lpv / cliques) * 100 : null;
    const hs = leadsPorDia.get(date);
    const leads = gratuito ? hs?.inscricoes ?? 0 : vendasPorDia.get(date) ?? 0;
    const mql = gratuito ? hs?.qualificados ?? 0 : 0;
    const convPagina = lpv > 0 ? (leads / lpv) * 100 : null;
    const taxaQualificacao = gratuito && leads > 0 ? (mql / leads) * 100 : null;
    const custoLead = leads > 0 && spend > 0 ? spend / leads : null;
    const cpmql = mql > 0 && spend > 0 ? spend / mql : null;
    return {
      dia,
      investimento: spend,
      leads,
      mql,
      taxaQualificacao,
      custoLead,
      cpmql,
      cpm,
      ctr,
      connect,
      convPagina,
    };
  });

  return (
    <div className="surface px-5 py-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="section-label">
          {gratuito ? 'Investimento e leads por dia' : 'Investimento e vendas por dia'}
        </span>
      </div>

      {data.length === 0 ? (
        <div className="mt-4 h-56 rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center gap-2 text-center">
          <BarChart3 className="w-6 h-6 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground font-medium">
            Ainda sem entregas registradas — a lista é preenchida assim que a campanha começar a gastar.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                {['Dia', 'Investimento', gratuito ? 'Leads' : 'Vendas', gratuito ? 'CPL' : 'CPA', ...(gratuito ? ['MQL', 'CPMQL', 'Taxa qualificação'] : []), 'CPM', 'CTR', 'Connect', 'Conv. página'].map((h, i) => (
                  <th
                    key={h}
                    className={`font-semibold uppercase tracking-wide text-[9px] py-2 px-2 whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="py-2 px-2 font-medium text-foreground mono">{row.dia}</td>
                  <td className="py-2 px-2 text-right mono text-foreground">
                    {brl0(row.investimento)}
                  </td>
                  <td className={`py-2 px-2 text-right mono ${corMetaTabela(row.leads, META_LEADS_DIA)}`}>
                    {row.leads}
                  </td>
                  <td className={`py-2 px-2 text-right mono ${corMetaTabela(row.custoLead, META_CPL, true)}`}>
                    {row.custoLead != null ? brl0(row.custoLead) : '—'}
                  </td>
                  {gratuito && (
                    <>
                      <td className={`py-2 px-2 text-right mono ${corMetaTabela(row.mql, META_MQL_DIA)}`}>
                        {row.mql}
                      </td>
                      <td className={`py-2 px-2 text-right mono ${corCpmql(row.cpmql, META_CPMQL)}`}>
                        {row.cpmql != null ? brl0(row.cpmql) : '—'}
                      </td>
                      <td className={`py-2 px-2 text-right mono ${corMetaTabela(row.taxaQualificacao, META_TAXA_QUALIFICACAO)}`}>
                        {pct(row.taxaQualificacao)}
                      </td>
                    </>
                  )}
                  <td className={`py-2 px-2 text-right mono ${corMetaTabela(row.cpm, META_CPM, true)}`}>
                    {row.cpm != null ? brl0(row.cpm) : '—'}
                  </td>
                  <td className={`py-2 px-2 text-right mono ${corMetaTabela(row.ctr, META_CTR)}`}>
                    {pct(row.ctr)}
                  </td>
                  <td className={`py-2 px-2 text-right mono ${corMetaTabela(row.connect, META_CONNECT)}`}>
                    {pct(row.connect)}
                  </td>
                  <td className={`py-2 px-2 text-right mono ${corMetaTabela(row.convPagina, META_CONV_PAGINA)}`}>
                    {pct(row.convPagina)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
