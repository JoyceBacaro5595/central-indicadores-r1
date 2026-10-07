import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { ArrowLeft, RefreshCw, Download, Printer } from 'lucide-react';
import { PageHeader } from '@/components/shared';
import {
  useRelatorioIngressos,
  RelatorioFiltros,
  RelatorioIngressos,
  RelatorioLinha,
} from '@/hooks/useRelatorioIngressos';

const brl = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

function hojeISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

type Periodo = 'ano' | 'mes' | 'mes_anterior' | '30d' | 'livre';

function periodoDatas(p: Periodo): [string, string] {
  const hoje = hojeISO();
  const ano = hoje.slice(0, 4);
  if (p === 'ano') return [`${ano}-01-01`, hoje];
  if (p === 'mes') return [hoje.slice(0, 8) + '01', hoje];
  if (p === 'mes_anterior') {
    const d = new Date(`${hoje.slice(0, 8)}01T12:00:00Z`);
    d.setUTCDate(0);
    const fim = d.toISOString().slice(0, 10);
    return [fim.slice(0, 8) + '01', fim];
  }
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 29);
  return [d.toISOString().slice(0, 10), hoje];
}

// Colunas comuns a todos os cortes.
const COLUNAS: { key: keyof RelatorioLinha; label: string; fmt: (v: any) => string }[] = [
  { key: 'pedidos', label: 'Pedidos', fmt: num },
  { key: 'ingressos_aprovados', label: 'Ingressos aprovados', fmt: num },
  { key: 'ingressos_pagos', label: 'Pagos', fmt: num },
  { key: 'vip_pagos', label: 'VIP pagos', fmt: num },
  { key: 'cortesias', label: 'Cortesias', fmt: num },
  { key: 'compradores', label: 'Compradores', fmt: num },
  { key: 'faturamento_bruto', label: 'Fat. bruto', fmt: brl },
  { key: 'faturamento_liquido', label: 'Fat. líquido', fmt: brl },
  { key: 'ticket_medio', label: 'Ticket médio', fmt: (v) => (v == null ? '—' : brl(v)) },
  { key: 'reembolsos', label: 'Reembolsos', fmt: num },
  { key: 'valor_reembolsado', label: 'Valor reemb.', fmt: brl },
  { key: 'nao_convertidos', label: 'Expirados/cancel.', fmt: num },
  { key: 'pendentes', label: 'Pendentes', fmt: num },
  { key: 'conversao_pct', label: 'Conversão', fmt: (v) => (v == null ? '—' : `${String(v).replace('.', ',')}%`) },
];

const CORTES: { key: keyof RelatorioIngressos; label: string; dim: string; rotulo?: (c: string) => string }[] = [
  { key: 'por_cidade', label: 'Por cidade', dim: 'Cidade' },
  { key: 'por_mes', label: 'Por mês', dim: 'Mês', rotulo: nomeMes },
  { key: 'por_tipo', label: 'Por tipo de ingresso', dim: 'Tipo' },
  { key: 'por_canal', label: 'Por canal de venda', dim: 'Canal' },
  { key: 'por_pagamento', label: 'Por forma de pagamento', dim: 'Pagamento' },
  { key: 'por_parcelas', label: 'Por parcelamento', dim: 'Parcelas' },
  { key: 'por_status', label: 'Por status da venda', dim: 'Status' },
  { key: 'por_linha', label: 'Por produto', dim: 'Produto' },
];

function baixarCSV(nome: string, cabecalho: string[], linhas: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cabecalho, ...linhas].map((l) => l.map(esc).join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nome}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function TabelaCorte({
  titulo,
  dim,
  linhas,
  total,
  rotulo,
  arquivo,
}: {
  titulo: string;
  dim: string;
  linhas: RelatorioLinha[];
  total: RelatorioLinha | null;
  rotulo?: (c: string) => string;
  arquivo: string;
}) {
  const exportar = () =>
    baixarCSV(
      arquivo,
      [dim, ...COLUNAS.map((c) => c.label)],
      linhas.map((l) => [l.chave, ...COLUNAS.map((c) => l[c.key] as number | null)]),
    );
  return (
    <div className="surface p-4 overflow-x-auto break-inside-avoid">
      <div className="flex items-center justify-between">
        <span className="section-label">{titulo}</span>
        <button onClick={exportar} className="text-[11px] text-primary font-semibold flex items-center gap-1 print:hidden">
          <Download className="w-3 h-3" /> CSV
        </button>
      </div>
      <table className="w-full mt-3 text-xs min-w-[1100px]">
        <thead>
          <tr className="text-muted-foreground text-right">
            <th className="text-left pb-2">{dim}</th>
            {COLUNAS.map((c) => (
              <th key={c.key} className="pb-2 font-semibold">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && (
            <tr><td colSpan={COLUNAS.length + 1} className="py-2 text-muted-foreground">Sem dados no período</td></tr>
          )}
          {linhas.map((l) => (
            <tr key={l.chave} className="border-t border-border">
              <td className="py-1.5 text-left">{rotulo ? rotulo(l.chave) : l.chave}</td>
              {COLUNAS.map((c) => (
                <td key={c.key} className="py-1.5 text-right mono">{c.fmt(l[c.key])}</td>
              ))}
            </tr>
          ))}
          {total && linhas.length > 1 && (
            <tr className="border-t-2 border-border font-bold">
              <td className="py-1.5 text-left">Total</td>
              {COLUNAS.map((c) => (
                <td key={c.key} className="py-1.5 text-right mono">{c.fmt(total[c.key])}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CidadeMes({ data }: { data: RelatorioIngressos }) {
  const [medida, setMedida] = useState<'ingressos_aprovados' | 'ingressos_pagos' | 'cortesias' | 'faturamento_bruto'>(
    'ingressos_aprovados',
  );
  const meses = useMemo(() => [...new Set(data.cidade_mes.map((c) => c.mes))].sort(), [data]);
  const cidades = data.por_cidade.map((c) => c.chave);
  const mapa = useMemo(() => {
    const m = new Map<string, number>();
    data.cidade_mes.forEach((c) => m.set(`${c.cidade}|${c.mes}`, c[medida]));
    return m;
  }, [data, medida]);
  const fmt = medida === 'faturamento_bruto' ? brl : num;
  const totalMes = (mes: string) => cidades.reduce((s, c) => s + (mapa.get(`${c}|${mes}`) ?? 0), 0);
  const totalCidade = (c: string) => meses.reduce((s, m) => s + (mapa.get(`${c}|${m}`) ?? 0), 0);

  const exportar = () =>
    baixarCSV(
      `ingressos-cidade-mes-${medida}`,
      ['Cidade', ...meses.map(nomeMes), 'Total'],
      cidades.map((c) => [c, ...meses.map((m) => mapa.get(`${c}|${m}`) ?? 0), totalCidade(c)]),
    );

  return (
    <div className="surface p-4 overflow-x-auto break-inside-avoid">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="section-label">Cidade × mês da venda</span>
        <div className="flex items-center gap-2 print:hidden">
          <select
            value={medida}
            onChange={(e) => setMedida(e.target.value as typeof medida)}
            className="bg-secondary text-xs rounded-md px-2 py-1"
          >
            <option value="ingressos_aprovados">Ingressos aprovados</option>
            <option value="ingressos_pagos">Ingressos pagos</option>
            <option value="cortesias">Cortesias</option>
            <option value="faturamento_bruto">Faturamento bruto</option>
          </select>
          <button onClick={exportar} className="text-[11px] text-primary font-semibold flex items-center gap-1">
            <Download className="w-3 h-3" /> CSV
          </button>
        </div>
      </div>
      <table className="w-full mt-3 text-xs">
        <thead>
          <tr className="text-muted-foreground text-right">
            <th className="text-left pb-2">Cidade</th>
            {meses.map((m) => <th key={m} className="pb-2 font-semibold">{nomeMes(m)}</th>)}
            <th className="pb-2 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {cidades.map((c) => (
            <tr key={c} className="border-t border-border">
              <td className="py-1.5 text-left">{c}</td>
              {meses.map((m) => {
                const v = mapa.get(`${c}|${m}`) ?? 0;
                return <td key={m} className={`py-1.5 text-right mono ${v ? '' : 'text-muted-foreground/40'}`}>{v ? fmt(v) : '·'}</td>;
              })}
              <td className="py-1.5 text-right mono font-semibold">{fmt(totalCidade(c))}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-border font-bold">
            <td className="py-1.5 text-left">Total</td>
            {meses.map((m) => <td key={m} className="py-1.5 text-right mono">{fmt(totalMes(m))}</td>)}
            <td className="py-1.5 text-right mono">{fmt(meses.reduce((s, m) => s + totalMes(m), 0))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mono">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

const STATUS_OPCOES: [string, string][] = [
  ['approved', 'Aprovada'],
  ['waiting_payment', 'Aguardando pagamento'],
  ['expired', 'Expirada'],
  ['canceled', 'Cancelada'],
  ['refunded', 'Reembolsada'],
  ['chargeback', 'Chargeback'],
  ['dispute', 'Em disputa'],
];
const PAGAMENTO_OPCOES: [string, string][] = [
  ['pix', 'Pix'],
  ['credit_card', 'Cartão de crédito'],
  ['billet', 'Boleto'],
  ['free', 'Gratuito'],
];
const TIPO_OPCOES = ['COMUM', 'VIP', 'CORTESIA'];

function Filtro({
  label,
  value,
  onChange,
  opcoes,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opcoes: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-secondary text-xs text-foreground rounded-md px-2 py-1.5 normal-case font-normal min-w-[140px]">
        <option value="">Todos</option>
        {opcoes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export default function Relatorio() {
  const [periodo, setPeriodo] = useState<Periodo>('ano');
  const [[inicio, fim], setDatas] = useState<[string, string]>(periodoDatas('ano'));
  const [filtros, setFiltros] = useState<RelatorioFiltros>({ linha: 'MÁQUINA DE VENDAS PRESENCIAL' });
  const { data, error, isFetching, refetch } = useRelatorioIngressos(inicio, fim, filtros);

  useEffect(() => {
    document.documentElement.classList.toggle('light', localStorage.getItem('theme') === 'light');
  }, []);

  const escolherPeriodo = (p: Periodo) => {
    setPeriodo(p);
    if (p !== 'livre') setDatas(periodoDatas(p));
  };
  const setF = (k: keyof RelatorioFiltros) => (v: string) => setFiltros((f) => ({ ...f, [k]: v || null }));

  const t = data?.total;
  const atualizado = data ? new Date(data.atualizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
  const grafico = (data?.por_mes ?? []).map((m) => ({
    mes: nomeMes(m.chave),
    pagos: m.ingressos_pagos - m.vip_pagos,
    vip: m.vip_pagos,
    cortesias: m.cortesias,
  }));
  const sufixo = `${inicio}_${fim}`;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo="Relatório de vendas · Ingressos"
        subtitulo={<>Gerado automaticamente da Guru {atualizado && `· dados de ${atualizado}`}</>}
        acoes={
          <button onClick={() => window.print()} className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary" title="Imprimir / salvar PDF">
            <Printer className="w-4 h-4" />
          </button>
        }
        onAtualizar={() => refetch()}
        atualizando={isFetching}
      />

      <main className="py-6 space-y-6 mx-auto max-w-[1520px] px-4 md:px-8">
        <div className="surface p-4 flex flex-wrap items-end gap-3 print:hidden">
          <div className="flex flex-col gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
            Período
            <div className="flex gap-1">
              {([
                ['ano', 'Ano'],
                ['mes', 'Mês atual'],
                ['mes_anterior', 'Mês anterior'],
                ['30d', '30 dias'],
              ] as [Periodo, string][]).map(([p, l]) => (
                <button
                  key={p}
                  onClick={() => escolherPeriodo(p)}
                  className={`text-xs px-2.5 py-1.5 rounded-md normal-case font-semibold ${periodo === p ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
            De
            <input type="date" value={inicio} onChange={(e) => { setPeriodo('livre'); setDatas([e.target.value, fim]); }} className="bg-secondary text-xs text-foreground rounded-md px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
            Até
            <input type="date" value={fim} onChange={(e) => { setPeriodo('livre'); setDatas([inicio, e.target.value]); }} className="bg-secondary text-xs text-foreground rounded-md px-2 py-1" />
          </label>
          <Filtro label="Produto" value={filtros.linha ?? ''} onChange={setF('linha')} opcoes={(data?.opcoes.linhas ?? [filtros.linha ?? '']).filter(Boolean).map((l) => [l, l])} />
          <Filtro label="Cidade" value={filtros.cidade ?? ''} onChange={setF('cidade')} opcoes={(data?.opcoes.cidades ?? []).map((c) => [c, c])} />
          <Filtro label="Tipo" value={filtros.tipo ?? ''} onChange={setF('tipo')} opcoes={TIPO_OPCOES.map((x) => [x, x])} />
          <Filtro label="Pagamento" value={filtros.pagamento ?? ''} onChange={setF('pagamento')} opcoes={PAGAMENTO_OPCOES} />
          <Filtro label="Status" value={filtros.status ?? ''} onChange={setF('status')} opcoes={STATUS_OPCOES} />
        </div>

        <div className="hidden print:block">
          <h1 className="text-lg font-bold">Relatório de vendas de ingressos</h1>
          <p className="text-xs">
            {inicio.split('-').reverse().join('/')} a {fim.split('-').reverse().join('/')}
            {filtros.linha && ` · ${filtros.linha}`} · dados de {atualizado}
          </p>
        </div>

        {error && <div className="surface p-4 text-sm text-red-400">{(error as Error).message}</div>}
        {!data && !error && <div className="text-sm text-muted-foreground">Gerando relatório…</div>}

        {data && t && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
              <Kpi label="Ingressos aprovados" value={num(t.ingressos_aprovados)} sub={`${num(t.ingressos_pagos)} pagos · ${num(t.cortesias)} cortesias`} />
              <Kpi label="Faturamento bruto" value={brl(t.faturamento_bruto)} sub={`líquido ${brl(t.faturamento_liquido)}`} />
              <Kpi label="Ticket médio / ingresso" value={t.ticket_medio == null ? '—' : brl(t.ticket_medio)} />
              <Kpi label="Pedidos · compradores" value={`${num(t.pedidos)} · ${num(t.compradores)}`} sub={`${num(t.pedidos_aprovados)} aprovados`} />
              <Kpi label="Conversão do checkout" value={t.conversao_pct == null ? '—' : `${String(t.conversao_pct).replace('.', ',')}%`} sub={`${num(t.nao_convertidos)} expirados/cancelados · ${num(t.pendentes)} pendentes`} />
              <Kpi label="Reembolsos e chargebacks" value={num(t.reembolsos)} sub={brl(t.valor_reembolsado)} />
            </div>

            {grafico.length > 1 && (
              <div className="section-container break-inside-avoid">
                <span className="section-label">Ingressos aprovados por mês</span>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={grafico}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(228 12% 14%)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fill: 'hsl(220 10% 40%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'hsl(220 10% 40%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="pagos" name="Comuns pagos" stackId="a" fill="hsl(0 65% 50%)" />
                    <Bar dataKey="vip" name="VIP pagos" stackId="a" fill="hsl(45 70% 55%)" />
                    <Bar dataKey="cortesias" name="Cortesias" stackId="a" fill="hsl(220 10% 45%)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <CidadeMes data={data} />

            {CORTES.map((c) => (
              <TabelaCorte
                key={c.key}
                titulo={c.label}
                dim={c.dim}
                linhas={data[c.key] as RelatorioLinha[]}
                total={t}
                rotulo={c.rotulo}
                arquivo={`ingressos-${c.key.replace('por_', '')}-${sufixo}`}
              />
            ))}

            <p className="text-[10px] text-muted-foreground">
              Mês = mês da data da venda na Guru. Ingressos = quantidade do produto. Cortesia = produto
              de cortesia ou venda com valor zero. Conversão = pedidos aprovados ou reembolsados ÷ pedidos iniciados.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
