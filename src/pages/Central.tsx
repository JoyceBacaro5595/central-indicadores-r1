import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { AlertTriangle, MapPin } from 'lucide-react';
import { DateRangePicker } from '@/components/DateRangePicker';
import { useCentralIngressos, CentralEvento, CentralPorRota, CentralRota } from '@/hooks/useCentralIngressos';
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

function FiltroRota({ rotas, valor, onChange }: { rotas: CentralRota[]; valor: string | null; onChange: (v: string | null) => void }) {
  return (
    <label className="flex items-center gap-2 surface px-3 py-1.5 rounded-lg">
      <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Rota</span>
      <select
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="bg-transparent text-xs font-medium text-foreground outline-none border-none min-w-[160px]"
      >
        <option value="">Geral · todas as rotas</option>
        {rotas.map((r) => (
          <option key={r.cidade} value={r.cidade}>{r.cidade}</option>
        ))}
      </select>
    </label>
  );
}

function RotasTabela({ linhas, total, onEscolher }: { linhas: CentralPorRota[]; total: number; onEscolher: (cidade: string) => void }) {
  return (
    <div className="surface p-4 overflow-x-auto">
      <div className="flex items-center justify-between">
        <span className="section-label">Desempenho por rota no período</span>
        <span className="text-[10px] text-muted-foreground">Clique na rota para filtrar</span>
      </div>
      <table className="w-full mt-3 text-xs min-w-[760px]">
        <thead>
          <tr className="text-muted-foreground text-right">
            <th className="text-left pb-2">Rota (cidade)</th>
            <th className="pb-2">Eventos</th>
            <th className="pb-2">Pagos</th>
            <th className="pb-2">% do total</th>
            <th className="pb-2">VIP</th>
            <th className="pb-2">Cortesias</th>
            <th className="pb-2">Últ. 7 dias</th>
            <th className="pb-2">Compradores</th>
            <th className="pb-2">Faturamento</th>
            <th className="pb-2">Ticket/ingr.</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && (
            <tr><td colSpan={10} className="py-2 text-muted-foreground">Sem vendas no período</td></tr>
          )}
          {linhas.map((l) => (
            <tr key={l.cidade} className="border-t border-border text-right mono">
              <td className="text-left py-1.5 font-sans font-semibold">
                <button onClick={() => onEscolher(l.cidade)} className="hover:text-primary text-left">{l.cidade}</button>
              </td>
              <td>{num(l.eventos)}</td>
              <td>{num(l.ingressos_pagos)}</td>
              <td>{pct(l.ingressos_pagos, total)}</td>
              <td>{num(l.vip)}</td>
              <td>{num(l.cortesias)}</td>
              <td>{num(l.ult_7d)}</td>
              <td>{num(l.compradores)}</td>
              <td>{brl(l.faturamento)}</td>
              <td>{brl(l.ingressos_pagos ? l.faturamento / l.ingressos_pagos : 0)}</td>
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
  const [rota, setRota] = useState<string | null>(null);
  const { data, error, isFetching, refetch } = useCentralIngressos(inicio, fim, rota);
  // A lista de rotas não muda com o filtro; guarda a última conhecida para o select não piscar.
  const [rotas, setRotas] = useState<CentralRota[]>([]);
  useEffect(() => { if (data?.rotas) setRotas(data.rotas); }, [data]);

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
        titulo="Visão geral · Vendas de ingressos"
        subtitulo={aba === 'online' ? 'Máquina de Vendas Online · Meta Ads e HubSpot' : <>Máquina de Vendas presencial · {rota ? `Rota ${rota}` : 'Geral, todas as rotas'} · Guru {atualizado && `· atualizado ${atualizado}`}</>}
        acoes={aba === 'presencial' ? <AtualizarPeriodo aoConcluir={() => refetch()} /> : undefined}
        onAtualizar={aba === 'presencial' ? () => refetch() : undefined}
        atualizando={isFetching}
      />

      <PageBody>
        <Abas<AbaMV> valor={aba as AbaMV} onChange={(v) => nav(v === 'presencial' ? '/central' : '/central/online')} itens={[{ valor: 'presencial', rotulo: 'Presencial · Ingressos' }, { valor: 'online', rotulo: 'Online' }]} />

        {aba === 'online' && <MaquinaOnline />}

        {aba === 'presencial' && (
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker startDate={inicio} endDate={fim} onChange={(s, e) => { setInicio(s); setFim(e); }} />
            <FiltroRota rotas={rotas} valor={rota} onChange={setRota} />
            {rota && (
              <button onClick={() => setRota(null)} className="text-[11px] text-primary font-semibold">Ver geral</button>
            )}
          </div>
        )}

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

            {!rota && <RotasTabela linhas={data.por_rota} total={r.ingressos_pagos} onEscolher={setRota} />}

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
      </PageBody>
    </div>
  );
}
