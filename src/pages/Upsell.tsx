import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Line, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageBody, PageHeader } from '@/components/shared';
import { PeriodoPadrao, usePeriodoPadrao } from '@/components/FiltroPeriodoPadrao';
import { useUpsellAplicacoes, useUpsellVendas, type UpsellAplicacaoCiclo, type UpsellItem } from '@/hooks/usePerpetuo';

/* Módulo Upsell (pedido da Joyce, 19/10): Clube R1 e Trator em abas separadas.
 * Cada venda vem com a tag do ciclo (evento_tag, ex.: "RGV 44"); "RGV27" é normalizada para "RGV 27". */
const ABAS = {
  'clube-r1': { grupo: 'clube_r1', titulo: 'Clube R1' },
  trator: { grupo: 'trator', titulo: 'Operação Trator' },
} as const;
const VERM = '#FF0026', VERDE = '#4CD68A';
const nf = (v: number, c = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const brl = (v: number) => `R$ ${nf(v, 2)}`;
const mi = (v: number) => (Math.abs(v) >= 1e6 ? `R$ ${nf(v / 1e6, 2)} mi` : Math.abs(v) >= 1e3 ? `R$ ${nf(v / 1e3)} k` : `R$ ${nf(v)}`);
const tagNorm = (t: string | null) => { const m = (t ?? '').replace(/\s+/g, '').match(/^([A-Za-z]+)(\d+)$/); return m ? `${m[1].toUpperCase()} ${m[2]}` : (t ?? 'Sem tag'); };
const numTag = (t: string) => Number(t.replace(/\D/g, '')) || 0;
const dataBr = (s: string | null) => (s ? s.split('-').reverse().join('/') : '-');

type Grupo = { chave: string; vendas: number; fat: number };
const agrupa = (itens: UpsellItem[], chave: (i: UpsellItem) => string): Grupo[] => {
  const m = new Map<string, Grupo>();
  for (const i of itens) { const k = chave(i); const g = m.get(k) ?? { chave: k, vendas: 0, fat: 0 }; g.vendas += 1; g.fat += i.valor; m.set(k, g); }
  return [...m.values()];
};

function K({ l, v, s }: { l: string; v: string; s?: string }) {
  return (
    <div className="surface p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{l}</div>
      <div className="text-2xl font-extrabold text-foreground mt-1">{v}</div>
      {s && <div className="text-[11px] text-muted-foreground mt-0.5">{s}</div>}
    </div>
  );
}


type Ordem = { col: string; dir: 'asc' | 'desc' };
const useOrdem = (col: string, dir: 'asc' | 'desc' = 'desc') => {
  const [o, setO] = useState<Ordem>({ col, dir });
  const alterna = (c: string) => setO((a) => (a.col === c ? { col: c, dir: a.dir === 'asc' ? 'desc' : 'asc' } : { col: c, dir: c === 'rotulo' ? 'asc' : 'desc' }));
  return [o, alterna] as const;
};
const ordena = <T,>(xs: T[], o: Ordem, v: (x: T, col: string) => number | string) =>
  [...xs].sort((a, b) => { const x = v(a, o.col), y = v(b, o.col); const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true }); return o.dir === 'asc' ? r : -r; });
function Th({ c, o, alterna, children, className = '' }: { c: string; o: Ordem; alterna: (c: string) => void; children: React.ReactNode; className?: string }) {
  const ativo = o.col === c;
  return (
    <th className={`font-semibold ${className}`} aria-sort={ativo ? (o.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => alterna(c)} title="Ordenar do menor para o maior e do maior para o menor" className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground ${ativo ? 'text-foreground' : ''}`}>
        {children}<span className="text-[9px]">{ativo ? (o.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
};

const COLS: { k: 'ganho' | 'negociacao' | 'aprovacao' | 'perdida' | 'cancelada' | 'cancelamento_solicitado'; rotulo: string }[] = [
  { k: 'ganho', rotulo: 'Ganho' }, { k: 'negociacao', rotulo: 'Em negociação' }, { k: 'aprovacao', rotulo: 'Em aprovação' },
  { k: 'perdida', rotulo: 'Perdidas' }, { k: 'cancelada', rotulo: 'Canceladas' }, { k: 'cancelamento_solicitado', rotulo: 'Cancel. solicitado' },
];
const pct = (n: number, t: number) => (t ? `${nf((n / t) * 100, 1)}%` : '-');
const catN = (c: UpsellAplicacaoCiclo, k: (typeof COLS)[number]['k']) => {
  const x = c.categorias[k] ?? { n: 0, valor: 0 };
  return k === 'negociacao' ? { n: x.n + (c.categorias.finalizando?.n ?? 0), valor: x.valor + (c.categorias.finalizando?.valor ?? 0) } : x;
};

function Aplicacoes({ ciclos }: { ciclos: UpsellAplicacaoCiclo[] }) {
  const [o, alterna] = useOrdem('rotulo', 'desc');
  const linhas = ordena(ciclos, o, (c, col) => {
    if (col === 'rotulo') return numTag(c.ciclo);
    if (col === 'total') return c.total;
    if (col === 'cancsobre') { const g = catN(c, 'ganho').n, k = catN(c, 'cancelada').n; return g + k ? k / (g + k) : 0; }
    return catN(c, col as (typeof COLS)[number]['k']).n;
  });
  return (
    <div className="surface p-4 overflow-x-auto">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground">Aplicações por ciclo (funil Clube R1)</h3>
      <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">Negócios do funil com a tag do ciclo, em qualquer etapa, com a etapa em que estão hoje. Percentuais sobre as aplicações do ciclo.</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground text-left">
            <Th c="rotulo" o={o} alterna={alterna} className="py-1">Ciclo</Th><Th c="total" o={o} alterna={alterna} className="text-right">Aplicações</Th>
            {COLS.map((c) => <Th key={c.k} c={c.k} o={o} alterna={alterna} className="text-right pl-2">{c.rotulo}</Th>)}
            <Th c="cancsobre" o={o} alterna={alterna} className="text-right pl-2">Cancel. sobre vendas</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => {
            const ganho = catN(c, 'ganho'), canc = catN(c, 'cancelada');
            return (
              <tr key={c.ciclo} className="border-t border-border/50 align-top">
                <td className="py-1.5 whitespace-nowrap font-semibold">{c.ciclo}<div className="text-[10px] font-normal text-muted-foreground">{c.inicio ? `${dataBr(c.inicio)} a ${dataBr(c.fim)}` : 'tag do ciclo'}</div></td>
                <td className="text-right tabular-nums">{c.total}<div className="text-[10px] text-muted-foreground">{brl(c.valor)}</div></td>
                {COLS.map((col) => { const x = catN(c, col.k); return (
                  <td key={col.k} className="text-right tabular-nums pl-2">{x.n}<span className="text-muted-foreground"> · {pct(x.n, c.total)}</span><div className="text-[10px] text-muted-foreground">{brl(x.valor)}</div></td>
                ); })}
                <td className="text-right tabular-nums pl-2">{pct(canc.n, ganho.n + canc.n)}<div className="text-[10px] text-muted-foreground">{canc.n} de {ganho.n + canc.n}</div></td>
              </tr>
            );
          })}
          {!ciclos.length && <tr><td colSpan={9} className="py-3 text-muted-foreground">Nenhum evento no período.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Tabela({ titulo, linhas: base, total }: { titulo: string; linhas: Grupo[]; total: number }) {
  const [o, alterna] = useOrdem('fat');
  const linhas = ordena(base, o, (g, col) => (col === 'rotulo' ? g.chave : col === 'vendas' ? g.vendas : g.fat));
  return (
    <div className="surface p-4">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground mb-2">{titulo}</h3>
      <table className="w-full text-xs">
        <thead><tr className="text-muted-foreground text-left"><Th c="rotulo" o={o} alterna={alterna} className="py-1">{titulo.replace('Por ', '')}</Th><Th c="vendas" o={o} alterna={alterna} className="text-right">Vendas</Th><Th c="fat" o={o} alterna={alterna} className="text-right">Faturamento</Th><Th c="fat" o={o} alterna={alterna} className="text-right">% do total</Th></tr></thead>
        <tbody>
          {linhas.map((g) => (
            <tr key={g.chave} className="border-t border-border/50">
              <td className="py-1.5 pr-2 max-w-[260px] truncate" title={g.chave}>{g.chave}</td>
              <td className="text-right tabular-nums">{g.vendas}</td>
              <td className="text-right tabular-nums">{brl(g.fat)}</td>
              <td className="text-right tabular-nums text-muted-foreground">{total ? nf((g.fat / total) * 100, 1) : '0,0'}%</td>
            </tr>
          ))}
          {!linhas.length && <tr><td colSpan={4} className="py-3 text-muted-foreground">Sem vendas no filtro.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function Upsell() {
  const { aba } = useParams();
  const cfg = aba ? ABAS[aba as keyof typeof ABAS] : undefined;
  const q = useUpsellVendas(!!cfg);
  const ap = useUpsellAplicacoes(cfg?.grupo === 'clube_r1');
  const [tag, setTag] = useState('todas');
  const [oN, alternaN] = useOrdem('data');
  const per = usePeriodoPadrao('ano');
  const { de, ateConsulta: ate } = per;

  const doProduto = useMemo(() => (q.data?.itens ?? []).filter((i) => i.grupo === cfg?.grupo && !!i.data_fechamento && i.data_fechamento >= de && i.data_fechamento <= ate).map((i) => ({ ...i, tag: tagNorm(i.tag) })), [q.data, cfg, de, ate]);
  const tags = useMemo(() => [...new Set((q.data?.itens ?? []).filter((i) => i.grupo === cfg?.grupo).map((i) => tagNorm(i.tag)))].sort((a, b) => numTag(a) - numTag(b)), [q.data, cfg]);
  const itens = useMemo(() => (tag === 'todas' ? doProduto : doProduto.filter((i) => i.tag === tag)), [doProduto, tag]);

  if (!cfg) return <Navigate to="/upsell/clube-r1" replace />;

  const fat = itens.reduce((s, i) => s + i.valor, 0);
  const porTag = agrupa(doProduto, (i) => i.tag).sort((a, b) => numTag(a.chave) - numTag(b.chave));
  const porMes = agrupa(itens, (i) => (i.data_fechamento ?? '').slice(0, 7) || 'Sem data').sort((a, b) => a.chave.localeCompare(b.chave))
    .map((g) => ({ ...g, rotulo: g.chave.includes('-') ? g.chave.split('-').reverse().join('/') : g.chave }));
  const porOrigem = agrupa(itens, (i) => i.origem ?? 'Sem origem').sort((a, b) => b.fat - a.fat);
  const porCampanha = agrupa(itens, (i) => i.campanha ?? 'Sem campanha').sort((a, b) => b.fat - a.fat).slice(0, 12);
  const ultima = itens.reduce<string | null>((m, i) => (i.data_fechamento && (!m || i.data_fechamento > m) ? i.data_fechamento : m), null);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader titulo={`Upsell · ${cfg.titulo}`} subtitulo="Vendas ganhas pela tag do ciclo (HubSpot)" onAtualizar={() => q.refetch()} atualizando={q.isFetching}
        acoes={<div className="flex items-center gap-2">
          {q.data?.atualizado_em && <span className="text-xs text-muted-foreground whitespace-nowrap">Última atualização: {new Date(q.data.atualizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
          <div className="hidden lg:flex items-center gap-2"><PeriodoPadrao p={per} /></div>
        </div>} />
      <PageBody className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="toggle-group">
            {(Object.keys(ABAS) as (keyof typeof ABAS)[]).map((k) => (
              <Link key={k} to={`/upsell/${k}`} onClick={() => setTag('todas')} className={`toggle-item ${k === aba ? 'toggle-item-ativo' : ''}`}>{ABAS[k].titulo}</Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex lg:hidden"><PeriodoPadrao p={per} /></div>
            <select aria-label="Filtrar por ciclo" value={tag} onChange={(e) => setTag(e.target.value)} className="bg-transparent border border-border rounded-md px-2 py-1.5 text-xs font-semibold">
              <option value="todas">Todos os ciclos</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow">Upsell</div>
            <h2 className="text-xl md:text-2xl font-semibold leading-tight mt-1 text-foreground">Vendas do {cfg.titulo}</h2>
            <div className="mt-2 text-sm text-muted-foreground">{dataBr(de)} a {dataBr(ate)} · <b className="text-foreground">{nf(itens.length)}</b> {itens.length === 1 ? 'venda' : 'vendas'}</div>
          </div>
          <div className="text-right">
            <div className="eyebrow">Faturamento no período</div>
            <div className="text-2xl md:text-3xl font-semibold leading-none mt-1 text-foreground">{brl(fat)}</div>
            <div className="text-sm text-muted-foreground mt-1">Ticket médio {itens.length ? brl(fat / itens.length) : brl(0)}</div>
          </div>
        </div>

        {q.isError && <div className="surface p-4 text-sm text-muted-foreground">Não foi possível carregar as vendas agora. Tente atualizar.</div>}

        <div className="grid grid-cols-2 gap-3">
          <K l="Vendas" v={nf(itens.length)} s={tag === 'todas' ? 'todos os ciclos' : tag} />
          <K l="Última venda" v={dataBr(ultima)} />
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <div className="surface p-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground mb-2">Vendas e faturamento por tag</h3>
            <div className="text-foreground" style={{ height: 240 }}>
              <ResponsiveContainer>
                <ComposedChart data={porTag} margin={{ top: 18 }}>
                  <CartesianGrid stroke="rgba(128,128,128,.2)" vertical={false} />
                  <XAxis dataKey="chave" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="v" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis yAxisId="f" orientation="right" tick={{ fontSize: 10 }} tickFormatter={mi} width={90} />
                  <Tooltip formatter={(v: number, n: string) => (n === 'Faturamento' ? brl(v) : v)} />
                  <Bar yAxisId="v" dataKey="vendas" name="Vendas" fill={VERM} radius={[3, 3, 0, 0]}><LabelList dataKey="vendas" position="top" style={{ fontSize: 11, fontWeight: 700, fill: 'currentColor' }} /></Bar>
                  <Line yAxisId="f" dataKey="fat" name="Faturamento" stroke={VERDE} strokeWidth={2} dot />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="surface p-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground mb-2">Faturamento por mês de fechamento</h3>
            <div className="text-foreground" style={{ height: 240 }}>
              <ResponsiveContainer>
                <ComposedChart data={porMes} margin={{ top: 18 }}>
                  <CartesianGrid stroke="rgba(128,128,128,.2)" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={mi} width={70} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="fat" name="Faturamento" fill={VERM} radius={[3, 3, 0, 0]}><LabelList dataKey="vendas" position="top" formatter={(v: number) => `${v} ${v === 1 ? 'venda' : 'vendas'}`} style={{ fontSize: 11, fontWeight: 700, fill: 'currentColor' }} /></Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {cfg.grupo === 'clube_r1' && <Aplicacoes ciclos={(ap.data?.ciclos ?? []).filter((c) => (tag === 'todas' || tagNorm(c.ciclo) === tag) && (!c.inicio || (c.inicio >= de && c.inicio <= ate)))} />}

        <div className="grid lg:grid-cols-2 gap-3">
          <Tabela titulo="Por ciclo" linhas={[...porTag].reverse()} total={doProduto.reduce((s, i) => s + i.valor, 0)} />
          <Tabela titulo="Por origem do negócio" linhas={porOrigem} total={fat} />
        </div>
        <Tabela titulo="Por campanha (UTM)" linhas={porCampanha} total={fat} />

        <div className="surface p-4 overflow-x-auto">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground mb-2">Negócios ganhos ({itens.length})</h3>
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground text-left"><Th c="data" o={oN} alterna={alternaN} className="py-1">Fechamento</Th><Th c="id" o={oN} alterna={alternaN}>ID do negócio</Th><Th c="tag" o={oN} alterna={alternaN}>Ciclo</Th><Th c="origem" o={oN} alterna={alternaN}>Origem</Th><Th c="valor" o={oN} alterna={alternaN} className="text-right">Valor</Th></tr></thead>
            <tbody>
              {ordena(itens, oN, (i, col) => (col === 'data' ? i.data_fechamento ?? '' : col === 'id' ? Number(i.deal_id) : col === 'tag' ? numTag(i.tag) : col === 'origem' ? i.origem ?? '' : i.valor)).map((i) => (
                <tr key={i.deal_id} className="border-t border-border/50">
                  <td className="py-1.5 whitespace-nowrap">{dataBr(i.data_fechamento)}</td>
                  <td className="pr-2 whitespace-nowrap tabular-nums"><a href={`https://app.hubspot.com/contacts/23586399/record/0-3/${i.deal_id}`} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-primary" title="Abrir o negócio no HubSpot">{i.deal_id}</a></td>
                  <td className="whitespace-nowrap">{i.tag}</td>
                  <td className="pr-2 max-w-[200px] truncate">{i.origem ?? 'Sem origem'}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{brl(i.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
    </div>
  );
}
