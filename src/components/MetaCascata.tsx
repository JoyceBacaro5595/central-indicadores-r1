import type { Totals } from '@/hooks/useDashboardData';
import type { GuruTotals } from '@/hooks/useGuruData';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const num = (v: number) => Math.round(v).toLocaleString('pt-BR');

interface Props {
  totals?: Totals;
  guru?: GuruTotals;
  ativo?: boolean;
  modo?: 'pago' | 'gratuito';
  leads?: number;
  qualificados?: number;
}

function diasCorridos() {
  const hoje = new Date();
  const inicio = new Date(2026, 8, 4);
  const d = Math.floor((hoje.getTime() - inicio.getTime()) / 86400000) + 1;
  return Math.max(d, 1);
}

/** verde = atingiu a meta, amarelo = perto (>=80%), vermelho = longe */
function corMeta(raw: number | null, metaNum: number | null, menorMelhor = false) {
  if (raw == null || metaNum == null || metaNum === 0 || raw === 0) return 'text-foreground';
  const ratio = menorMelhor ? metaNum / raw : raw / metaNum;
  if (ratio >= 1) return 'text-emerald-500';
  if (ratio >= 0.8) return 'text-amber-500';
  return 'text-red-500';
}

/** retorna 0..1+ razão de progresso em direção à meta */
function ratioMeta(raw: number | null, metaNum: number | null, menorMelhor = false) {
  if (raw == null || metaNum == null || metaNum === 0 || raw === 0) return null;
  return menorMelhor ? metaNum / raw : raw / metaNum;
}

/** cor hex da barra de progresso */
function corBar(ratio: number | null) {
  if (ratio == null) return 'rgb(var(--muted-foreground) / 0.25)';
  if (ratio >= 1) return '#10b981'; // emerald-500
  if (ratio >= 0.8) return '#f59e0b'; // amber-500
  return '#ef4444'; // red-500
}

export function MetaCascata({ totals, guru, ativo, modo = 'pago', leads, qualificados }: Props) {
  const has = !!totals && ativo !== false;
  const gratuito = modo === 'gratuito';
  const vendasGuru = guru?.vendas ?? 0;
  const leadsQtd = leads ?? 0;
  const dias = diasCorridos();

  const stages = [
    {
      etapa: 'CPM',
      valor: has ? brl(totals!.cpm) : '—',
      metaLabel: 'R$ 35',
      metaNum: 35,
      menorMelhor: true,
      raw: has ? totals!.cpm : null,
      cor: corMeta(has ? totals!.cpm : null, 35, true),
      sub: has ? `${num(totals!.impressions)} impressões` : 'impressões',
    },
    {
      etapa: 'Cliques no link',
      valor: has ? num(totals!.linkClicks ?? totals!.clicks) : '—',
      metaLabel: null,
      metaNum: null,
      menorMelhor: false,
      raw: null,
      cor: 'text-foreground',
      sub: has ? `CPC ${brl(totals!.cpc)}` : '—',
    },
    {
      etapa: 'Visitas LP',
      valor: has ? num(totals!.landingPageViews) : '—',
      metaLabel: null,
      metaNum: null,
      menorMelhor: false,
      raw: null,
      cor: 'text-foreground',
      sub: has ? `Custo/visita ${brl(totals!.costPerLPV)}` : '—',
    },
    ...(gratuito
      ? []
      : [
          {
            etapa: 'Checkouts',
            valor: has ? num(totals!.initiateCheckout) : '—',
            metaLabel: null,
            metaNum: null,
            menorMelhor: false,
            raw: null,
            cor: 'text-foreground',
            sub: has ? `Custo/checkout ${brl(totals!.costPerIC)}` : '—',
          },
        ]),
    ...(gratuito
      ? [
          {
            etapa: 'Leads',
            valor: leads != null ? num(leadsQtd) : '—',
            metaLabel: 'R$ 47',
            metaNum: 47,
            menorMelhor: true,
            raw: has && leadsQtd > 0 ? totals!.spend / leadsQtd : null,
            cor: 'text-foreground',
            sub: null,
            custo:
              has && leadsQtd > 0
                ? {
                    label: `Custo/lead ${brl(totals!.spend / leadsQtd)}`,
                    cor: corMeta(totals!.spend / leadsQtd, 47, true),
                  }
                : null,
          },
          {
            etapa: 'MQL',
            valor: qualificados != null ? num(qualificados) : '—',
            metaLabel: 'R$ 150',
            metaNum: 150,
            menorMelhor: true,
            raw: has && (qualificados ?? 0) > 0 ? totals!.spend / (qualificados as number) : null,
            cor: corMeta(qualificados ?? null, 54 * 8),
            sub: null,
            custo:
              has && (qualificados ?? 0) > 0
                ? {
                    label: `Custo/MQL ${brl(totals!.spend / (qualificados as number))}`,
                    cor: corMeta(totals!.spend / (qualificados as number), 150, true),
                  }
                : null,
          },
        ]
      : [
          {
            etapa: 'Vendas',
            valor: num(vendasGuru),
            metaLabel: '500',
            metaNum: 500,
            menorMelhor: false,
            raw: vendasGuru || null,
            cor: corMeta(vendasGuru || null, 500),
            sub: null,
          },
        ]),
  ];

  const pct = (v: number) => `${v.toFixed(2)}%`;
  const vcRate = has && totals!.landingPageViews > 0
    ? (totals!.initiateCheckout / totals!.landingPageViews) * 100
    : null;
  const convVenda = has && totals!.initiateCheckout > 0
    ? (vendasGuru / totals!.initiateCheckout) * 100
    : null;
  const convPagina = has && totals!.landingPageViews > 0 && leadsQtd > 0
    ? (leadsQtd / totals!.landingPageViews) * 100
    : null;
  const convMQL = leadsQtd > 0 && (qualificados ?? 0) > 0
    ? ((qualificados as number) / leadsQtd) * 100
    : null;
  const cpa = has && vendasGuru > 0 ? totals!.spend / vendasGuru : null;
  const cpmql = has && (qualificados ?? 0) > 0 ? totals!.spend / (qualificados as number) : null;
  const pacingLead = leadsQtd > 0 ? leadsQtd / dias : null;
  const pacingMQL = (qualificados ?? 0) > 0 ? (qualificados as number) / dias : null;
  const pacing = vendasGuru > 0 ? vendasGuru / dias : null;

  const taxas = [
    {
      label: 'CTR',
      valor: has ? pct(totals!.ctr) : '—',
      meta: '1.00%',
      metaNum: 1,
      menorMelhor: false,
      raw: has ? totals!.ctr : null,
      cor: corMeta(has ? totals!.ctr : null, 1),
    },
    {
      label: 'Connect',
      valor: has ? pct(totals!.connectRate) : '—',
      meta: '75.00%',
      metaNum: 75,
      menorMelhor: false,
      raw: has ? totals!.connectRate : null,
      cor: corMeta(has ? totals!.connectRate : null, 75),
    },
    ...(gratuito
      ? [
          {
            label: 'Conv. da página',
            valor: convPagina != null ? pct(convPagina) : '—',
            meta: '10.00%',
            metaNum: 10,
            menorMelhor: false,
            raw: convPagina,
            cor: corMeta(convPagina, 10),
          },
          {
            label: 'Conv. MQL',
            valor: convMQL != null ? pct(convMQL) : '—',
            meta: '50.00%',
            metaNum: 50,
            menorMelhor: false,
            raw: convMQL,
            cor: corMeta(convMQL, 50),
          },
        ]
      : [
          {
            label: 'Visitantes/checkout',
            valor: vcRate != null ? pct(vcRate) : '—',
            meta: '10.00%',
            metaNum: 10,
            menorMelhor: false,
            raw: vcRate,
            cor: corMeta(vcRate, 10),
          },
          {
            label: 'Conv. venda',
            valor: convVenda != null ? pct(convVenda) : '—',
            meta: '25.00%',
            metaNum: 25,
            menorMelhor: false,
            raw: convVenda,
            cor: corMeta(convVenda, 25),
          },
        ]),
  ];

  const resumo = [
    {
      label: 'Investimento',
      valor: has ? brl(totals!.spend) : '—',
      meta: gratuito ? 'meta R$ 66.000' : 'meta —',
      cor: 'text-foreground',
    },
    ...(!gratuito
      ? [
          {
            label: 'Ticket Médio',
            valor: guru && guru.vendas > 0 ? brl(guru.ticketMedio) : '—',
            meta: 'meta R$ 97',
            cor: corMeta(guru && guru.vendas > 0 ? guru.ticketMedio : null, 97),
          },
          {
            label: 'Receita',
            valor: guru ? brl(guru.faturamento) : '—',
            meta: 'meta R$ 33.500',
            cor: corMeta(guru ? guru.faturamento : null, 33500),
          },
          {
            label: 'Conv. Página',
            valor: has ? pct(totals!.txConvPV) : '—',
            meta: 'meta 4.80%',
            cor: corMeta(has ? totals!.txConvPV : null, 4.8),
          },
        ]
      : []),
    gratuito
      ? {
          label: 'CPMQL',
          valor: cpmql != null ? brl(cpmql) : '—',
          meta: 'meta R$ 150',
          cor: corMeta(cpmql, 150, true),
        }
      : {
          label: 'CPA',
          valor: cpa != null ? brl(cpa) : '—',
          meta: 'meta R$ 150',
          cor: corMeta(cpa, 150, true),
        },
    ...(gratuito
      ? [
          {
            label: 'Pacing atual lead',
            valor: pacingLead != null ? num(pacingLead) : '—',
            meta: null,
            cor: 'text-foreground',
          },
          {
            label: 'Pacing atual MQL',
            valor: pacingMQL != null ? num(pacingMQL) : '—',
            meta: null,
            cor: 'text-foreground',
          },
        ]
      : [
          {
            label: 'Pacing atual',
            valor: pacing != null ? num(pacing) : '—',
            meta: 'meta 29',
            cor: corMeta(pacing, 29),
          },
        ]),
  ];

  return (
    <div className="section-container">
      {/* Título do bloco */}
      <div className="flex items-center gap-3 mb-5">
        <span className="w-[3px] h-4 rounded-full bg-primary" />
        <h2 className="text-sm font-extrabold text-foreground">Máquina de Vendas Online</h2>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          21/09 · {has ? 'Campanha no ar' : 'Aguardando campanha'}
        </span>
      </div>

      {/* Funil horizontal */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        {stages.map((stage, i) => {
          const metaCor = corMeta(stage.raw, stage.metaNum, stage.menorMelhor);
          return (
            <div key={stage.etapa} className="contents">
              <div className="relative flex-1 min-w-0 overflow-hidden rounded-lg border border-border bg-gradient-to-r from-emerald-500/[0.07] to-transparent px-4 py-3 text-center">
                <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500/70" />
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-500/90 dark:text-emerald-400/90">
                  {stage.etapa}
                </p>
                <p className={`mt-1 text-2xl font-extrabold mono tracking-tight ${stage.cor}`}>
                  {stage.valor}
                </p>

                {stage.metaLabel ? (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border px-2.5 py-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      META
                    </span>
                    <span className="text-xs font-extrabold mono text-foreground">
                      {stage.metaLabel}
                    </span>
                  </div>
                ) : (
                  stage.sub && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground/70">{stage.sub}</p>
                  )
                )}

                {stage.metaLabel && stage.sub && (
                  <p className="mt-1 text-[10px] text-muted-foreground/70">{stage.sub}</p>
                )}

                {(stage as { custo?: { label: string; cor: string } | null }).custo && (
                  <p className={`mt-1.5 text-xs font-bold mono ${(stage as { custo?: { label: string; cor: string } | null }).custo!.cor}`}>
                    {(stage as { custo?: { label: string; cor: string } | null }).custo!.label}
                  </p>
                )}
              </div>

              {i < taxas.length && (
                <div className="shrink-0 text-center lg:px-1 lg:min-w-[80px]">
                  <span className={`inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-bold mono ${taxas[i].cor}`}>
                    {taxas[i].valor}
                  </span>
                  <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {taxas[i].label}
                  </p>
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-border px-2.5 py-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      META
                    </span>
                    <span className="text-xs font-extrabold mono text-foreground">
                      {taxas[i].meta}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Resumo */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 border-t border-border pt-4">
        {resumo.map((item) => (
          <div key={item.label}>
            <p className={`text-lg font-extrabold mono ${item.cor}`}>{item.valor}</p>
            <p className="text-[11px] font-semibold text-muted-foreground">{item.label}</p>
            {item.meta && <p className="text-[10px] text-muted-foreground/70">{item.meta}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
