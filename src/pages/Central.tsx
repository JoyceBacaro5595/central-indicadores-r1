import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { ArrowLeft, RefreshCw, AlertTriangle, FileText, Target, UserCheck } from 'lucide-react';
import { DateRangePicker } from '@/components/DateRangePicker';
import { useCentralIngressos, CentralEvento } from '@/hooks/useCentralIngressos';
import UserMenu from '@/components/UserMenu';
import AtualizarPeriodo from '@/components/AtualizarPeriodo';
import { useAuth } from '@/auth/AuthProvider';

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

function MiniTable({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="surface p-4">
      <span className="section-label">{title}</span>
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

export default function Central() {
  const { pode } = useAuth();
  const [inicio, setInicio] = useState(inicioMesISO());
  const [fim, setFim] = useState(hojeISO());
  const { data, error, isFetching, refetch } = useCentralIngressos(inicio, fim);

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
      <header className="dashboard-header">
        <div className="flex items-center gap-3">
          <Link to="/" className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center" title="Voltar">
            <ArrowLeft className="w-4 h-4 text-primary" />
          </Link>
          <div>
            <h1 className="text-sm font-extrabold text-foreground tracking-wide">Central de Vendas · Ingressos</h1>
            <p className="text-[10px] text-muted-foreground font-medium">
              Máquina de Vendas presencial · Guru {atualizado && `· atualizado ${atualizado}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AtualizarPeriodo aoConcluir={() => refetch()} />
          <Link to="/central/eventos" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20">
            <Target className="w-3.5 h-3.5" /> Eventos e metas
          </Link>
          {pode('presenca') && (
            <Link to="/central/checkins" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20">
              <UserCheck className="w-3.5 h-3.5" /> Check-ins
            </Link>
          )}
          <Link to="/central/relatorio" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20">
            <FileText className="w-3.5 h-3.5" /> Relatório
          </Link>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <UserMenu />
        </div>
      </header>

      <main className="py-6 space-y-6 mx-auto max-w-[1520px] px-4 md:px-8">
        <DateRangePicker startDate={inicio} endDate={fim} onChange={(s, e) => { setInicio(s); setFim(e); }} />

        {error && <div className="surface p-4 text-sm text-red-400">{(error as Error).message}</div>}
        {!data && !error && <div className="text-sm text-muted-foreground">Carregando…</div>}

        {data && r && ritmo && (
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
      </main>
    </div>
  );
}
