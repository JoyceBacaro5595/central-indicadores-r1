import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageBody, PageHeader } from '@/components/shared';
import { usePerpetuo } from '@/hooks/usePerpetuo';
import { FONTE_HISTORICO, HISTORICO, METAS_BOARD, type CicloHist } from './historico/dados';

/* Relatório Ricardo · Histórico Dados (pedido da Joyce, 19/10): réplica de funil-rgv-perpetuo.vercel.app/historico no layout da Central.
 * Série fechada (RGV 29 a 43) vem da planilha; o RGV 44 fechado vem do funil do Perpétuo (HubSpot) "R1 | Histórico Dados"; o ciclo 45 vem do funil do Perpétuo em tempo real e é projetado pelo ritmo. */
const CICLO_ATUAL = { numero: 45, inicio: '2026-09-29', fim: '2026-11-03' };
const CICLO_44 = { numero: 44, inicio: '2026-08-26', fim: '2026-09-28' }; // fechado, ainda fora da planilha: vem do funil do Perpétuo (HubSpot)
const VERM = '#FF0026', VERDE = '#4CD68A', AMBAR = '#F5A623', CINZA = '#8A8A93';
const DIA = 864e5;
const parse = (s: string) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const nf = (v: number, c = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const brl = (v: number) => `R$ ${nf(v)}`;
const mi = (v: number) => { const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e6 ? `${s}R$ ${nf(a / 1e6, 1)} mi` : a >= 1e3 ? `${s}R$ ${nf(a / 1e3)} k` : `${s}R$ ${nf(a)}`; };
const pc = (v: number, c = 2) => `${nf(v, c)}%`;
const x = (v: number) => `${nf(v, 2)}x`;

type Metrica = { k: string; rotulo: string; fmt: (v: number) => string; menorMelhor?: boolean; meta?: number; vl: (c: Linha) => number | null };
type Linha = CicloHist & { roas: number; conv: number; agend: number | null; comp: number | null; fecha: number | null; projetado?: boolean; emCurso?: boolean };

const deriva = (c: CicloHist): Linha => ({
  ...c, roas: c.invest ? c.receita / c.invest : 0, conv: c.mqls ? (c.vendas / c.mqls) * 100 : 0,
  agend: c.agendados != null && c.mqls ? (c.agendados / c.mqls) * 100 : null,
  comp: c.agendados && c.reunioes != null ? (c.reunioes / c.agendados) * 100 : null,
  fecha: c.reunioes ? (c.vendas / c.reunioes) * 100 : null,
});

const METRICAS: Metrica[] = [
  { k: 'invest', rotulo: 'Investimento', fmt: mi, vl: (c) => c.invest },
  { k: 'mqls', rotulo: 'MQLs', fmt: (v) => nf(v), meta: METAS_BOARD.mqls.meta, vl: (c) => c.mqls },
  { k: 'vendas', rotulo: 'Vendas', fmt: (v) => nf(v), meta: METAS_BOARD.vendas.meta, vl: (c) => c.vendas },
  { k: 'receita', rotulo: 'Receita', fmt: mi, vl: (c) => c.receita },
  { k: 'saldo', rotulo: 'Saldo', fmt: mi, vl: (c) => c.saldo },
  { k: 'cac', rotulo: 'CAC', fmt: brl, menorMelhor: true, vl: (c) => c.cac },
  { k: 'roas', rotulo: 'ROAS', fmt: x, meta: METAS_BOARD.roas.meta, vl: (c) => c.roas },
  { k: 'conv', rotulo: 'Conversão MQL→venda', fmt: pc, meta: METAS_BOARD.conversao.meta, vl: (c) => c.conv },
  { k: 'cpl', rotulo: 'Custo por MQL', fmt: brl, menorMelhor: true, meta: METAS_BOARD.cmql.meta, vl: (c) => c.cpl },
  { k: 'cpm', rotulo: 'CPM', fmt: (v) => `R$ ${nf(v, 2)}`, menorMelhor: true, vl: (c) => c.cpm },
  { k: 'ctr', rotulo: 'CTR de link', fmt: pc, vl: (c) => c.ctr },
  { k: 'convPagina', rotulo: 'Conversão da página', fmt: pc, vl: (c) => c.convPagina },
];

/** Posição do ciclo atual contra a série fechada. Só julga quando está entre os 4 piores ou melhores de 15. */
function posicao(v: number, serie: number[], menorMelhor: boolean) {
  const piores = serie.filter((s) => (menorMelhor ? s < v : s > v)).length; // ciclos melhores que o atual
  const melhores = serie.filter((s) => (menorMelhor ? s > v : s < v)).length; // ciclos piores que o atual
  if (piores >= 11) return { t: `pior que ${piores} de ${serie.length}`, c: VERM };
  if (melhores >= 11) return { t: `melhor que ${melhores} de ${serie.length}`, c: VERDE };
  return { t: 'no meio da série', c: AMBAR };
}

function Spark({ valores, cor = VERM, h = 44 }: { valores: (number | null)[]; cor?: string; h?: number }) {
  const v = valores.map((n) => n ?? 0);
  const w = 300, mx = Math.max(...v), mn = Math.min(...v), r = mx - mn || 1;
  const pts = v.map((n, i) => [(i / Math.max(v.length - 1, 1)) * w, h - 4 - ((n - mn) / r) * (h - 10)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const u = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={cor} fillOpacity="0.14" />
      <path d={d} fill="none" stroke={cor} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={u[0]} cy={u[1]} r="3" fill={cor} />
    </svg>
  );
}

const Secao = ({ children }: { children: string }) => (
  <div className="flex items-center gap-4"><h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">{children}</h2><div className="h-px flex-1 bg-border" /></div>
);

const Insight = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div className="rounded-lg bg-secondary/40 border-l-4 px-4 py-3" style={{ borderColor: VERM }}>
    <div className="text-sm font-bold text-foreground">{titulo}</div>
    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{children}</p>
  </div>
);

export default function HistoricoRicardo() {
  const hoje = ymd(new Date());
  const ate = hoje < CICLO_ATUAL.fim ? hoje : CICLO_ATUAL.fim;
  const perp = usePerpetuo(CICLO_ATUAL.inicio, ate, true);
  const r = perp.data?.resumo;
  const perp44 = usePerpetuo(CICLO_44.inicio, CICLO_44.fim, true);
  const r44 = perp44.data?.resumo;
  const [met, setMet] = useState('vendas');

  const dias = Math.round((parse(CICLO_ATUAL.fim).getTime() - parse(CICLO_ATUAL.inicio).getTime()) / DIA) + 1;
  const decorridos = Math.max(1, Math.min(dias, Math.round((parse(ate).getTime() - parse(CICLO_ATUAL.inicio).getTime()) / DIA) + 1));
  const fator = dias / decorridos;

  const monta = (r: NonNullable<typeof perp.data>['resumo'], numero: number, inicio: string, fim: string, f: number): Linha => {
    const invest = (r.investimento ?? 0) * f, mqls = (r.mql ?? 0) * f, vendas = (r.vendas ?? 0) * f, receita = (r.faturamento ?? 0) * f;
    const c: CicloHist = {
      numero, periodo: `${inicio.slice(8)}/${inicio.slice(5, 7)} a ${fim.slice(8)}/${fim.slice(5, 7)}`,
      invest, captacao: invest, mqls, vendas, ticket: vendas ? receita / vendas : 0, receita, cac: vendas ? invest / vendas : invest, cplFundo: 0,
      cpl: r.mql ? (r.investimento ?? 0) / r.mql : 0, saldo: receita - invest, impressoes: r.impressoes ?? 0, cpm: r.cpm ?? 0, alcance: r.alcance ?? 0,
      ctr: r.ctr ?? 0, connect: r.cliques ? ((r.visualizacoes_lp ?? 0) / r.cliques) * 100 : 0, convPagina: r.conversao_lp ?? 0,
      agendados: r.reunioes_agendadas ?? null, reunioes: r.reunioes_realizadas ?? null, origem: null,
    };
    return deriva(c);
  };
  const atual: Linha | null = useMemo(() => (r ? { ...monta(r, CICLO_ATUAL.numero, CICLO_ATUAL.inicio, CICLO_ATUAL.fim, fator), projetado: true, emCurso: true } : null), [r, fator]); // eslint-disable-line react-hooks/exhaustive-deps
  const l44 = useMemo(() => (r44 ? monta(r44, CICLO_44.numero, CICLO_44.inicio, CICLO_44.fim, 1) : null), [r44]); // eslint-disable-line react-hooks/exhaustive-deps
  const fechados = useMemo(() => [...HISTORICO.map(deriva), ...(l44 ? [l44] : [])], [l44]);

  const ultimo = fechados[fechados.length - 1], penultimo = fechados[fechados.length - 2];
  const serie = (m: Metrica) => fechados.map((c) => m.vl(c) ?? 0);

  const cardsFinais = [
    { m: METRICAS[0], neutro: true }, { m: METRICAS[2] }, { m: METRICAS[5] }, { m: METRICAS[6] },
  ];

  const tabelaAtual = atual ? [
    { rotulo: 'Investimento projetado', fmt: mi, v: atual.invest, s: fechados.map((c) => c.invest), neutro: true },
    { rotulo: 'MQLs projetados', fmt: (v: number) => nf(v), v: atual.mqls, s: fechados.map((c) => c.mqls) },
    { rotulo: 'Vendas projetadas', fmt: (v: number) => nf(v), v: atual.vendas, s: fechados.map((c) => c.vendas) },
    { rotulo: 'Conversão MQL→venda', fmt: pc, v: atual.conv, s: fechados.map((c) => c.conv) },
    { rotulo: 'Custo por MQL', fmt: brl, v: atual.cpl, s: fechados.map((c) => c.cpl), menor: true },
    { rotulo: 'CAC', fmt: brl, v: atual.cac, s: fechados.map((c) => c.cac), menor: true },
    { rotulo: 'ROAS', fmt: x, v: atual.roas, s: fechados.map((c) => c.roas) },
    { rotulo: 'Aproveitamento do funil', fmt: pc, v: atual.conv, s: fechados.map((c) => c.conv) },
  ] : [];

  const todas: Linha[] = atual ? [...fechados, atual] : fechados;
  const m = METRICAS.find((q) => q.k === met) ?? METRICAS[2];
  const dadosGrafico = todas.map((c) => ({ ciclo: String(c.numero), periodo: c.periodo, v: m.vl(c) ?? 0, atual: !!c.emCurso }));
  const med = mediana(serie(m));
  const cor = (v: number, atualC: boolean) => atualC ? '#7A0A1A' : m.meta == null ? VERM : (m.menorMelhor ? v <= m.meta : v >= m.meta) ? VERDE : VERM;

  const classe = (v: number, k: 'cmql' | 'mqls' | 'conversao' | 'vendas' | 'roas') => {
    const t = METAS_BOARD[k] as { min?: number; meta: number; sup?: number };
    const menor = k === 'cmql';
    const ok = (a: number, b: number) => (menor ? a <= b : a >= b);
    if (t.sup != null && ok(v, t.sup)) return { bg: 'rgba(76,214,138,.28)', c: VERDE, bate: true };
    if (ok(v, t.meta)) return { bg: 'rgba(76,214,138,.16)', c: VERDE, bate: true };
    if (t.min != null && ok(v, t.min)) return { bg: 'rgba(245,166,35,.16)', c: AMBAR, bate: false };
    return { bg: 'rgba(255,0,38,.13)', c: '#FF4D6A', bate: false };
  };
  const batidas = (c: Linha) => [classe(c.cpl, 'cmql'), classe(c.mqls, 'mqls'), classe(c.conv, 'conversao'), classe(c.vendas, 'vendas'), classe(c.roas, 'roas')].filter((q) => q.bate).length;
  const tres = fechados.filter((c) => batidas(c) >= 3).length;
  const bateu = (k: 'cmql' | 'mqls' | 'conversao' | 'vendas' | 'roas', f: (c: Linha) => number) => fechados.filter((c) => classe(f(c), k).bate).length;

  const funil = [
    { t: 'Agendamento sobre MQL', f: (c: Linha) => c.agend },
    { t: 'Comparecimento', f: (c: Linha) => c.comp },
    { t: 'Fechamento da reunião', f: (c: Linha) => c.fecha },
    { t: 'Aproveitamento do funil', f: (c: Linha) => c.conv },
  ];
  const midia = [
    { t: 'CPM', f: (c: Linha) => c.cpm, fmt: (v: number) => `R$ ${nf(v)}` },
    { t: 'CTR de link', f: (c: Linha) => c.ctr, fmt: pc },
    { t: 'Connect Rate', f: (c: Linha) => c.connect, fmt: (v: number) => pc(v, 1) },
    { t: 'Conversão da página', f: (c: Linha) => c.convPagina, fmt: pc },
  ];

  const comOrigem = fechados.filter((c) => c.origem);
  const ORIG = [
    { k: 'trafego', r: 'Tráfego', c: VERM }, { k: 'mdv', r: 'Máquina de Vendas', c: AMBAR }, { k: 'indicacao', r: 'Indicação', c: VERDE },
    { k: 'msa', r: 'MSA', c: '#A8A29E' }, { k: 'social', r: 'Social selling', c: '#6B6B73' }, { k: 'outros', r: 'Outros', c: '#6E0F1C' },
  ] as const;
  const dadosOrigem = comOrigem.map((c) => ({ ciclo: String(c.numero), ...c.origem!, total: Object.values(c.origem!).reduce((s, n) => s + n, 0), pct: Math.round((c.origem!.trafego / Object.values(c.origem!).reduce((s, n) => s + n, 0)) * 100) }));

  const tot = fechados.reduce((s, c) => ({ invest: s.invest + c.invest, captacao: s.captacao + c.captacao, mqls: s.mqls + c.mqls, vendas: s.vendas + c.vendas }), { invest: 0, captacao: 0, mqls: 0, vendas: 0 });

  return (
    <>
      <PageHeader titulo="Relatório Ricardo · Histórico Dados" subtitulo={`Ciclos RGV 29 a ${ultimo.numero} fechados · 45 em curso · fonte ${FONTE_HISTORICO}`} />
      <PageBody>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold text-foreground">Ciclos <span style={{ color: VERM }}>RGV</span></h1>
            <p className="text-xs text-muted-foreground mt-1">29 a {ultimo.numero} fechados · 45 em curso · dez/2024 a nov/2026</p>
          </div>
          <Link to="/perpetuo/trafego" className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary">← Ciclo 45 em curso</Link>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide">
          <span className="rounded border border-border px-3 py-1.5 text-muted-foreground">R1 Histórico Dados · aba Relatório Ricardo</span>
          <span className="rounded border border-border px-3 py-1.5 text-muted-foreground">Metas do board · funil Perpétuo</span>
          <span className="rounded border px-3 py-1.5" style={{ borderColor: l44 ? VERDE : AMBAR, color: l44 ? VERDE : AMBAR }}>{l44 ? 'RGV 44 e 45 automáticos do HubSpot (funil Perpétuo)' : 'RGV 44 ainda não carregou do HubSpot'}</span>
        </div>

        <Secao>{`Último ciclo fechado · RGV ${ultimo.numero}`}</Secao>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {cardsFinais.map(({ m: q, neutro }) => {
            const v = q.vl(ultimo) ?? 0, ant = q.vl(penultimo) ?? 0, s = serie(q);
            const d = ant ? ((v - ant) / Math.abs(ant)) * 100 : 0;
            const bom = q.menorMelhor ? d < 0 : d > 0;
            const pior = q.menorMelhor ? v === Math.max(...s) : v === Math.min(...s);
            const corD = neutro ? CINZA : bom ? VERDE : VERM;
            return (
              <div key={q.k} className="surface p-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{q.rotulo}</div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-3xl font-extrabold text-foreground">{q.fmt(v)}</span>
                  <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ color: corD, background: `${corD}22` }}>{`${d > 0 ? '+' : ''}${nf(d, 0)}% vs RGV ${penultimo.numero}`}</span>
                </div>
                <div className="mt-2"><Spark valores={s} /></div>
                <div className="mt-2 text-xs text-muted-foreground">mediana da série {q.fmt(mediana(s))}{q.meta != null ? ` · meta ${q.fmt(q.meta)}` : ''}</div>
                {pior && <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ color: VERM, background: `${VERM}22` }}>pior da série</span>}
              </div>
            );
          })}
        </div>

        <Secao>{`Onde o ciclo ${CICLO_ATUAL.numero} está, contra a série`}</Secao>
        <div className="surface p-4 space-y-4 overflow-x-auto">
          {!atual ? <div className="text-sm text-muted-foreground">Carregando o ciclo {CICLO_ATUAL.numero}…</div> : (
            <>
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/40">
                  <th className="text-left px-3 py-2">Indicador</th><th className="text-right px-3 py-2">Ciclo {CICLO_ATUAL.numero}</th><th className="text-right px-3 py-2">Mediana de {fechados.length} ciclos</th>
                  <th className="text-right px-3 py-2">Melhor</th><th className="text-right px-3 py-2">Pior</th><th className="text-right px-3 py-2">Posição</th></tr></thead>
                <tbody>
                  {tabelaAtual.map((l) => {
                    const melhor = l.menor ? Math.min(...l.s) : Math.max(...l.s), pior = l.menor ? Math.max(...l.s) : Math.min(...l.s);
                    const p = l.neutro ? null : posicao(l.v, l.s, !!l.menor);
                    return (
                      <tr key={l.rotulo} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-foreground">{l.rotulo}</td>
                        <td className="px-3 py-2 text-right font-bold text-foreground">{l.fmt(l.v)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{l.fmt(mediana(l.s))}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{l.fmt(melhor)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{l.fmt(pior)}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: p?.c ?? CINZA }}>{p?.t ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Insight titulo={`Leitura do ciclo ${CICLO_ATUAL.numero}`}>
                Projeção pelo ritmo de {decorridos} de {dias} dias. Custo por MQL projetado de <b>{brl(atual.cpl)}</b> contra mediana de {brl(mediana(fechados.map((c) => c.cpl)))}; volume de <b>{nf(atual.mqls)}</b> MQLs contra mediana de {nf(mediana(fechados.map((c) => c.mqls)))}.
                {atual.agend != null && <> Agendamento sobre MQL em <b>{pc(atual.agend, 1)}</b> contra mediana de {pc(mediana(fechados.map((c) => c.agend).filter((n): n is number => n != null)), 1)}.</>} Conversão de ponta a ponta em <b>{pc(atual.conv)}</b> contra mediana de {pc(mediana(fechados.map((c) => c.conv)))} e ROAS projetado de <b>{x(atual.roas)}</b>.
              </Insight>
            </>
          )}
        </div>

        <Secao>A série, ciclo a ciclo</Secao>
        <div className="surface p-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {METRICAS.map((q) => (
              <button key={q.k} type="button" onClick={() => setMet(q.k)} aria-pressed={met === q.k}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${met === q.k ? 'text-white border-transparent' : 'text-muted-foreground border-border hover:text-foreground'}`}
                style={met === q.k ? { background: VERM } : undefined}>{q.rotulo}</button>
            ))}
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dadosGrafico} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="ciclo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => m.fmt(v)} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [m.fmt(v), m.rotulo]} labelFormatter={(l: string, p) => `RGV ${l}${p?.[0]?.payload?.periodo ? ` · ${p[0].payload.periodo}` : ''}`} />
                <ReferenceLine y={med} stroke={CINZA} strokeDasharray="4 4" label={{ value: `mediana ${m.fmt(med)}`, fill: CINZA, fontSize: 10, position: 'insideBottomLeft' }} />
                {m.meta != null && <ReferenceLine y={m.meta} stroke={AMBAR} strokeDasharray="5 4" label={{ value: `meta ${m.fmt(m.meta)}`, fill: AMBAR, fontSize: 10, position: 'insideTopRight' }} />}
                <Bar dataKey="v" radius={[3, 3, 0, 0]} maxBarSize={36} shape={(p: { x: number; y: number; width: number; height: number; payload: { v: number; atual: boolean } }) => <rect x={p.x} y={p.y} width={p.width} height={Math.max(p.height, 0)} rx={3} fill={cor(p.payload.v, p.payload.atual)} />} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {m.meta != null && <><span><i className="inline-block w-3 h-3 rounded-sm mr-1.5 align-middle" style={{ background: VERDE }} />dentro da meta</span><span><i className="inline-block w-3 h-3 rounded-sm mr-1.5 align-middle" style={{ background: VERM }} />fora da meta</span></>}
            <span><i className="inline-block w-3 h-0.5 mr-1.5 align-middle" style={{ background: CINZA }} />mediana dos {fechados.length} fechados</span>
            <span><i className="inline-block w-3 h-3 rounded-sm mr-1.5 align-middle" style={{ background: '#7A0A1A' }} />ciclo {CICLO_ATUAL.numero} projetado</span>
          </div>
        </div>

        <Secao>Receita contra investimento</Secao>
        <div className="surface p-4">
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={fechados.map((c) => ({ ciclo: String(c.numero), invest: c.invest, receita: c.receita, roas: c.roas, saldo: c.saldo }))} margin={{ top: 16, right: 12, left: 0, bottom: 16 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="ciclo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => mi(v)} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: AMBAR }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => x(v)} />
                <Tooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, n: string) => [n === 'roas' ? x(v) : brl(v), n === 'invest' ? 'Investimento' : n === 'receita' ? 'Receita' : 'ROAS']} labelFormatter={(l: string) => `RGV ${l}`} />
                <ReferenceLine yAxisId="r" y={1} stroke={AMBAR} strokeDasharray="5 4" label={{ value: 'ROAS 1,0', fill: AMBAR, fontSize: 10, position: 'insideTopRight' }} />
                <Bar yAxisId="l" dataKey="invest" fill={VERM} radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar yAxisId="l" dataKey="receita" fill={VERDE} radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Line yAxisId="r" dataKey="roas" stroke={AMBAR} strokeWidth={2} dot={{ r: 3, fill: AMBAR }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-flow-col auto-cols-fr text-center text-[10px] font-semibold -mt-2 mb-2 pl-14 pr-11">
            {fechados.map((c) => <span key={c.numero} style={{ color: c.saldo >= 0 ? VERDE : '#FF4D6A' }}>{`${c.saldo >= 0 ? '+' : '-'}${mi(Math.abs(c.saldo)).replace('R$ ', 'R$')}`}</span>)}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span><i className="inline-block w-3 h-3 rounded-sm mr-1.5 align-middle" style={{ background: VERM }} />investimento</span>
            <span><i className="inline-block w-3 h-3 rounded-sm mr-1.5 align-middle" style={{ background: VERDE }} />receita</span>
            <span><i className="inline-block w-3 h-3 rounded-sm mr-1.5 align-middle" style={{ background: AMBAR }} />ROAS (eixo direito)</span>
          </div>
        </div>

        <Secao>Dentro ou fora da meta do board</Secao>
        <div className="surface p-4 overflow-x-auto space-y-4">
          <table className="w-full text-sm min-w-[720px] border-collapse">
            <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/40">
              {['Ciclo', 'Custo por MQL', 'MQLs', 'Conversão MQL→venda', 'Vendas', 'ROAS', 'Metas batidas'].map((h, i) => <th key={h} className={`px-3 py-2 ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {todas.map((c) => {
                const k = batidas(c), cel = (v: number, kk: 'cmql' | 'mqls' | 'conversao' | 'vendas' | 'roas', t: string) => { const q = classe(v, kk); return <td className="px-3 py-2 text-right font-semibold" style={{ background: q.bg, color: q.c }}>{t}</td>; };
                return (
                  <tr key={c.numero} className={`border-t border-border ${c.emCurso ? 'italic' : ''}`}>
                    <td className="px-3 py-2 font-semibold text-foreground">{`RGV ${c.numero}${c.emCurso ? ' · em curso' : ''}`}</td>
                    {cel(c.cpl, 'cmql', brl(c.cpl))}{cel(c.mqls, 'mqls', nf(c.mqls))}{cel(c.conv, 'conversao', pc(c.conv))}{cel(c.vendas, 'vendas', nf(c.vendas))}{cel(c.roas, 'roas', x(c.roas))}
                    <td className="px-3 py-2 text-right font-bold" style={{ color: k >= 4 ? VERDE : k >= 2 ? AMBAR : '#FF4D6A' }}>{k} de 5</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Insight titulo={`Em ${fechados.length} ciclos, ${tres} bateram três das cinco metas`}>
            A régua é o painel do board: custo por MQL até {brl(METAS_BOARD.cmql.meta)}, {nf(METAS_BOARD.mqls.meta)} MQLs, {nf(METAS_BOARD.conversao.meta, 1)}% de conversão, {METAS_BOARD.vendas.meta} vendas e ROAS acima de 1. A meta de MQL só foi batida em {bateu('mqls', (c) => c.mqls)} ciclos e a de vendas em {bateu('vendas', (c) => c.vendas)}; ROAS acima de 1 aconteceu {bateu('roas', (c) => c.roas)} vezes em {fechados.length}. Verde forte bate a super meta, verde bate a meta, âmbar fica entre meta e mínimo, vermelho fica abaixo do mínimo.
          </Insight>
        </div>

        <Secao>O funil ao longo dos ciclos</Secao>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {funil.map((f) => {
            const s = fechados.map(f.f).filter((n): n is number => n != null);
            const v = atual ? f.f(atual) : null;
            const md = mediana(s);
            return (
              <div key={f.t} className="surface p-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.t}</div>
                <div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-extrabold text-foreground">{pc(v ?? 0, v != null && v < 10 ? 2 : 1)}</span><span className="text-xs text-muted-foreground">ciclo {CICLO_ATUAL.numero}</span></div>
                <div className="mt-2"><Spark valores={[...s, v ?? 0]} /></div>
                <div className="mt-2 text-xs text-muted-foreground"><b style={{ color: v != null && v >= md ? VERDE : '#FF4D6A' }}>mediana {pc(md, 1)}</b> · RGV 29→{ultimo.numero}</div>
              </div>
            );
          })}
        </div>

        <Secao>A mídia ao longo dos ciclos</Secao>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {midia.map((f) => {
            const s = fechados.map(f.f);
            return (
              <div key={f.t} className="surface p-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.t}</div>
                <div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-extrabold text-foreground">{f.fmt(s[s.length - 1])}</span><span className="text-xs text-muted-foreground">RGV {ultimo.numero}</span></div>
                <div className="mt-2"><Spark valores={s} /></div>
                <div className="mt-2 text-xs text-muted-foreground">mediana {f.fmt(mediana(s))} · RGV 29→{ultimo.numero}</div>
              </div>
            );
          })}
        </div>

        <Secao>De onde vieram as vendas</Secao>
        <div className="surface p-4">
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dadosOrigem} margin={{ top: 20, right: 12, left: 0, bottom: 16 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="ciclo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(c: string) => c} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} labelFormatter={(l: string) => `RGV ${l}`} />
                {ORIG.map((o) => <Bar key={o.k} dataKey={o.k} name={o.r} stackId="o" fill={o.c} maxBarSize={44} />)}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-flow-col auto-cols-fr text-center text-[10px] text-muted-foreground -mt-1 mb-2 pl-10 pr-3">
            {dadosOrigem.map((d) => <span key={d.ciclo}>{`${d.pct}% · ${d.total}`}</span>)}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {ORIG.map((o) => <span key={o.k}><i className="inline-block w-3 h-3 rounded-sm mr-1.5 align-middle" style={{ background: o.c }} />{o.r}</span>)}
            <span>abaixo do eixo: fatia do tráfego · total de vendas</span>
          </div>
        </div>

        <Secao>Tabela completa</Secao>
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/40">
              {['Ciclo', 'Período', 'Investimento', 'Captação', 'MQLs', 'R$/MQL', 'Agendados', 'Reuniões', 'Compareceu', 'Fecha', 'Vendas', 'Conversão', 'Ticket', 'Receita', 'CAC', 'ROAS'].map((h, i) => <th key={h} className={`px-3 py-2 whitespace-nowrap ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {todas.map((c) => (
                <tr key={c.numero} className={`border-t border-border ${c.emCurso ? 'italic text-muted-foreground' : 'text-foreground'}`}>
                  <td className="px-3 py-2 font-semibold whitespace-nowrap">{`RGV ${c.numero}`}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{c.emCurso ? `${c.periodo} · ${decorridos} de ${dias} dias` : c.periodo}</td>
                  <td className="px-3 py-2 text-right">{brl(c.invest)}</td><td className="px-3 py-2 text-right">{brl(c.captacao)}</td>
                  <td className="px-3 py-2 text-right">{nf(c.mqls)}</td><td className="px-3 py-2 text-right">{brl(c.cpl)}</td>
                  <td className="px-3 py-2 text-right">{nf(c.agendados ?? 0)}</td><td className="px-3 py-2 text-right">{nf(c.reunioes ?? 0)}</td>
                  <td className="px-3 py-2 text-right">{pc(c.comp ?? 0, 1)}</td><td className="px-3 py-2 text-right">{pc(c.fecha ?? 0, 1)}</td>
                  <td className="px-3 py-2 text-right">{nf(c.vendas)}</td><td className="px-3 py-2 text-right">{pc(c.conv)}</td>
                  <td className="px-3 py-2 text-right">{brl(c.ticket)}</td><td className="px-3 py-2 text-right">{brl(c.receita)}</td>
                  <td className="px-3 py-2 text-right">{brl(c.cac)}</td><td className="px-3 py-2 text-right">{x(c.roas)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-bold text-foreground bg-secondary/30">
                <td className="px-3 py-2">{fechados.length} ciclos</td><td className="px-3 py-2 whitespace-nowrap">dez/24 a ago/26</td>
                <td className="px-3 py-2 text-right">{brl(tot.invest)}</td><td className="px-3 py-2 text-right">{brl(tot.captacao)}</td>
                <td className="px-3 py-2 text-right">{nf(tot.mqls)}</td><td className="px-3 py-2 text-right">{brl(tot.mqls ? tot.invest / tot.mqls : 0)}</td>
                <td className="px-3 py-2" colSpan={4} /><td className="px-3 py-2 text-right">{nf(tot.vendas)}</td><td className="px-3 py-2 text-right">{pc(tot.mqls ? (tot.vendas / tot.mqls) * 100 : 0)}</td>
                <td className="px-3 py-2" colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Ciclos fechados: {FONTE_HISTORICO}. Ciclo {CICLO_ATUAL.numero}: funil do Perpétuo em tempo real, investimento da conta Perpétuo no Meta, projetado pelo ritmo atual ({decorridos} de {dias} dias). Campos sem dado na planilha aparecem como 0.
        </p>
      </PageBody>
    </>
  );
}
