import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { ROTA, mesmoEvento } from './rota';
import { META, brl, num } from './DashboardRota';
import { usePlanoRota } from './plano';

interface EventoRota { id: number; cidade: string; mes_evento: string; data_evento: string | null; local?: string | null; observacao?: string | null }

const campo = 'bg-secondary rounded px-2 py-1.5 text-foreground text-sm w-full';
const CAMPOS: { k: string; rotulo: string; dica?: string }[] = [
  { k: 'investimento', rotulo: 'Investimento por cidade (R$)' }, { k: 'vendas', rotulo: 'Ingressos pagos por cidade' }, { k: 'cortesias', rotulo: 'Cortesias por cidade' },
  { k: 'total_partic', rotulo: 'Total de participantes (meta de ingressos)' }, { k: 'capacidade', rotulo: 'Capacidade (cadeiras)' }, { k: 'ticket', rotulo: 'Ticket médio (R$)' },
  { k: 'cac', rotulo: 'CAC (R$)' }, { k: 'cac_qualif', rotulo: 'CAC qualificado (R$)' }, { k: 'qualif', rotulo: 'Qualificação dos compradores (%)' },
  { k: 'cpm', rotulo: 'CPM (R$)' }, { k: 'ctr', rotulo: 'CTR (%)' },
];

/** Cadastro do planejamento da rota: metas por cidade que valem para os cards, tabelas e Meta Global, com opção de replicar nos eventos. */
export default function PlanoRotaForm() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const { plano } = usePlanoRota();
  const [v, setV] = useState<Record<string, string>>({});
  const [replicar, setReplicar] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const eventos = useQuery({ queryKey: ['plano-eventos'], queryFn: () => r1Rpc<EventoRota[]>('eventos_listar', { p_de: '2026-01-01', p_ate: '2026-12-01' }) });

  useEffect(() => {
    const base: Record<string, number | null | undefined> = { investimento: META.investimento, vendas: META.vendas, cortesias: META.cortesias, total_partic: META.totalPartic, capacidade: META.capacidade,
      ticket: META.ticket, cac: META.cac, cac_qualif: META.cacQualif, qualif: META.qualif, cpm: META.cpm, ctr: META.ctr };
    setV(Object.fromEntries(CAMPOS.map((c) => [c.k, String(base[c.k] ?? '')])));
  }, [plano]);

  const salvar = useMutation({
    mutationFn: async () => {
      setMsg(null);
      const metas = Object.fromEntries(CAMPOS.map((c) => [c.k, v[c.k]?.trim() === '' ? null : Number(v[c.k])]));
      if (Object.values(metas).some((x) => x != null && Number.isNaN(x))) throw new Error('Há campo com valor que não é número.');
      await r1Rpc('planejamento_salvar', { p_rota: ROTA.nome, p_metas: metas });
      if (!replicar) return 'Metas da rota salvas.';
      let ok = 0; let criados = 0;
      for (const c of ROTA.cidades) {
        const mes = `${c.data.slice(0, 7)}-01`;
        let ev = (eventos.data ?? []).find((e) => mesmoEvento(e, c));
        if (!ev) {
          const novo = await r1Rpc<{ id: number }>('evento_criar', { p_linha: 'MÁQUINA DE VENDAS PRESENCIAL', p_cidade: c.cidade, p_mes_evento: mes, p_data_evento: c.data, p_capacidade: metas.capacidade, p_meta_ingressos: metas.total_partic });
          ev = { id: novo.id, cidade: c.cidade, mes_evento: mes, data_evento: c.data }; criados++;
        }
        await r1Rpc('evento_salvar', { p_id: ev.id, p_data_evento: ev.data_evento ?? c.data, p_local: ev.local ?? null, p_capacidade: metas.capacidade, p_meta_ingressos: metas.total_partic,
          p_meta_faturamento: metas.vendas != null && metas.ticket != null ? metas.vendas * metas.ticket : null, p_observacao: ev.observacao ?? null, p_ativo: true });
        ok++;
      }
      return `Metas salvas e replicadas em ${ok} eventos da ${ROTA.nome}${criados ? ` (${criados} criados)` : ''}.`;
    },
    onSuccess: (m) => { setMsg(m); for (const k of ['planejamento-rotas', 'plano-eventos', 'mv-eventos', 'mv-eventos-hist', 'eventos']) qc.invalidateQueries({ queryKey: [k] }); },
    onError: (e: Error) => setMsg(`Não salvou: ${e.message}`),
  });

  const pend = Number(v.vendas) * Number(v.ticket);
  return (
    <section className="surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="section-label">Planejamento da rota · metas por cidade · {ROTA.nome}</span>
        <span className="text-[10px] text-muted-foreground">{plano ? 'Metas cadastradas' : 'Ainda sem cadastro: valem os padrões abaixo'} · {ROTA.cidades.length} cidades</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CAMPOS.map((c) => (
          <label key={c.k} className="text-[11px] text-muted-foreground">{c.rotulo}
            <input className={`${campo} mt-1`} inputMode="decimal" value={v[c.k] ?? ''} disabled={!pode('gerenciador')} onChange={(e) => setV((x) => ({ ...x, [c.k]: e.target.value }))} />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">Receita por cidade = ingressos × ticket = {Number.isFinite(pend) ? brl(pend) : '—'} · na rota inteira: {brl((Number(v.investimento) || 0) * ROTA.cidades.length)} de investimento e {num((Number(v.total_partic) || 0) * ROTA.cidades.length)} participantes.</p>
      {pode('gerenciador') ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={replicar} onChange={(e) => setReplicar(e.target.checked)} />Replicar capacidade, meta de ingressos e meta de faturamento nos eventos da rota</label>
          <button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60">{salvar.isPending ? 'Salvando…' : 'Salvar planejamento'}</button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>
      ) : <p className="text-[11px] text-muted-foreground mt-3">Só administrador e gestor podem alterar as metas.</p>}
    </section>
  );
}
