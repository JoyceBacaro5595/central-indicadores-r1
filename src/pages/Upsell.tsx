import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageBody, PageHeader } from '@/components/shared';
import { useUpsellVendas, type UpsellItem } from '@/hooks/usePerpetuo';

/* Módulo Upsell (pedido da Joyce, 19/10): Clube R1 e Trator em abas separadas.
 * Cada venda vem com a tag do ciclo (evento_tag, ex.: "RGV 44"); "RGV27" é normalizada para "RGV 27". */
const ABAS = {
  'clube-r1': { grupo: 'clube_r1', titulo: 'Clube R1' },
  trator: { grupo: 'trator', titulo: 'Operação Trator' },
} as const;
const VERM = '#FF0026', VERDE = '#4CD68A';
const nf = (v: number, c = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const brl = (v: number) => `R$ ${nf(v)}`;
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

function Tabela({ titulo, linhas, total }: { titulo: string; linhas: Grupo[]; total: number }) {
  return (
    <div className="surface p-4">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground mb-2">{titulo}</h3>
      <table className="w-full text-xs">
        <thead><tr className="text-muted-foreground text-left"><th className="py-1 font-semibold">&nbsp;</th><th className="text-right font-semibold">Vendas</th><th className="text-right font-semibold">Faturamento</th><th className="text-right font-semibold">% do total</th></tr></thead>
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
  const [tag, setTag] = useState('todas');

  const doProduto = useMemo(() => (q.data?.itens ?? []).filter((i) => i.grupo === cfg?.grupo).map((i) => ({ ...i, tag: tagNorm(i.tag) })), [q.data, cfg]);
  const tags = useMemo(() => [...new Set(doProduto.map((i) => i.tag))].sort((a, b) => numTag(a) - numTag(b)), [doProduto]);
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
    <>
      <PageHeader titulo={`Upsell · ${cfg.titulo}`} subtitulo="Vendas ganhas pela tag do ciclo (HubSpot)" onAtualizar={() => q.refetch()} atualizando={q.isFetching} />
      <PageBody>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(ABAS) as (keyof typeof ABAS)[]).map((k) => (
            <Link key={k} to={`/upsell/${k}`} onClick={() => setTag('todas')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold border ${k === aba ? 'bg-primary text-primary-foreground border-transparent' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {ABAS[k].titulo}
            </Link>
          ))}
          <span className="mx-2 h-5 w-px bg-border" />
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="bg-transparent border border-border rounded-md px-2 py-1.5 text-xs font-semibold">
            <option value="todas">Todas as tags</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {q.isError && <div className="surface p-4 text-sm text-muted-foreground">Não foi possível carregar as vendas agora. Tente atualizar.</div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <K l="Vendas" v={nf(itens.length)} s={tag === 'todas' ? 'todas as tags' : tag} />
          <K l="Faturamento" v={brl(fat)} />
          <K l="Ticket médio" v={itens.length ? brl(fat / itens.length) : 'R$ 0'} />
          <K l="Última venda" v={dataBr(ultima)} s={q.data?.atualizado_em ? `base atualizada ${new Date(q.data.atualizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : undefined} />
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <div className="surface p-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground mb-2">Vendas e faturamento por tag</h3>
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <ComposedChart data={porTag}>
                  <CartesianGrid stroke="rgba(128,128,128,.2)" vertical={false} />
                  <XAxis dataKey="chave" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="v" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis yAxisId="f" orientation="right" tick={{ fontSize: 10 }} tickFormatter={mi} width={70} />
                  <Tooltip formatter={(v: number, n: string) => (n === 'Faturamento' ? brl(v) : v)} />
                  <Bar yAxisId="v" dataKey="vendas" name="Vendas" fill={VERM} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="f" dataKey="fat" name="Faturamento" stroke={VERDE} strokeWidth={2} dot />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="surface p-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground mb-2">Faturamento por mês de fechamento</h3>
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <ComposedChart data={porMes}>
                  <CartesianGrid stroke="rgba(128,128,128,.2)" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={mi} width={70} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="fat" name="Faturamento" fill={VERM} radius={[3, 3, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <Tabela titulo="Por tag do ciclo" linhas={[...porTag].reverse()} total={doProduto.reduce((s, i) => s + i.valor, 0)} />
          <Tabela titulo="Por origem do negócio" linhas={porOrigem} total={fat} />
        </div>
        <Tabela titulo="Por campanha (UTM)" linhas={porCampanha} total={fat} />

        <div className="surface p-4 overflow-x-auto">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground mb-2">Negócios ganhos ({itens.length})</h3>
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground text-left"><th className="py-1 font-semibold">Fechamento</th><th className="font-semibold">Negócio</th><th className="font-semibold">Tag</th><th className="font-semibold">Origem</th><th className="text-right font-semibold">Valor</th></tr></thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.deal_id} className="border-t border-border/50">
                  <td className="py-1.5 whitespace-nowrap">{dataBr(i.data_fechamento)}</td>
                  <td className="pr-2 max-w-[320px] truncate" title={i.nome ?? ''}>{i.nome ?? '-'}</td>
                  <td className="whitespace-nowrap">{i.tag}</td>
                  <td className="pr-2 max-w-[200px] truncate">{i.origem ?? 'Sem origem'}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{brl(i.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}
