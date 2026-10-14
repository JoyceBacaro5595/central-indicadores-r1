import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { DateRangePicker } from '@/components/DateRangePicker';
import { useCentralIngressos, CentralEvento } from '@/hooks/useCentralIngressos';
import MaquinaOnline from './MaquinaOnline';
import { Abas, PageBody, PageHeader } from '@/components/shared';
import AtualizarPeriodo from '@/components/AtualizarPeriodo';

const brl = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR');
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—');

const METODO: Record<string, string> = { pix: 'PIX', credit_card: 'Cartão', billet: 'Boleto', free: 'Gratuito' };

function hojeISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}
function inicioMesISO() {
  return hojeISO().slice(0, 8) + '01';
}

function Kpi({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={highlight ? 'kpi-card-highlight' : 'kpi-card'}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mono">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function MiniTable({ title, head, rows, onClick }: { title: string; head: string[]; rows: (string | number)[][]; onClick?: () => void }) {
  return (
    <div className={`surface p-4 ${onClick ? 'cursor-pointer hover:ring-1 hover:ring-primary/40' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <span className="section-label">{title}{onClick && <span className="ml-2 normal-case tracking-normal text-[10px] text-primary">clique para abrir por cidade</span>}</span>
      <table className="w-full mt-3 text-xs">
        <thead>
          <tr className="text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={`pb-2 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={head.length} className="py-2 text-muted-foreground">Sem dados no período</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className={`py-1.5 ${j === 0 ? 'text-left' : 'text-right mono'}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventosTabela({ eventos }: { eventos: CentralEvento[] }) {
  const [todos, setTodos] = useState(false);
  const hoje = hojeISO();
  const limite = new Date(Date.now() - 21 * 86400000).toLocaleDateString('sv-SE');
  const lista = todos ? eventos : eventos.filter((e) => (e.ultima_venda ?? '') >= limite || (e.mes_evento ?? '') >= hoje.slice(0, 8) + '01');

  return (
    <div className="surface p-4 overflow-x-auto">
      <div className="flex items-center justify-between">
        <span className="section-label">Ingressos por evento {todos ? '(todos)' : '(em venda)'}</span>
        <button onClick={() => setTodos(!todos)} className="text-[11px] text-primary font-semibold">
          {todos ? 'Ver só em venda' : 'Ver todos'}
        </button>
      </div>
      <table className="w-full mt-3 text-xs min-w-[980px]">
        <thead>
          <tr className="text-muted-foreground text-right">
            <th className="text-left pb-2">Evento</th>
            <th className="pb-2">Comuns</th>
            <th className="pb-2">VIP</th>
            <th className="pb-2">Cortesias</th>
            <th className="pb-2">Últ. 7 dias</th>
            <th className="pb-2">Compradores</th>
            <th className="pb-2">Faturamento</th>
            <th className="pb-2">Ticket/ingr.</th>
            <th className="pb-2">Conversão</th>
            <th className="pb-2">Reembolsos</th>
            <th className="pb-2">Grazi</th>
            <th className="pb-2">Última venda</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((e) => (
            <tr key={e.evento} className="border-t border-border text-right mono">
              <td className="text-left py-1.5 font-sans font-semibold">{e.evento}</td>
              <td>{num(e.ingressos_comuns_pagos)}</td>
              <td>{num(e.ingressos_vip_pagos)}</td>
              <td>{num(e.cortesias)}</td>
              <td>{num(e.ingressos_ult_7d)}</td>
              <td>{num(e.compradores_unicos)}</td>
              <td>{brl(e.faturamento_bruto)}</td>
              <td>{brl(e.ticket_medio_ingresso)}</td>
              <td>{e.conversao_checkout_pct != null ? `${e.conversao_checkout_pct}%` : '—'}</td>
              <td className={e.reembolsos > 0 ? 'text-red-400' : ''}>{e.reembolsos}</td>
              <td>{num(e.ingressos_grazi)}</td>
              <td>{e.ultima_venda ? e.ultima_venda.split('-').reverse().join('/') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type AbaMV = 'presencial' | 'online';

export default function Central() {
  const { aba = 'presencial' } = useParams<{ aba: AbaMV }>();
  const nav = useNavigate();
  const [inicio, setInicio] = useState(inicioMesISO());
  const [fim, setFim] = useState(hojeISO());
  const { data, error, isFetching, refetch } = useCentralIngressos(inicio, fim);
  const [canaisAberto, setCanaisAberto] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('light', localStorage.getItem('theme') === 'light');
  }, []);

  const diario = useMemo(
    () => (data?.diario ?? []).map((d) => ({ ...d, dia: d.data.slice(8, 10) + '/' + d.data.slice(5, 7) })),
    [data],
  );

  const r = data?.resumo;
  const ritmo = data?.ritmo;
  const atualizado = data ? new Date(data.atualizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo="Máquina de Vendas · Visão geral"
        subtitulo={aba === 'online' ? 'Máquina de Vendas Online · Meta Ads e HubSpot' : <>Máquina de Vendas presencial · Guru {atualizado && `· atualizado ${atualizado}`}</>}
        acoes={aba === 'presencial' ? <AtualizarPeriodo aoConcluir={() => refetch()} /> : undefined}
        onAtualizar={aba === 'presencial' ? () => refetch() : undefined}
        atualizando={isFetching}
      />

      <PageBody>
        <Abas<AbaMV> valor={aba as AbaMV} onChange={(v) => nav(v === 'presencial' ? '/central' : '/central/online')} itens={[{ valor: 'presencial', rotulo: 'Presencial · Ingressos' }, { valor: 'online', rotulo: 'Online' }]} />

        {aba === 'online' && <MaquinaOnline />}

        {aba === 'presencial' && <DateRangePicker startDate={inicio} endDate={fim} onChange={(s, e) => { setInicio(s); setFim(e); }} />}

        {aba === 'presencial' && error && <div className="surface p-4 text-sm text-red-400">{(error as Error).message}</div>}
        {aba === 'presencial' && !data && !error && <div className="text-sm text-muted-foreground">Carregando…</div>}

        {aba === 'presencial' && data && r && ritmo && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <Kpi label="Vendidos hoje" value={num(ritmo.hoje)} sub={`ontem ${num(ritmo.ontem)} · ${brl(ritmo.fat_hoje)} hoje`} highlight />
              <Kpi
                label="Últimos 7 dias"
                value={num(ritmo.ult_7d)}
                sub={`7 dias anteriores: ${num(ritmo['7d_anteriores'])} (${ritmo['7d_anteriores'] > 0 ? ((ritmo.ult_7d / ritmo['7d_anteriores'] - 1) * 100).toFixed(0) + '%' : '—'})`}
              />
              <Kpi label="Ingressos pagos no período" value={num(r.ingressos_pagos)} sub={`${num(r.ingressos_comuns)} comuns · ${num(r.ingressos_vip)} VIP`} />
              <Kpi label="Cortesias no período" value={num(r.cortesias)} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
              <Kpi label="Faturamento bruto" value={brl(r.faturamento_bruto)} />
              <Kpi label="Faturamento líquido" value={brl(r.faturamento_liquido)} />
              <Kpi label="Ticket médio / ingresso" value={brl(r.ingressos_pagos ? r.faturamento_bruto / r.ingressos_pagos : 0)} />
              <Kpi label="Pedidos · compradores" value={`${num(r.pedidos_pagos)} · ${num(r.compradores_unicos)}`} />
              <Kpi
                label="Conversão do checkout"
                value={pct(r.pedidos_pagos, r.pedidos_iniciados)}
                sub={`${num(r.nao_convertidos)} expirados/cancelados · ${num(r.pendentes)} pendentes`}
              />
              <Kpi label="Reembolsos" value={num(r.reembolsos)} sub={brl(r.valor_reembolsado)} />
            </div>

            {(r.pedidos_pagos > 0 && r.com_utm / r.pedidos_pagos < 0.5) && (
              <div className="surface p-3 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Só {pct(r.com_utm, r.pedidos_pagos)} das vendas do período têm UTM. Sem isso não dá para atribuir vendas às campanhas.
              </div>
            )}
            {(data.qualidade.sem_cidade > 0 || data.qualidade.sem_mes > 0) && (
              <div className="surface p-3 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                {data.qualidade.sem_cidade + data.qualidade.sem_mes} transações sem cidade ou mês do evento identificados (ajustar em marts.ingresso_produto_ajuste).
              </div>
            )}

            <div className="section-container">
              <span className="section-label">Ingressos por dia</span>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={diario}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(228 12% 14%)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fill: 'hsl(220 10% 40%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(220 10% 40%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="comuns" name="Comuns" stackId="a" fill="hsl(0 65% 50%)" />
                  <Bar dataKey="vip" name="VIP" stackId="a" fill="hsl(45 70% 55%)" />
                  <Bar dataKey="cortesias" name="Cortesias" stackId="a" fill="hsl(220 10% 45%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <EventosTabela eventos={data.eventos} />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MiniTable
                title="Por canal"
                head={['Canal', 'Pagos', 'Cortesias', 'Faturamento']}
                rows={data.canais.map((c) => [c.canal, num(c.ingressos), num(c.cortesias), brl(c.faturamento)])}
                onClick={() => setCanaisAberto(true)}
              />
              <MiniTable
                title="Forma de pagamento"
                head={['Método', 'Pedidos', 'Faturamento', 'Parcelas']}
                rows={data.pagamento.map((p) => [METODO[p.metodo] ?? p.metodo, num(p.pedidos), brl(p.faturamento), p.parcelas_media ?? '—'])}
              />
              <MiniTable
                title="Origem (UTM)"
                head={['Origem', 'Pedidos', 'Ingressos']}
                rows={data.origem.map((o) => [o.origem, num(o.pedidos), num(o.ingressos)])}
              />
              <MiniTable
                title="Estado do comprador"
                head={['UF', 'Ingressos']}
                rows={data.uf_comprador.map((u) => [u.uf, num(u.ingressos)])}
              />
            </div>

            <MiniTable
              title="Reembolsos no período por evento"
              head={['Evento', 'Qtd', 'Valor']}
              rows={data.reembolsos.map((x) => [x.evento, x.qtd, brl(x.valor)])}
            />
          </>
        )}
      </PageBody>
      {canaisAberto && <VendasCidadeCanal onFechar={() => setCanaisAberto(false)} />}
    </div>
  );
}

/* Card "Por canal" aberto: vendas por cidade e por canal, mês a mês (do mês atual para trás, até janeiro). Pedido da Joyce, 14/10. */
interface LinhaCanalMes { cidade: string; mes_evento: string; tipo: 'comum' | 'vip' | 'cortesia'; grupo: 'comercial' | 'cs' | 'seller' | 'social_selling' | 'geral'; ingressos: number; faturamento: number }
const GRUPOS_CANAL: { k: LinhaCanalMes['grupo']; r: string }[] = [
  { k: 'geral', r: 'Geral' }, { k: 'comercial', r: 'Comercial' }, { k: 'cs', r: 'CS' }, { k: 'seller', r: 'Seller' }, { k: 'social_selling', r: 'Social Selling' },
];
const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function VendasCidadeCanal({ onFechar }: { onFechar: () => void }) {
  const [visao, setVisao] = useState<'cidade' | 'canal'>('cidade');
  const ano = hojeISO().slice(0, 4);
  const mesAtual = hojeISO().slice(0, 7);
  const q = useQuery({
    queryKey: ['central-vendas-cidade-canal', ano],
    queryFn: () => r1Rpc<LinhaCanalMes[]>('mv_ingressos_canal', { p_de: `${ano}-01-01`, p_ate: `${ano}-12-31` }),
    retry: false,
  });
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onFechar]);

  const meses = useMemo(() => {
    const porMes = new Map<string, Map<string, { vendas: Record<string, number>; cortesias: number; faturamento: number }>>();
    for (const l of q.data ?? []) {
      const ym = l.mes_evento.slice(0, 7);
      if (ym > mesAtual) continue;
      const cidades = porMes.get(ym) ?? new Map();
      const c = cidades.get(l.cidade) ?? { vendas: {}, cortesias: 0, faturamento: 0 };
      if (l.tipo === 'cortesia') c.cortesias += Number(l.ingressos);
      else c.vendas[l.grupo] = (c.vendas[l.grupo] ?? 0) + Number(l.ingressos);
      c.faturamento += Number(l.faturamento);
      cidades.set(l.cidade, c); porMes.set(ym, cidades);
    }
    return Array.from(porMes.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([ym, cidades]) => ({ ym, linhas: Array.from(cidades.entries()).map(([cidade, c]) => ({ cidade, ...c, total: GRUPOS_CANAL.reduce((s, g) => s + (c.vendas[g.k] ?? 0), 0) })).sort((a, b) => b.total - a.total) }));
  }, [q.data, mesAtual]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4" onClick={onFechar}>
      <div className="surface w-full max-w-5xl my-6 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <span className="section-label">Vendas por cidade e por canal</span>
            <p className="text-xs text-muted-foreground mt-1">Mês do evento, de {MESES_NOME[Number(mesAtual.slice(5, 7)) - 1].toLowerCase()} até janeiro. Vendas = ingressos comuns e VIP; cortesias à parte.</p>
          </div>
          <button onClick={onFechar} className="text-xs px-2 py-1 rounded bg-secondary text-foreground">Fechar</button>
        </div>
        <div className="mt-3 inline-flex rounded-lg bg-secondary p-0.5 text-xs">
          {([['cidade', 'Por cidade'], ['canal', 'Por canal']] as const).map(([k, r]) => (
            <button key={k} onClick={() => setVisao(k)} className={`px-3 py-1 rounded-md ${visao === k ? 'bg-background text-foreground font-semibold' : 'text-muted-foreground'}`}>{r}</button>
          ))}
        </div>
        {q.isLoading && <p className="text-sm text-muted-foreground mt-4">Carregando…</p>}
        {q.error && <p className="text-sm text-red-400 mt-4">{(q.error as Error).message}</p>}
        {!q.isLoading && !q.error && meses.length === 0 && <p className="text-sm text-muted-foreground mt-4">Sem vendas no período.</p>}
        <div className="mt-4 space-y-3">
          {meses.map(({ ym, linhas }, i) => {
            const tot = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((s, l) => s + f(l), 0);
            return (
              <details key={ym} open={i === 0} className="rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 flex flex-wrap items-center gap-x-4 text-sm">
                  <span className="font-semibold text-foreground">{MESES_NOME[Number(ym.slice(5, 7)) - 1]} {ym.slice(0, 4)}</span>
                  <span className="text-muted-foreground mono text-xs">{num(tot((l) => l.total))} vendas · {num(tot((l) => l.cortesias))} cortesias · {brl(tot((l) => l.faturamento))}</span>
                </summary>
                <div className="overflow-x-auto px-3 pb-3">
                  {visao === 'canal' ? (
                    <table className="w-full text-xs">
                      <thead><tr className="text-muted-foreground">
                        <th className="pb-2 text-left font-semibold">Canal</th>
                        {linhas.map((l) => <th key={l.cidade} className="pb-2 text-right font-semibold">{l.cidade}</th>)}
                        <th className="pb-2 text-right font-semibold">Total</th>
                      </tr></thead>
                      <tbody>
                        {GRUPOS_CANAL.map((g) => (
                          <tr key={g.k} className="border-t border-border">
                            <td className="py-1.5 text-left">{g.r}</td>
                            {linhas.map((l) => <td key={l.cidade} className="py-1.5 text-right mono">{num(l.vendas[g.k] ?? 0)}</td>)}
                            <td className="py-1.5 text-right mono font-semibold">{num(tot((l) => l.vendas[g.k] ?? 0))}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-border font-semibold">
                          <td className="py-1.5 text-left">Total vendas</td>
                          {linhas.map((l) => <td key={l.cidade} className="py-1.5 text-right mono">{num(l.total)}</td>)}
                          <td className="py-1.5 text-right mono">{num(tot((l) => l.total))}</td>
                        </tr>
                        <tr className="border-t border-border text-muted-foreground">
                          <td className="py-1.5 text-left">Cortesias</td>
                          {linhas.map((l) => <td key={l.cidade} className="py-1.5 text-right mono">{num(l.cortesias)}</td>)}
                          <td className="py-1.5 text-right mono">{num(tot((l) => l.cortesias))}</td>
                        </tr>
                        <tr className="border-t border-border text-muted-foreground">
                          <td className="py-1.5 text-left">Faturamento</td>
                          {linhas.map((l) => <td key={l.cidade} className="py-1.5 text-right mono">{brl(l.faturamento)}</td>)}
                          <td className="py-1.5 text-right mono">{brl(tot((l) => l.faturamento))}</td>
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                  <table className="w-full text-xs">
                    <thead><tr className="text-muted-foreground">
                      <th className="pb-2 text-left font-semibold">Cidade</th>
                      {GRUPOS_CANAL.map((g) => <th key={g.k} className="pb-2 text-right font-semibold">{g.r}</th>)}
                      <th className="pb-2 text-right font-semibold">Total vendas</th><th className="pb-2 text-right font-semibold">Cortesias</th><th className="pb-2 text-right font-semibold">Faturamento</th>
                    </tr></thead>
                    <tbody>
                      {linhas.map((l) => (
                        <tr key={l.cidade} className="border-t border-border">
                          <td className="py-1.5 text-left">{l.cidade}</td>
                          {GRUPOS_CANAL.map((g) => <td key={g.k} className="py-1.5 text-right mono">{num(l.vendas[g.k] ?? 0)}</td>)}
                          <td className="py-1.5 text-right mono font-semibold">{num(l.total)}</td>
                          <td className="py-1.5 text-right mono">{num(l.cortesias)}</td>
                          <td className="py-1.5 text-right mono">{brl(l.faturamento)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border font-semibold">
                        <td className="py-1.5 text-left">Total</td>
                        {GRUPOS_CANAL.map((g) => <td key={g.k} className="py-1.5 text-right mono">{num(tot((l) => l.vendas[g.k] ?? 0))}</td>)}
                        <td className="py-1.5 text-right mono">{num(tot((l) => l.total))}</td><td className="py-1.5 text-right mono">{num(tot((l) => l.cortesias))}</td><td className="py-1.5 text-right mono">{brl(tot((l) => l.faturamento))}</td>
                      </tr>
                    </tbody>
                  </table>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}
