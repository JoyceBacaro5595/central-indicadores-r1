import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { PageBody, PageHeader } from '@/components/shared';

/* Fluxo Marketing da Máquina de Vendas: mesma ideia do Fluxo Marketing RGV, com o funil de eventos
   (mídia Meta → cliques → compras no Meta → ingressos pagos → faturamento) por cidade/evento.
   Fonte: RPC meta_eventos (Meta Ads + Guru). Não há etapas de CRM (MQL/SQL) para eventos. */

interface MetaEvento {
  cidade: string; mes_evento: string; campanhas: number; investimento: number; impressoes: number; cliques: number;
  compras_meta: number; faturamento: number; ingressos_pagos: number; roas: number | null; cpa: number | null;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (d: string) => `${MESES[Number(d.slice(5, 7)) - 1]}/${d.slice(2, 4)}`;
const mesISO = (offset: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7) + '-01'; };
const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const brl2 = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—');
const div = (a: number, b: number) => (b > 0 ? a / b : null);

const Kpi = ({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) => (
  <div className="rounded-lg border border-border bg-card p-4">
    <div className="text-xs text-muted-foreground">{rotulo}</div>
    <div className="text-2xl font-bold mono mt-1">{valor}</div>
    {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
  </div>
);

export default function FluxoMarketingMdv() {
  const [de, setDe] = useState(mesISO(-1));
  const [ate, setAte] = useState(mesISO(3));
  const q = useQuery({ queryKey: ['fmm-meta', de, ate], queryFn: () => r1Rpc<MetaEvento[]>('meta_eventos', { p_de: de, p_ate: ate }), refetchInterval: 15 * 60_000 });
  const dados = q.data ?? [];

  const t = useMemo(() => dados.reduce((s, r) => ({
    inv: s.inv + Number(r.investimento || 0), imp: s.imp + Number(r.impressoes || 0), cli: s.cli + Number(r.cliques || 0),
    cmp: s.cmp + Number(r.compras_meta || 0), ing: s.ing + Number(r.ingressos_pagos || 0), fat: s.fat + Number(r.faturamento || 0),
  }), { inv: 0, imp: 0, cli: 0, cmp: 0, ing: 0, fat: 0 }), [dados]);

  const etapas = [
    { nome: 'Impressões', v: t.imp }, { nome: 'Cliques', v: t.cli }, { nome: 'Compras no Meta', v: t.cmp }, { nome: 'Ingressos pagos (Guru)', v: t.ing },
  ];
  const max = Math.max(1, ...etapas.map((e) => e.v));

  return (
    <>
      <PageHeader titulo="Fluxo Marketing MDV" subtitulo="Da mídia ao ingresso pago, por cidade da Máquina de Vendas" onAtualizar={() => q.refetch()} atualizando={q.isFetching} />
      <PageBody>
        <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
          <label className="text-muted-foreground">Meses do evento</label>
          <input type="month" value={de.slice(0, 7)} onChange={(e) => { if (!e.target.value) return; const d = `${e.target.value}-01`; setDe(d); if (d > ate) setAte(d); }} className="bg-secondary rounded px-2 py-1" />
          <span className="text-muted-foreground">até</span>
          <input type="month" value={ate.slice(0, 7)} onChange={(e) => { if (!e.target.value) return; const d = `${e.target.value}-01`; setAte(d); if (d < de) setDe(d); }} className="bg-secondary rounded px-2 py-1" />
        </div>
        {q.error ? <p className="text-sm text-red-400">Erro ao ler os dados: {String((q.error as Error).message ?? q.error)}</p> : q.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <Kpi rotulo="Investimento" valor={brl(t.inv)} sub={`${num(dados.reduce((s, r) => s + Number(r.campanhas || 0), 0))} campanhas`} />
              <Kpi rotulo="Ingressos pagos" valor={num(t.ing)} sub={`CPA ${brl2(div(t.inv, t.ing))}`} />
              <Kpi rotulo="Faturamento" valor={brl(t.fat)} sub={`ROAS ${div(t.fat, t.inv)?.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) ?? '—'}`} />
              <Kpi rotulo="Compras no Meta" valor={num(t.cmp)} sub={`Custo ${brl2(div(t.inv, t.cmp))}`} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <Kpi rotulo="CPM" valor={brl2(div(t.inv * 1000, t.imp))} />
              <Kpi rotulo="CTR" valor={pct(t.cli, t.imp)} />
              <Kpi rotulo="CPC" valor={brl2(div(t.inv, t.cli))} />
              <Kpi rotulo="Clique → ingresso pago" valor={pct(t.ing, t.cli)} />
            </div>

            <h3 className="text-sm font-semibold mb-2">Funil</h3>
            <div className="rounded-lg border border-border bg-card p-4 mb-5 space-y-2">
              {etapas.map((e, i) => (
                <div key={e.nome} className="flex items-center gap-3 text-sm">
                  <div className="w-44 shrink-0 text-muted-foreground">{e.nome}</div>
                  <div className="flex-1 h-5 bg-secondary rounded overflow-hidden"><div className="h-full bg-primary/70" style={{ width: `${Math.max(1, (e.v / max) * 100)}%` }} /></div>
                  <div className="w-24 text-right mono">{num(e.v)}</div>
                  <div className="w-16 text-right text-xs text-muted-foreground mono">{i > 0 ? pct(e.v, etapas[i - 1].v) : ''}</div>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground pt-1">Compras no Meta e ingressos pagos são fontes diferentes, então a taxa entre elas é só uma referência.</p>
            </div>

            <h3 className="text-sm font-semibold mb-2">Por cidade e mês do evento</h3>
            <div className="rounded-lg border border-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    {['Cidade', 'Mês', 'Camp.', 'Investimento', 'Impressões', 'Cliques', 'CTR', 'CPC', 'Compras Meta', 'Ingressos pagos', 'CPA', 'Faturamento', 'ROAS'].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i > 1 ? 'text-right' : ''}`}>{h}</th>)}
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
          </>
        )}
      </PageBody>
    </>
  );
}
