import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Save, Plus } from 'lucide-react';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/shared';

interface Evento {
  id: number; linha: string; cidade: string; mes_evento: string; data_evento: string | null; local: string | null;
  capacidade: number | null; meta_ingressos: number | null; meta_faturamento: number | null; observacao: string | null;
  realizado: number; pagos: number; cortesias: number; faturamento: number; ult_7d: number; social_selling: number; compradores_unicos: number | null;
  primeira_venda: string | null; ultima_venda: string | null; dias_restantes: number; ritmo_atual: number; ritmo_necessario: number | null;
  pct_meta: number | null; pct_capacidade: number | null; situacao: string;
}
interface Presenca {
  linha: string | null; cidade: string; mes_evento: string; data_evento: string | null; evento_id: number | null;
  esperados: number; presentes: number; convidados: number; cancelados: number; presentes_cortesia: number; presentes_vip: number;
  taxa_presenca: number | null; atualizado_em: string | null;
}
interface MetaEvento {
  cidade: string; mes_evento: string; campanhas: number; investimento: number; impressoes: number; cliques: number; compras_meta: number;
  faturamento: number; ingressos_pagos: number; roas: number | null; cpa: number | null;
}
interface HubEvento {
  cidade: string; mes_evento: string; compradores: number; compradores_hubspot: number; compradores_qualificados: number;
  leads: number; leads_qualificados: number; cortesias_geradas: number; presencas_confirmadas: number; ganhos: number;
}
interface Faixa { faixa: number | null; faixa_rotulo: string; compradores: number; ingressos: number; leads: number; }
interface Jornada {
  linha: string | null; cidade: string; mes_evento: string; evento_id: number | null;
  compradores: number; ingressos: number; participantes_nomeados: number; sem_participante: number;
  compradores_multiplos: number; ingressos_de_multiplos: number; presentes: number; compradores_presentes: number;
  media_por_comprador: number | null; atualizado_em: string | null;
}

const num = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR');
const brl = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const mesLabel = (d: string) => { const [y, m] = d.split('-'); return `${m}/${y}`; };
const dataBR = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const COR: Record<string, string> = {
  'meta batida': 'bg-emerald-500/15 text-emerald-400', 'no ritmo': 'bg-emerald-500/15 text-emerald-400', 'atrás do ritmo': 'bg-amber-500/15 text-amber-400',
  'encerrado abaixo da meta': 'bg-red-500/15 text-red-400', 'é hoje': 'bg-primary/15 text-primary', 'sem meta': 'bg-secondary text-muted-foreground',
};
const mesISO = (offset: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7) + '-01'; };

function Edicao({ e, aoSalvar, salvando }: { e: Evento; aoSalvar: (v: Partial<Evento> & { id: number }) => void; salvando: boolean }) {
  const [v, setV] = useState({ data_evento: e.data_evento ?? '', local: e.local ?? '', capacidade: e.capacidade ?? '', meta_ingressos: e.meta_ingressos ?? '', meta_faturamento: e.meta_faturamento ?? '', observacao: e.observacao ?? '' });
  const cls = 'bg-secondary rounded px-2 py-1 text-foreground text-xs';
  return (
    <tr className="border-t border-border/50 bg-secondary/30">
      <td colSpan={12} className="py-2 px-2">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(ev: FormEvent) => { ev.preventDefault(); aoSalvar({ id: e.id, data_evento: v.data_evento || null, local: v.local || null, capacidade: v.capacidade === '' ? null : Number(v.capacidade), meta_ingressos: v.meta_ingressos === '' ? null : Number(v.meta_ingressos), meta_faturamento: v.meta_faturamento === '' ? null : Number(v.meta_faturamento), observacao: v.observacao || null }); }}>
          <label className="text-[10px] text-muted-foreground">Data do evento<br /><input type="date" value={v.data_evento} onChange={(x) => setV({ ...v, data_evento: x.target.value })} className={`${cls} mono`} /></label>
          <label className="text-[10px] text-muted-foreground">Local<br /><input value={v.local} onChange={(x) => setV({ ...v, local: x.target.value })} className={`${cls} w-40`} /></label>
          <label className="text-[10px] text-muted-foreground">Capacidade<br /><input type="number" value={v.capacidade} onChange={(x) => setV({ ...v, capacidade: x.target.value })} className={`${cls} mono w-20`} /></label>
          <label className="text-[10px] text-muted-foreground">Meta de ingressos<br /><input type="number" value={v.meta_ingressos} onChange={(x) => setV({ ...v, meta_ingressos: x.target.value })} className={`${cls} mono w-20`} /></label>
          <label className="text-[10px] text-muted-foreground">Meta de faturamento (R$)<br /><input type="number" value={v.meta_faturamento} onChange={(x) => setV({ ...v, meta_faturamento: x.target.value })} className={`${cls} mono w-28`} /></label>
          <label className="text-[10px] text-muted-foreground flex-1 min-w-[160px]">Observação<br /><input value={v.observacao} onChange={(x) => setV({ ...v, observacao: x.target.value })} className={`${cls} w-full`} /></label>
          <button type="submit" disabled={salvando} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"><Save className="w-3.5 h-3.5" /> Salvar</button>
        </form>
      </td>
    </tr>
  );
}

export default function Eventos() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [de, setDe] = useState(mesISO(-1));
  const [ate, setAte] = useState(mesISO(3));
  const eventos = useQuery({ queryKey: ['eventos', de, ate], queryFn: () => r1Rpc<Evento[]>('eventos_listar', { p_de: de, p_ate: ate }), refetchInterval: 5 * 60_000 });
  const [editando, setEditando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [nCidade, setNCidade] = useState('');
  const [nMes, setNMes] = useState(mesISO(1).slice(0, 7));
  const [nData, setNData] = useState('');
  const [nMeta, setNMeta] = useState('');
  const editor = pode('gerenciador');
  const vePresenca = pode('presenca');
  const presenca = useQuery({ queryKey: ['presenca', de, ate], queryFn: () => r1Rpc<Presenca[]>('presenca_eventos', { p_inicio: de, p_fim: ate }), enabled: vePresenca, refetchInterval: 5 * 60_000 });
  const jornada = useQuery({ queryKey: ['jornada', de, ate], queryFn: () => r1Rpc<Jornada[]>('compradores_participantes', { p_inicio: de, p_fim: ate }), enabled: vePresenca, refetchInterval: 5 * 60_000 });
  const meta = useQuery({ queryKey: ['meta-eventos', de, ate], queryFn: () => r1Rpc<MetaEvento[]>('meta_eventos', { p_de: de, p_ate: ate }), refetchInterval: 15 * 60_000 });
  const hub = useQuery({ queryKey: ['hubspot-eventos', de, ate], queryFn: () => r1Rpc<HubEvento[]>('hubspot_eventos', { p_inicio: de, p_fim: ate }), refetchInterval: 15 * 60_000 });
  const faixas = useQuery({ queryKey: ['qualificacao-faixas', de, ate], queryFn: () => r1Rpc<Faixa[]>('qualificacao_faixas', { p_inicio: de, p_fim: ate }), refetchInterval: 15 * 60_000 });
  const hubDe = (e: Evento) => (hub.data ?? []).find((h) => h.cidade === e.cidade && h.mes_evento === e.mes_evento);
  const metaDe = (e: Evento) => (meta.data ?? []).find((m) => m.cidade === e.cidade && m.mes_evento === e.mes_evento);
  const presencaDe = (e: Evento) => (presenca.data ?? []).find((p) => p.evento_id === e.id || (p.evento_id == null && p.cidade === e.cidade && p.mes_evento === e.mes_evento));

  const salvar = useMutation({
    mutationFn: (v: Partial<Evento> & { id: number }) => r1Rpc('evento_salvar', { p_id: v.id, p_data_evento: v.data_evento ?? null, p_local: v.local ?? null, p_capacidade: v.capacidade ?? null, p_meta_ingressos: v.meta_ingressos ?? null, p_meta_faturamento: v.meta_faturamento ?? null, p_observacao: v.observacao ?? null, p_ativo: true }),
    onSuccess: () => { setErro(null); setEditando(null); qc.invalidateQueries({ queryKey: ['eventos'] }); },
    onError: (e: Error) => setErro(e.message),
  });
  const criar = useMutation({
    mutationFn: () => r1Rpc('evento_criar', { p_linha: 'MÁQUINA DE VENDAS PRESENCIAL', p_cidade: nCidade, p_mes_evento: `${nMes}-01`, p_data_evento: nData || null, p_capacidade: null, p_meta_ingressos: nMeta === '' ? null : Number(nMeta) }),
    onSuccess: () => { setErro(null); setNovo(false); setNCidade(''); setNMeta(''); setNData(''); qc.invalidateQueries({ queryKey: ['eventos'] }); },
    onError: (e: Error) => setErro(e.message),
  });

  const lista = eventos.data ?? [];
  const tot = lista.reduce((a, e) => ({ realizado: a.realizado + e.realizado, meta: a.meta + (e.meta_ingressos ?? 0), fat: a.fat + e.faturamento }), { realizado: 0, meta: 0, fat: 0 });
  const totP = (presenca.data ?? []).reduce((a, p) => ({ esperados: a.esperados + p.esperados, presentes: a.presentes + p.presentes }), { esperados: 0, presentes: 0 });
  const colunas = vePresenca ? 12 : 11;
  const totH = (hub.data ?? []).filter((h) => lista.some((e) => e.cidade === h.cidade && e.mes_evento === h.mes_evento)).reduce((a, h) => ({ comp: a.comp + Number(h.compradores), hs: a.hs + Number(h.compradores_hubspot), qual: a.qual + Number(h.compradores_qualificados), leads: a.leads + Number(h.leads), cort: a.cort + Number(h.cortesias_geradas), pres: a.pres + Number(h.presencas_confirmadas) }), { comp: 0, hs: 0, qual: 0, leads: 0, cort: 0, pres: 0 });
  const totM = (meta.data ?? []).filter((m) => lista.some((e) => e.cidade === m.cidade && e.mes_evento === m.mes_evento)).reduce((a, m) => ({ inv: a.inv + Number(m.investimento), fat: a.fat + Number(m.faturamento) }), { inv: 0, fat: 0 });

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo="Eventos e metas por cidade"
        subtitulo="Calendário, capacidade, meta, realizado e ritmo necessário · Máquina de Vendas presencial"
        acoes={<>
          <input type="month" value={de.slice(0, 7)} onChange={(e) => setDe(`${e.target.value}-01`)} className="mono text-xs bg-secondary rounded px-2 py-1 text-foreground" />
          <span className="text-xs text-muted-foreground">a</span>
          <input type="month" value={ate.slice(0, 7)} onChange={(e) => setAte(`${e.target.value}-01`)} className="mono text-xs bg-secondary rounded px-2 py-1 text-foreground" />
        </>}
        onAtualizar={() => eventos.refetch()}
        atualizando={eventos.isFetching}
      />

      <main className="py-6 space-y-6 mx-auto max-w-[1520px] px-4 md:px-8">
        {eventos.error && <div className="surface p-4 text-sm text-red-400">{(eventos.error as Error).message}</div>}
        {erro && <div className="surface p-3 text-xs text-red-400">{erro}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="kpi-card"><div className="kpi-label">Eventos no período</div><div className="kpi-value mono">{num(lista.length)}</div></div>
          <div className="kpi-card"><div className="kpi-label">Ingressos realizados</div><div className="kpi-value mono">{num(tot.realizado)}</div></div>
          <div className="kpi-card"><div className="kpi-label">Soma das metas</div><div className="kpi-value mono">{tot.meta ? num(tot.meta) : '—'}</div><div className="text-[10px] text-muted-foreground mt-1">{tot.meta ? `${((100 * tot.realizado) / tot.meta).toFixed(0)}% atingido` : 'defina as metas abaixo'}</div></div>
          <div className="kpi-card"><div className="kpi-label">Faturamento bruto</div><div className="kpi-value mono">{brl(tot.fat)}</div></div>
          <div className="kpi-card"><div className="kpi-label">Meta Ads</div><div className="kpi-value mono">{meta.isLoading ? '…' : brl(totM.inv)}</div><div className="text-[10px] text-muted-foreground mt-1">{totM.inv > 0 ? `ROAS ${(totM.fat / totM.inv).toFixed(2)}x` : 'sem campanhas ligadas'}</div></div>
          <div className="kpi-card"><div className="kpi-label">Compradores qualificados</div><div className="kpi-value mono">{hub.isLoading ? '…' : num(totH.qual)}</div><div className="text-[10px] text-muted-foreground mt-1">{totH.comp ? `${((100 * totH.qual) / totH.comp).toFixed(0)}% de ${num(totH.comp)} · ${num(totH.hs)} no HubSpot` : 'faixa de faturamento do HubSpot'}</div></div>
          {vePresenca && <div className="kpi-card"><div className="kpi-label">Presentes (check-in)</div><div className="kpi-value mono">{presenca.isLoading ? '…' : num(totP.presentes)}</div><div className="text-[10px] text-muted-foreground mt-1">{totP.esperados ? `${((100 * totP.presentes) / totP.esperados).toFixed(0)}% de ${num(totP.esperados)} e-tickets` : 'e-tickets da Guru'}</div></div>}
        </div>

        <section className="surface p-4 overflow-x-auto">
          <div className="flex items-center justify-between">
            <span className="section-label">Eventos (cidade · mês)</span>
            {editor && <button onClick={() => setNovo((v) => !v)} className="flex items-center gap-1 text-xs text-primary font-semibold"><Plus className="w-3.5 h-3.5" /> Novo evento</button>}
          </div>
          {novo && (
            <form onSubmit={(e) => { e.preventDefault(); criar.mutate(); }} className="flex flex-wrap items-end gap-2 mt-3 text-xs">
              <label className="text-[10px] text-muted-foreground">Cidade<br /><input value={nCidade} onChange={(e) => setNCidade(e.target.value)} required className="bg-secondary rounded px-2 py-1 text-foreground w-44" /></label>
              <label className="text-[10px] text-muted-foreground">Mês<br /><input type="month" value={nMes} onChange={(e) => setNMes(e.target.value)} required className="mono bg-secondary rounded px-2 py-1 text-foreground" /></label>
              <label className="text-[10px] text-muted-foreground">Data<br /><input type="date" value={nData} onChange={(e) => setNData(e.target.value)} className="mono bg-secondary rounded px-2 py-1 text-foreground" /></label>
              <label className="text-[10px] text-muted-foreground">Meta<br /><input type="number" value={nMeta} onChange={(e) => setNMeta(e.target.value)} className="mono bg-secondary rounded px-2 py-1 text-foreground w-20" /></label>
              <button type="submit" disabled={criar.isPending} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50">Criar</button>
            </form>
          )}
          <table className="w-full mt-3 text-xs">
            <thead><tr className="text-muted-foreground text-left">
              <th className="pb-2 font-semibold">Evento</th><th className="pb-2 font-semibold">Data</th><th className="pb-2 font-semibold text-right">Capac.</th><th className="pb-2 font-semibold text-right">Meta</th>
              <th className="pb-2 font-semibold text-right">Realizado</th><th className="pb-2 font-semibold text-right">Últ. 7d</th><th className="pb-2 font-semibold text-right">Ritmo atual → necessário</th><th className="pb-2 font-semibold text-right">Faturamento</th><th className="pb-2 font-semibold text-right">Meta Ads · ROAS</th><th className="pb-2 font-semibold text-right">Qualificados · HubSpot</th>{vePresenca && <th className="pb-2 font-semibold text-right">Presença</th>}<th className="pb-2 font-semibold">Situação</th>
            </tr></thead>
            <tbody>
              {eventos.isLoading && <tr><td colSpan={colunas} className="py-3 text-muted-foreground">Carregando…</td></tr>}
              {!eventos.isLoading && lista.length === 0 && <tr><td colSpan={colunas} className="py-3 text-muted-foreground">Nenhum evento no período.</td></tr>}
              {lista.map((e) => (
                <>
                  <tr key={e.id} className={`border-t border-border ${editor ? 'cursor-pointer hover:bg-secondary/40' : ''}`} onClick={() => editor && setEditando(editando === e.id ? null : e.id)} title={editor ? 'Clique para editar data, capacidade e metas' : ''}>
                    <td className="py-2"><div className="font-semibold text-foreground">{e.cidade}</div><div className="text-muted-foreground">{mesLabel(e.mes_evento)}{e.local ? ` · ${e.local}` : ''}{e.observacao ? ` · ${e.observacao}` : ''}</div></td>
                    <td className="py-2 mono">{dataBR(e.data_evento)}{e.dias_restantes > 0 && <div className="text-muted-foreground">{e.dias_restantes} dias</div>}</td>
                    <td className="py-2 text-right mono">{e.capacidade ? num(e.capacidade) : '—'}{e.pct_capacidade != null && <div className="text-muted-foreground">{e.pct_capacidade}%</div>}</td>
                    <td className="py-2 text-right mono">{e.meta_ingressos ? num(e.meta_ingressos) : '—'}{e.pct_meta != null && <div className="text-muted-foreground">{e.pct_meta}%</div>}</td>
                    <td className="py-2 text-right mono font-bold text-foreground">{num(e.realizado)}<div className="text-muted-foreground font-normal">{num(e.pagos)} pagos · {num(e.cortesias)} cort.</div></td>
                    <td className="py-2 text-right mono">{num(e.ult_7d)}</td>
                    <td className="py-2 text-right mono">{e.ritmo_atual}/dia{e.ritmo_necessario != null && <span className={e.ritmo_atual >= e.ritmo_necessario ? ' text-emerald-400' : ' text-amber-400'}> → {e.ritmo_necessario}/dia</span>}</td>
                    <td className="py-2 text-right mono">{brl(e.faturamento)}{e.meta_faturamento ? <div className="text-muted-foreground">{((100 * e.faturamento) / e.meta_faturamento).toFixed(0)}% de {brl(e.meta_faturamento)}</div> : null}</td>
                    {(() => { const m = metaDe(e); return (
                      <td className="py-2 text-right mono">{m ? <>{brl(m.investimento)}<div className="text-muted-foreground">{m.roas != null ? `ROAS ${m.roas}x` : '—'}{m.cpa != null ? ` · CPA ${brl(m.cpa)}` : ''}</div></> : <span className="text-muted-foreground">—</span>}</td>
                    ); })()}
                    {(() => { const h = hubDe(e); return (
                      <td className="py-2 text-right mono">{h && (h.compradores_hubspot > 0 || h.leads > 0) ? <>{num(h.compradores_qualificados)}<span className="text-muted-foreground"> / {num(h.compradores)}</span><div className="text-muted-foreground">{h.compradores ? `${((100 * h.compradores_qualificados) / h.compradores).toFixed(0)}% qualif.` : ''}{h.leads ? ` · ${num(h.leads)} leads form.` : ''}</div></> : <span className="text-muted-foreground">—</span>}</td>
                    ); })()}
                    {vePresenca && (() => { const p = presencaDe(e); return (
                      <td className="py-2 text-right mono">{p && p.esperados > 0 ? <><Link to={`/central/checkins?cidade=${encodeURIComponent(e.cidade)}&mes=${e.mes_evento}`} onClick={(ev) => ev.stopPropagation()} className="text-primary hover:underline">{num(p.presentes)}</Link><span className="text-muted-foreground"> / {num(p.esperados)}</span>{p.taxa_presenca != null && <div className="text-muted-foreground">{p.taxa_presenca}%{p.presentes_cortesia ? ` · ${num(p.presentes_cortesia)} cort.` : ''}</div>}</> : <span className="text-muted-foreground">—</span>}</td>
                    ); })()}
                    <td className="py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${COR[e.situacao] ?? 'bg-secondary'}`}>{e.situacao}</span></td>
                  </tr>
                  {editando === e.id && <Edicao key={`ed-${e.id}`} e={e} aoSalvar={(v) => salvar.mutate(v)} salvando={salvar.isPending} />}
                </>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-muted-foreground mt-3">Os eventos aparecem sozinhos a partir das vendas (cidade e mês do nome do produto). Sem data definida, o ritmo necessário considera o último dia do mês. Ritmo atual = média dos últimos 7 dias. Meta Ads = campanhas da conta Máquina de Vendas ligadas ao evento pela cidade e data no nome da campanha; ROAS = faturamento bruto ÷ investimento; CPA = investimento ÷ ingressos pagos. Qualificados = compradores (e-mail da Guru) que declararam no HubSpot faturamento anual a partir da faixa mínima do Gerenciador (padrão R$ 1 milhão); leads form. = negócios do formulário da Turnê no HubSpot para a cidade e o mês.{vePresenca ? ' Presença = e-tickets com check-in na Guru sobre e-tickets emitidos (sem os cancelados); a lista é relida a cada ~20 min.' : ''}</p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="surface p-4 overflow-x-auto">
            <span className="section-label">Funil do formulário da Turnê (HubSpot)</span>
            <table className="w-full mt-3 text-xs">
              <thead><tr className="text-muted-foreground text-left">
                <th className="pb-2 font-semibold">Evento</th><th className="pb-2 font-semibold text-right">Leads</th><th className="pb-2 font-semibold text-right">Qualificados</th><th className="pb-2 font-semibold text-right">Cortesias geradas</th><th className="pb-2 font-semibold text-right">Presença confirmada</th><th className="pb-2 font-semibold text-right">Compradores qualif.</th>
              </tr></thead>
              <tbody>
                {hub.isLoading && <tr><td colSpan={6} className="py-3 text-muted-foreground">Carregando…</td></tr>}
                {!hub.isLoading && (hub.data ?? []).filter((h) => h.leads > 0 || h.compradores_hubspot > 0).length === 0 && <tr><td colSpan={6} className="py-3 text-muted-foreground">Nenhum dado do HubSpot no período (o sync roda de hora em hora).</td></tr>}
                {(hub.data ?? []).filter((h) => h.leads > 0 || h.compradores_hubspot > 0).map((h) => (
                  <tr key={`${h.cidade}-${h.mes_evento}`} className="border-t border-border">
                    <td className="py-2"><div className="font-semibold text-foreground">{h.cidade}</div><div className="text-muted-foreground">{mesLabel(h.mes_evento)}</div></td>
                    <td className="py-2 text-right mono font-bold text-foreground">{num(h.leads)}</td>
                    <td className="py-2 text-right mono">{num(h.leads_qualificados)}{h.leads > 0 && <div className="text-muted-foreground">{((100 * h.leads_qualificados) / h.leads).toFixed(0)}%</div>}</td>
                    <td className="py-2 text-right mono">{num(h.cortesias_geradas)}</td>
                    <td className="py-2 text-right mono">{num(h.presencas_confirmadas)}</td>
                    <td className="py-2 text-right mono">{num(h.compradores_qualificados)}<span className="text-muted-foreground"> / {num(h.compradores)}</span></td>
                  </tr>
                ))}
                {(hub.data ?? []).length > 0 && <tr className="border-t border-border font-bold text-foreground"><td className="py-2">Total</td><td className="py-2 text-right mono">{num(totH.leads)}</td><td className="py-2 text-right mono">{num((hub.data ?? []).reduce((a, h) => a + Number(h.leads_qualificados), 0))}</td><td className="py-2 text-right mono">{num(totH.cort)}</td><td className="py-2 text-right mono">{num(totH.pres)}</td><td className="py-2 text-right mono">{num(totH.qual)} / {num(totH.comp)}</td></tr>}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-3">Negócios do HubSpot cujo nome traz [TURNEMAQUINADEVENDAS] com a cidade e o mês do evento. Qualificado = faixa de faturamento anual declarada a partir da faixa mínima (Gerenciador). Cortesia gerada e presença confirmada são as etapas do pipeline.</p>
          </section>

          <section className="surface p-4 overflow-x-auto">
            <span className="section-label">Faixa de faturamento declarada</span>
            <table className="w-full mt-3 text-xs">
              <thead><tr className="text-muted-foreground text-left">
                <th className="pb-2 font-semibold">Faixa anual</th><th className="pb-2 font-semibold text-right">Compradores</th><th className="pb-2 font-semibold text-right">Ingressos</th><th className="pb-2 font-semibold text-right">Leads do formulário</th>
              </tr></thead>
              <tbody>
                {faixas.isLoading && <tr><td colSpan={4} className="py-3 text-muted-foreground">Carregando…</td></tr>}
                {(faixas.data ?? []).map((f) => (
                  <tr key={String(f.faixa)} className={`border-t border-border ${f.faixa == null ? 'text-muted-foreground' : ''}`}>
                    <td className="py-2 font-semibold">{f.faixa_rotulo}</td>
                    <td className="py-2 text-right mono">{num(f.compradores)}</td>
                    <td className="py-2 text-right mono">{num(f.ingressos)}</td>
                    <td className="py-2 text-right mono">{num(f.leads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-3">"Não informado" = comprador sem cadastro no HubSpot ou sem a pergunta de faturamento respondida. A faixa vem do contato (melhor faixa entre as perguntas de faturamento anual) e, nos leads, do próprio negócio.</p>
          </section>
        </div>

        {vePresenca && (
          <section className="surface p-4 overflow-x-auto">
            <span className="section-label">Compradores × participantes (e-tickets)</span>
            <table className="w-full mt-3 text-xs">
              <thead><tr className="text-muted-foreground text-left">
                <th className="pb-2 font-semibold">Evento</th><th className="pb-2 font-semibold text-right">Compradores</th><th className="pb-2 font-semibold text-right">Ingressos</th><th className="pb-2 font-semibold text-right">Média</th>
                <th className="pb-2 font-semibold text-right">Compraram 2+</th><th className="pb-2 font-semibold text-right">Sem participante</th><th className="pb-2 font-semibold text-right">Presentes</th><th className="pb-2 font-semibold text-right">Compradores presentes</th>
              </tr></thead>
              <tbody>
                {jornada.isLoading && <tr><td colSpan={8} className="py-3 text-muted-foreground">Carregando…</td></tr>}
                {!jornada.isLoading && (jornada.data ?? []).length === 0 && <tr><td colSpan={8} className="py-3 text-muted-foreground">Nenhum e-ticket no período.</td></tr>}
                {(jornada.data ?? []).map((j) => (
                  <tr key={`${j.cidade}-${j.mes_evento}`} className="border-t border-border">
                    <td className="py-2"><div className="font-semibold text-foreground">{j.cidade}</div><div className="text-muted-foreground">{mesLabel(j.mes_evento)}</div></td>
                    <td className="py-2 text-right mono font-bold text-foreground">{num(j.compradores)}</td>
                    <td className="py-2 text-right mono">{num(j.ingressos)}</td>
                    <td className="py-2 text-right mono">{j.media_por_comprador ?? '—'}</td>
                    <td className="py-2 text-right mono">{num(j.compradores_multiplos)}<div className="text-muted-foreground">{num(j.ingressos_de_multiplos)} ingressos</div></td>
                    <td className="py-2 text-right mono">{num(j.sem_participante)}</td>
                    <td className="py-2 text-right mono">{num(j.presentes)}{j.ingressos > 0 && <div className="text-muted-foreground">{((100 * j.presentes) / j.ingressos).toFixed(0)}%</div>}</td>
                    <td className="py-2 text-right mono">{num(j.compradores_presentes)}{j.compradores > 0 && <div className="text-muted-foreground">{((100 * j.compradores_presentes) / j.compradores).toFixed(0)}% dos compradores</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-3">Comprador = e-mail que fez a compra; participante = cada e-ticket, com o nome de quem vai ao evento. Um comprador pode ter vários participantes. Cancelados ficam de fora. "Sem participante" são ingressos ainda não nomeados.</p>
          </section>
        )}
      </main>
    </div>
  );
}
