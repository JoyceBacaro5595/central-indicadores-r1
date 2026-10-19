import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { ROTA, mesmoEvento } from './rota';
import { META, brl, num } from './DashboardRota';
import { type PlanoRota } from './plano';

interface EventoRota { id: number; cidade: string; mes_evento: string; data_evento: string | null; local?: string | null; observacao?: string | null }
type Cid = { cidade: string; data: string; inicio: string };

const campo = 'bg-secondary rounded px-2 py-1.5 text-foreground text-sm w-full';
/* Campos do cadastro, na ordem do funil: do resultado final (ingressos) para trás até a verba. */
const GRUPOS: { titulo: string; campos: { k: string; rotulo: string; padrao: number | null }[] }[] = [
  { titulo: 'Resultado do evento', campos: [
    { k: 'vendas', rotulo: 'Ingressos pagos por cidade', padrao: META.vendas }, { k: 'cortesias', rotulo: 'Cortesias por cidade', padrao: META.cortesias },
    { k: 'total_partic', rotulo: 'Meta de participantes por cidade', padrao: META.totalPartic }, { k: 'capacidade', rotulo: 'Capacidade (cadeiras)', padrao: META.capacidade },
    { k: 'ticket', rotulo: 'Ticket médio (R$)', padrao: META.ticket } ] },
  { titulo: 'Custo de aquisição', campos: [
    { k: 'cac', rotulo: 'CAC / CPA do ingresso (R$)', padrao: META.cac }, { k: 'cac_qualif', rotulo: 'CAC qualificado (R$)', padrao: META.cacQualif },
    { k: 'qualif', rotulo: 'Qualificação dos compradores (%)', padrao: META.qualif }, { k: 'investimento', rotulo: 'Investimento por cidade (R$)', padrao: META.investimento } ] },
  { titulo: 'Funil de tráfego (taxas)', campos: [
    { k: 'conv_checkout', rotulo: 'Conversão do checkout (%)', padrao: 40 }, { k: 'conv_pagina', rotulo: 'Conversão da página (%)', padrao: 2.4 },
    { k: 'connect', rotulo: 'Connect rate (%)', padrao: 75 }, { k: 'ctr', rotulo: 'CTR (%)', padrao: META.ctr }, { k: 'cpm', rotulo: 'CPM (R$)', padrao: META.cpm } ] },
  { titulo: 'Prazos', campos: [
    { k: 'dias_captacao', rotulo: 'Dias de captação antes do evento (E-)', padrao: 45 }, { k: 'dias_producao', rotulo: 'Dias de produção antes do evento (E-)', padrao: 52 } ] },
];
const TODOS = GRUPOS.flatMap((g) => g.campos);
const ROTULO: Record<string, string> = { ...Object.fromEntries(TODOS.map((c) => [c.k, c.rotulo])), cidades: 'Cidades da rota' };
interface Auditoria { rota: string; em: string; quem: string | null; campo: string; antes: unknown; depois: unknown }
const fmtVal = (campo: string, x: unknown) => {
  if (x == null) return '—';
  if (campo === 'cidades' && Array.isArray(x)) return `${x.length} cidades: ${x.map((c: { cidade: string; data: string }) => `${c.cidade} (${c.data.slice(8)}/${c.data.slice(5, 7)})`).join(', ')}`;
  return String(x);
};
const dMais = (iso: string, d: number) => new Date(new Date(`${iso}T00:00:00`).getTime() - d * 86400000).toISOString().slice(0, 10);

/** Cadastro do planejamento de uma rota: cidades, metas e funil reverso. As metas valem para cards, tabelas e Meta Global e podem ser replicadas nos eventos. */
export default function PlanoRotaForm() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const planos = useQuery({ queryKey: ['planejamento-rotas'], queryFn: () => r1Rpc<PlanoRota[]>('planejamento_rotas'), retry: false, staleTime: 5 * 60_000, refetchInterval: 60_000 });
  const eventos = useQuery({ queryKey: ['plano-eventos'], queryFn: () => r1Rpc<EventoRota[]>('eventos_listar', { p_de: '2026-01-01', p_ate: '2027-12-01' }), refetchInterval: 60_000 });
  const auditoria = useQuery({ queryKey: ['planejamento-auditoria'], queryFn: () => r1Rpc<Auditoria[]>('planejamento_historico', { p_rota: null }), retry: false, refetchInterval: 60_000 });
  const rotas = useMemo(() => Array.from(new Set([ROTA.nome, ...(planos.data ?? []).map((p) => p.rota)])), [planos.data]);
  const [busca] = useSearchParams();
  const destaque = (busca.get('cidade') ?? '').toLowerCase();
  const [rota, setRota] = useState(ROTA.nome);
  const [nome, setNome] = useState(ROTA.nome);
  const [v, setV] = useState<Record<string, string>>({});
  const [cids, setCids] = useState<Cid[]>([]);
  const [replicar, setReplicar] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const plano = (planos.data ?? []).find((p) => p.rota === rota) ?? null;

  useEffect(() => {
    const salvo = plano as unknown as Record<string, number | null> | null;
    setNome(rota === '__nova' ? '' : rota);
    setV(Object.fromEntries(TODOS.map((c) => [c.k, String(salvo?.[c.k] ?? (rota === ROTA.nome || !salvo ? c.padrao : '') ?? '')])));
    setCids(plano?.cidades?.length ? plano.cidades.map((c) => ({ cidade: c.cidade, data: c.data, inicio: c.inicio ?? '' }))
      : rota === ROTA.nome ? ROTA.cidades.map((c) => ({ cidade: c.cidade, data: c.data, inicio: c.inicio })) : []);
    setMsg(null);
  }, [rota, plano]);

  const n = (k: string) => (v[k]?.trim() ? Number(v[k]) : null);
  const total = cids.length;
  /* Engenharia reversa: da meta de ingressos pagos até a verba, com as taxas cadastradas. */
  const funil = useMemo(() => {
    const vendas = n('vendas'); const cc = n('conv_checkout'); const cp = n('conv_pagina'); const cn = n('connect'); const ctr = n('ctr'); const cpm = n('cpm'); const cac = n('cac'); const inv = n('investimento');
    const checkouts = vendas != null && cc ? vendas / (cc / 100) : null;
    const visitas = checkouts != null && cp ? checkouts / (cp / 100) : null;
    const cliques = visitas != null && cn ? visitas / (cn / 100) : null;
    const impressoes = cliques != null && ctr ? cliques / (ctr / 100) : null;
    return { vendas, checkouts, visitas, cliques, impressoes, verbaFunil: impressoes != null && cpm != null ? (impressoes / 1000) * cpm : null, verbaCac: vendas != null && cac != null ? vendas * cac : null, inv,
      cpc: cliques && impressoes != null && cpm != null ? ((impressoes / 1000) * cpm) / cliques : null };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  const salvar = useMutation({
    mutationFn: async () => {
      setMsg(null);
      if (!nome.trim()) throw new Error('Informe o nome da rota.');
      const metas: Record<string, unknown> = Object.fromEntries(TODOS.map((c) => [c.k, v[c.k]?.trim() === '' ? null : Number(v[c.k])]));
      if (Object.values(metas).some((x) => x != null && Number.isNaN(x))) throw new Error('Há campo com valor que não é número.');
      const lista = cids.filter((c) => c.cidade.trim() && c.data);
      metas.cidades = lista.map((c) => ({ cidade: c.cidade.trim(), data: c.data, inicio: c.inicio || dMais(c.data, Number(metas.dias_captacao ?? 45)) }));
      await r1Rpc('planejamento_salvar', { p_rota: nome.trim(), p_metas: metas });
      if (!replicar) return 'Planejamento da rota salvo.';
      let ok = 0; let criados = 0;
      for (const c of lista) {
        const mes = `${c.data.slice(0, 7)}-01`;
        let ev = (eventos.data ?? []).find((e) => mesmoEvento(e, c));
        if (!ev) {
          const novo = await r1Rpc<{ id: number }>('evento_criar', { p_linha: 'MÁQUINA DE VENDAS PRESENCIAL', p_cidade: c.cidade.trim(), p_mes_evento: mes, p_data_evento: c.data, p_capacidade: metas.capacidade, p_meta_ingressos: metas.total_partic });
          ev = { id: novo.id, cidade: c.cidade, mes_evento: mes, data_evento: c.data }; criados++;
        }
        const vd = metas.vendas as number | null; const tk = metas.ticket as number | null;
        await r1Rpc('evento_salvar', { p_id: ev.id, p_data_evento: ev.data_evento ?? c.data, p_local: ev.local ?? null, p_capacidade: metas.capacidade, p_meta_ingressos: metas.total_partic,
          p_meta_faturamento: vd != null && tk != null ? vd * tk : null, p_observacao: ev.observacao ?? null, p_ativo: true });
        ok++;
      }
      return `Planejamento salvo e replicado em ${ok} eventos${criados ? ` (${criados} criados)` : ''}.`;
    },
    onSuccess: (m) => { toast.success('Salvo com sucesso'); setMsg(m); setRota(nome.trim()); for (const k of ['planejamento-rotas', 'planejamento-auditoria', 'plano-eventos', 'mv-eventos', 'mv-eventos-hist', 'eventos']) qc.invalidateQueries({ queryKey: [k] }); },
    onError: (e: Error) => setMsg(`Não salvou: ${e.message}`),
  });

  const editar = pode('gerenciador');
  const setCid = (i: number, p: Partial<Cid>) => setCids((l) => l.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const Linha = ({ r, val, nota }: { r: string; val: string; nota?: string }) => <tr className="border-t border-border/50"><td className="py-1.5 pr-3">{r}</td><td className="pr-3 mono text-foreground">{val}</td><td className="text-[10px] text-muted-foreground">{nota}</td></tr>;
  return (
    <section className="surface px-5 py-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <span className="section-label">Planejamento da rota · cadastro de metas</span>
        <div className="flex items-end gap-2">
          <label className="text-[11px] text-muted-foreground">Rota
            <select className={`${campo} mt-1`} value={rota} onChange={(e) => setRota(e.target.value)}>
              {rotas.map((r) => <option key={r} value={r}>{r}</option>)}{editar && <option value="__nova">+ Nova rota</option>}
            </select>
          </label>
          <label className="text-[11px] text-muted-foreground">Nome
            <input className={`${campo} mt-1`} value={nome} placeholder="Ex.: Rota 46" disabled={!editar} onChange={(e) => setNome(e.target.value)} />
          </label>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">{plano ? 'Rota com metas cadastradas.' : 'Rota ainda sem cadastro: valem os padrões do código.'} Metas valem por cidade. Os cards e o Meta Global usam a rota em andamento ({ROTA.nome}).</p>

      {GRUPOS.map((g) => (
        <div key={g.titulo}>
          <div className="text-xs font-semibold text-foreground">{g.titulo}</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {g.campos.map((c) => (
              <label key={c.k} className="text-[11px] text-muted-foreground">{c.rotulo}
                <input className={`${campo} mt-1`} inputMode="decimal" value={v[c.k] ?? ''} disabled={!editar} onChange={(e) => setV((x) => ({ ...x, [c.k]: e.target.value }))} />
              </label>
            ))}
          </div>
        </div>
      ))}

      <div>
        <div className="text-xs font-semibold text-foreground">Cidades da rota ({total})</div>
        <div className="mt-2 space-y-1.5">
          {cids.map((c, i) => (
            <div key={i} ref={(el) => { if (el && destaque && c.cidade.toLowerCase() === destaque) el.scrollIntoView({ block: 'center' }); }} className={`grid grid-cols-[1fr_9rem_9rem_auto] gap-2 items-center rounded-lg ${destaque && c.cidade.toLowerCase() === destaque ? 'ring-2 ring-primary p-1' : ''}`}>
              <input className={campo} placeholder="Cidade" value={c.cidade} disabled={!editar} onChange={(e) => setCid(i, { cidade: e.target.value })} />
              <input className={campo} type="date" title="Data do evento" value={c.data} disabled={!editar} onChange={(e) => setCid(i, { data: e.target.value })} />
              <input className={campo} type="date" title="Início da captação (vazio = data menos os dias de captação)" value={c.inicio} disabled={!editar} onChange={(e) => setCid(i, { inicio: e.target.value })} />
              {editar && <button type="button" className="text-xs text-red-400" onClick={() => setCids((l) => l.filter((_, j) => j !== i))}>remover</button>}
            </div>
          ))}
          {editar && <button type="button" className="text-xs text-primary" onClick={() => setCids((l) => [...l, { cidade: '', data: '', inicio: '' }])}>+ adicionar cidade</button>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="text-xs font-semibold text-foreground">Funil necessário por cidade (engenharia reversa das metas)</div>
        <table className="w-full text-xs mt-2"><tbody>
          <Linha r="Ingressos pagos" val={num(funil.vendas)} />
          <Linha r="Checkouts necessários" val={num(funil.checkouts == null ? null : Math.ceil(funil.checkouts))} nota="ingressos ÷ conversão do checkout" />
          <Linha r="Visitas na página" val={num(funil.visitas == null ? null : Math.ceil(funil.visitas))} nota="checkouts ÷ conversão da página" />
          <Linha r="Cliques no link" val={num(funil.cliques == null ? null : Math.ceil(funil.cliques))} nota="visitas ÷ connect rate" />
          <Linha r="Impressões" val={num(funil.impressoes == null ? null : Math.ceil(funil.impressoes))} nota="cliques ÷ CTR" />
          <Linha r="Verba pelo funil" val={brl(funil.verbaFunil)} nota="impressões × CPM" />
          <Linha r="Verba pelo CAC" val={brl(funil.verbaCac)} nota="ingressos × CAC" />
          <Linha r="Investimento cadastrado" val={brl(funil.inv)} nota={funil.verbaFunil != null && funil.inv != null && Math.abs(funil.verbaFunil - funil.inv) / funil.inv > 0.1 ? 'não bate com a verba pelo funil: revise as taxas' : undefined} />
          <Linha r="CPC implícito" val={brl(funil.cpc)} />
          <Linha r="Receita da cidade" val={brl(n('vendas') != null && n('ticket') != null ? n('vendas')! * n('ticket')! : null)} nota="ingressos × ticket" />
          <Linha r="Vendas por dia de captação" val={n('vendas') != null && n('dias_captacao') ? (n('vendas')! / n('dias_captacao')!).toFixed(1) : '—'} nota="ritmo mínimo para bater a meta" />
        </tbody></table>
        <p className="text-[11px] text-muted-foreground mt-2">Na rota inteira ({total} cidades): {brl((n('investimento') ?? 0) * total)} de investimento, {num((n('vendas') ?? 0) * total)} ingressos pagos, {brl((n('vendas') ?? 0) * (n('ticket') ?? 0) * total)} de receita de ingressos.</p>
      </div>

      {editar ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={replicar} onChange={(e) => setReplicar(e.target.checked)} />Replicar capacidade, meta de ingressos e meta de faturamento nos eventos da rota (cria os que faltam)</label>
          <button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60">{salvar.isPending ? 'Salvando…' : 'Salvar planejamento'}</button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>
      ) : <p className="text-[11px] text-muted-foreground">Só administrador e gestor podem alterar as metas.</p>}

      <div className="overflow-x-auto">
        <div className="text-xs font-semibold text-foreground">Auditoria do planejamento · o que mudou e quem alterou</div>
        <table className="w-full text-xs mt-2">
          <thead><tr className="text-left text-muted-foreground uppercase text-[10px]"><th className="py-1.5 pr-3">Quando</th><th className="pr-3">Quem</th><th className="pr-3">Rota</th><th className="pr-3">Campo</th><th className="pr-3">Antes</th><th>Depois</th></tr></thead>
          <tbody>
            {(auditoria.data ?? []).map((a, i) => (
              <tr key={i} className="border-t border-border/50 align-top">
                <td className="py-1.5 pr-3 mono whitespace-nowrap">{new Date(a.em).toLocaleString('pt-BR')}</td><td className="pr-3">{a.quem ?? '—'}</td><td className="pr-3">{a.rota}</td>
                <td className="pr-3">{ROTULO[a.campo] ?? a.campo}</td><td className="pr-3 text-muted-foreground">{fmtVal(a.campo, a.antes)}</td><td className="text-foreground">{fmtVal(a.campo, a.depois)}</td>
              </tr>
            ))}
            {!auditoria.data?.length && <tr><td colSpan={6} className="py-2 text-muted-foreground">{auditoria.isError ? 'Auditoria indisponível até o banco receber a tabela do planejamento.' : 'Nenhuma alteração registrada ainda.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
