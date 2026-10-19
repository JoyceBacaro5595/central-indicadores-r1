import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { FiltroPeriodo, FiltroUnico, PageBody, PageHeader } from '@/components/shared';

/* Fluxo Marketing da Máquina de Vendas, no mesmo padrão do Fluxo Marketing RGV (Perpetuo.tsx): cabeçalho com conta e período,
   título da visão com o investimento, faixa do funil em uma linha (cada etapa com número, barra, taxa e custo) e lista por cidade.
   As etapas são as dos eventos: mídia Meta → cliques → visitas LP → checkouts → compras no Meta → ingressos pagos → faturamento.
   Fonte: RPC meta_eventos (Meta Ads + Guru). Visitas LP e Checkouts ainda não são coletados do Meta para a Máquina de Vendas: ficam "—".
   Não há etapas de CRM (MQL/SQL) para eventos, e as abas Criativos e Páginas do RGV não se aplicam aqui. */

interface MetaEvento {
  cidade: string; mes_evento: string; campanhas: number; investimento: number; impressoes: number; cliques: number;
  compras_meta: number; faturamento: number; ingressos_pagos: number; roas: number | null; cpa: number | null;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (d: string) => `${MESES[Number(d.slice(5, 7)) - 1]}/${d.slice(2, 4)}`;
const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const brl2 = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—');
const div = (a: number, b: number) => (b > 0 ? a / b : null);

const f2 = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const log = (v: number, max: number) => (v > 0 && max > 0 ? Math.max(2, Math.min(100, (100 * Math.log10(v + 1)) / Math.log10(max + 1))) : 0);

const CARD_FAIXA = 'faixa-slot min-w-0 border-b border-border md:border-b-0 md:flex-1 md:basis-0';
const TITULO_FAIXA = 'text-[12px] font-bold text-foreground leading-tight min-h-[2rem]';
const NUM_FAIXA = 'num-faixa leading-none mt-2 text-foreground whitespace-nowrap overflow-hidden';
const CUSTO_FAIXA = 'custo-faixa text-foreground whitespace-nowrap overflow-hidden';

/** Número de caracteres do valor: o CSS usa para o texto caber no card sem sobrepor. */
const nFit = (t: string) => ({ ['--n' as string]: Math.max(3, t.length) }) as React.CSSProperties;

const Linha = ({ k, v }: { k: string; v: string }) => (
  <div className="flex flex-col"><span className="text-muted-foreground">{k}</span><span className="font-bold text-foreground">{v}</span></div>
);

function Etapa({ titulo, valor, largura, linhas, custoRotulo, custo }: { titulo: string; valor: string; largura: number; linhas: [string, string][]; custoRotulo: string; custo: string }) {
  return (
    <div className={CARD_FAIXA}><div>
      <div className={TITULO_FAIXA}>{titulo}</div>
      <div className={NUM_FAIXA} style={nFit(valor)}>{valor}</div>
      <div className="h-1.5 rounded-full bg-muted mt-2.5 overflow-hidden"><div className="h-full rounded-full bg-primary/80" style={{ width: `${largura}%` }} /></div>
      <div className="mt-2 space-y-1.5 text-[10px] min-h-[2.5rem]">{linhas.map(([k, v]) => <Linha key={k} k={k} v={v} />)}</div>
      <div className="mt-3 text-[10px] text-muted-foreground leading-tight">{custoRotulo}</div>
      <div className={CUSTO_FAIXA} style={nFit(custo)}>{custo}</div>
    </div></div>
  );
}

const ABAS = [{ valor: 'cidades', rotulo: 'Cidades' }];

interface EventoData { cidade: string; mes_evento: string; data_evento: string | null }
type Status = 'todos' | 'aconteceu' | 'nao';
const STATUS = [{ valor: 'todos', rotulo: 'Todos os eventos' }, { valor: 'aconteceu', rotulo: 'Aconteceu' }, { valor: 'nao', rotulo: 'Não aconteceu' }];
/** O evento aconteceu quando a data já passou; sem data cadastrada, vale o mês do evento (mês anterior ao atual). */
function aconteceu(dataEvento: string | null | undefined, mes: string, hoje: string) {
  return dataEvento ? dataEvento < hoje : mes.slice(0, 7) < hoje.slice(0, 7);
}

export default function FluxoMarketingMdv() {
  const [de, setDe] = useState(`${new Date().getUTCFullYear()}-01-01`);
  const [ate, setAte] = useState(`${new Date().getUTCFullYear()}-12-01`);
  const q = useQuery({ queryKey: ['fmm-meta', de, ate], queryFn: () => r1Rpc<MetaEvento[]>('meta_eventos', { p_de: de, p_ate: ate }), refetchInterval: 15 * 60_000 });
  const evq = useQuery({ queryKey: ['fmm-eventos', de, ate], queryFn: () => r1Rpc<EventoData[]>('eventos_listar', { p_de: de, p_ate: ate }), refetchInterval: 15 * 60_000 });
  const [status, setStatus] = useState<Status>('todos');
  const [cidade, setCidade] = useState('todas');
  const todos = q.data ?? [];
  const cidades = useMemo(() => [...new Set(todos.map((r) => r.cidade))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [todos]);
  const dados = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const datas = new Map((evq.data ?? []).map((e) => [`${e.cidade}|${e.mes_evento}`, e.data_evento]));
    return todos.filter((r) => {
      if (cidade !== 'todas' && r.cidade !== cidade) return false;
      if (status === 'todos') return true;
      const ja = aconteceu(datas.get(`${r.cidade}|${r.mes_evento}`), r.mes_evento, hoje);
      return status === 'aconteceu' ? ja : !ja;
    });
  }, [todos, evq.data, status, cidade]);

  const t = useMemo(() => dados.reduce((s, r) => ({
    inv: s.inv + Number(r.investimento || 0), imp: s.imp + Number(r.impressoes || 0), cli: s.cli + Number(r.cliques || 0),
    cmp: s.cmp + Number(r.compras_meta || 0), ing: s.ing + Number(r.ingressos_pagos || 0), fat: s.fat + Number(r.faturamento || 0),
    camp: s.camp + Number(r.campanhas || 0),
  }), { inv: 0, imp: 0, cli: 0, cmp: 0, ing: 0, fat: 0, camp: 0 }), [dados]);
  const max = Math.max(t.imp, 1);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo="Máquina de Vendas · Fluxo Marketing MDV"
        subtitulo="Da mídia ao ingresso pago, por cidade da Máquina de Vendas"
        onAtualizar={() => q.refetch()}
        atualizando={q.isFetching}
        acoes={<div className="hidden lg:flex items-center gap-2"><FiltroPeriodo rotulo="Meses do evento" modo="mes" de={de} ate={ate} onChange={(a, b) => { setDe(a); setAte(b); }} /></div>}
      />
      <PageBody className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="toggle-group">
            {ABAS.map((a) => <button key={a.valor} className="toggle-item toggle-item-ativo">{a.rotulo}</button>)}
          </div>
          <div className="flex lg:hidden flex-wrap items-center gap-2"><FiltroPeriodo rotulo="Meses do evento" modo="mes" de={de} ate={ate} onChange={(a, b) => { setDe(a); setAte(b); }} /></div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FiltroUnico rotulo="Eventos" opcoes={STATUS} valor={status} onChange={(v) => setStatus(v as Status)} />
          <FiltroUnico rotulo="Cidade" opcoes={[{ valor: 'todas', rotulo: 'Todas as cidades' }, ...cidades.map((c) => ({ valor: c, rotulo: c }))]} valor={cidade} onChange={setCidade} />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow">Funil de mídia · Máquina de Vendas</div>
            <h2 className="text-xl md:text-2xl font-semibold leading-tight mt-1 text-foreground">Cidades</h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span>{nomeMes(de)} a {nomeMes(ate)} (mês do evento)</span>
              <span><b className="text-foreground">{dados.length}</b> {dados.length === 1 ? 'cidade' : 'cidades'}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow">Investimento no período</div>
            <div className="text-2xl md:text-3xl font-semibold leading-none mt-1 text-foreground">{brl2(t.inv)}</div>
            <div className="text-sm text-muted-foreground mt-1">CAC {brl2(div(t.inv, t.ing))}</div>
          </div>
        </div>

        {q.error && <div className="surface p-4 text-sm text-red-400">Erro ao ler os dados: {String((q.error as Error).message ?? q.error)}</div>}
        {q.isLoading && <div className="text-sm text-muted-foreground">Carregando o funil…</div>}

        {!q.isLoading && !q.error && (
          <div className="space-y-1.5">
            <div className="surface overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:flex md:flex-nowrap md:divide-x md:divide-border [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-border sm:[&>*:nth-child(odd)]:border-r-0 sm:[&>*:not(:nth-child(4n))]:border-r sm:[&>*]:border-border md:[&>*]:border-r-0">
                <div className={CARD_FAIXA}><div>
                  <div className={TITULO_FAIXA}>Investimento</div>
                  <div className="num-faixa leading-none mt-2 text-foreground whitespace-nowrap overflow-hidden" style={nFit(brl2(t.inv))}>{brl2(t.inv)}</div>
                  <div className="h-1.5 mt-2.5" />
                  <div className="mt-2 space-y-1.5 text-[10px] min-h-[2.5rem]">
                    <Linha k="Campanhas" v={num(t.camp)} />
                    <Linha k="CPM" v={brl2(div(t.inv * 1000, t.imp))} />
                  </div>
                  <div className="mt-3 text-[10px] text-muted-foreground leading-tight">Meta Ads · Máquina de Vendas</div>
                  <div className={CUSTO_FAIXA}>&nbsp;</div>
                </div></div>
                <Etapa titulo="Impressões" valor={num(t.imp)} largura={log(t.imp, max)} linhas={[['Cliques', num(t.cli)]]} custoRotulo="CPM" custo={brl2(div(t.inv * 1000, t.imp))} />
                <Etapa titulo="Cliques no link" valor={num(t.cli)} largura={log(t.cli, max)} linhas={[['CTR', pct(t.cli, t.imp)], ['Meta de CTR', '1%']]} custoRotulo="CPC" custo={brl2(div(t.inv, t.cli))} />
                <Etapa titulo="Visitas LP" valor="—" largura={0} linhas={[['Connect rate', '—']]} custoRotulo="Custo por visita" custo="—" />
                <Etapa titulo="Checkouts" valor="—" largura={0} linhas={[['Visitas → checkout', '—']]} custoRotulo="Custo por checkout" custo="—" />
                <Etapa titulo="Compras no Meta" valor={num(t.cmp)} largura={log(t.cmp, max)} linhas={[['Clique → compra', pct(t.cmp, t.cli)]]} custoRotulo="Custo por compra" custo={brl2(div(t.inv, t.cmp))} />
                <Etapa titulo="Ingressos pagos (Guru)" valor={num(t.ing)} largura={log(t.ing, max)} linhas={[['Clique → ingresso', pct(t.ing, t.cli)], ['Ticket médio', brl2(div(t.fat, t.ing))]]} custoRotulo="CAC" custo={brl2(div(t.inv, t.ing))} />
                <Etapa titulo="Faturamento" valor={brl(t.fat)} largura={log(t.fat, Math.max(t.fat, t.inv, 1))} linhas={[['ROAS', f2(div(t.fat, t.inv))]]} custoRotulo="Resultado − investimento" custo={brl(t.fat - t.inv)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Visitas LP e Checkouts ainda não são coletados do Meta para a Máquina de Vendas, por isso aparecem "—" (nunca zero). Compras no Meta e ingressos pagos são fontes diferentes: a taxa entre elas é só referência. A barra de cada etapa usa escala logarítmica.</p>
          </div>
        )}

        {!q.isLoading && !q.error && (
          <section>
            <h3 className="text-sm font-semibold mb-2">Por cidade e mês do evento</h3>
            <div className="surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    {['Cidade', 'Mês', 'Camp.', 'Investimento', 'Impressões', 'Cliques', 'CTR', 'CPC', 'Compras Meta', 'Ingressos pagos', 'CAC', 'Faturamento', 'ROAS'].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i > 1 ? 'text-right' : ''}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {dados.length === 0 && <tr><td colSpan={13} className="px-3 py-6 text-center text-muted-foreground">Sem dados no período.</td></tr>}
                  {dados.map((r) => (
                    <tr key={`${r.cidade}-${r.mes_evento}`} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{r.cidade}</td>
                      <td className="px-3 py-2">{nomeMes(r.mes_evento)}</td>
                      <td className="px-3 py-2 text-right mono">{num(r.campanhas)}</td>
                      <td className="px-3 py-2 text-right mono">{brl(r.investimento)}</td>
                      <td className="px-3 py-2 text-right mono">{num(r.impressoes)}</td>
                      <td className="px-3 py-2 text-right mono">{num(r.cliques)}</td>
                      <td className="px-3 py-2 text-right mono">{pct(r.cliques, r.impressoes)}</td>
                      <td className="px-3 py-2 text-right mono">{brl2(div(r.investimento, r.cliques))}</td>
                      <td className="px-3 py-2 text-right mono">{num(r.compras_meta)}</td>
                      <td className="px-3 py-2 text-right mono">{num(r.ingressos_pagos)}</td>
                      <td className="px-3 py-2 text-right mono">{brl2(r.cpa)}</td>
                      <td className="px-3 py-2 text-right mono">{brl(r.faturamento)}</td>
                      <td className="px-3 py-2 text-right mono">{r.roas == null ? '—' : r.roas.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </PageBody>
    </div>
  );
}
