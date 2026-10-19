import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { norm } from '../maquina-vendas/rota';
import type { EventoEditavel } from './EditorEvento';

interface EventoMeta { id: number; cidade: string; mes_evento: string; data_evento: string | null; local: string | null; capacidade: number | null; meta_ingressos: number | null; meta_faturamento: number | null; observacao: string | null }

const campo = 'bg-secondary rounded-md px-2 py-1.5 text-xs text-foreground w-full';
const txt = (v: number | null | undefined) => (v == null ? '' : String(v));
const numOuNulo = (v: string) => (v.trim() === '' ? null : Number(v));
/** Chaves das telas que leem eventos e metas: todas atualizam depois de salvar aqui. */
const LEEM_METAS = (k: unknown) => typeof k === 'string' && (k === 'eventos' || k.startsWith('mv-') || k.startsWith('vg-') || k.startsWith('plano') || k === 'meta-eventos');

/** Metas da Máquina de Vendas direto na data da agenda: capacidade, meta de ingressos e de faturamento do evento daquela cidade.
 *  Grava no mesmo cadastro de Eventos e metas, então vale em Eventos, Máquina de Vendas e Visão geral. */
export default function MetasEventoMdv({ e }: { e: EventoEditavel }) {
  const qc = useQueryClient();
  const cidade = (e.local || e.titulo).replace(/ \(.*\)$/, '').trim();
  const mes = `${e.inicio.slice(0, 7)}-01`;
  const lista = useQuery({ queryKey: ['eventos', mes, mes], queryFn: () => r1Rpc<EventoMeta[]>('eventos_listar', { p_de: mes, p_ate: mes }), retry: false });
  const ev = (lista.data ?? []).find((x) => norm(x.cidade) === norm(cidade) && x.mes_evento === mes);
  const [aberto, setAberto] = useState(false);
  const [cap, setCap] = useState(''); const [ing, setIng] = useState(''); const [fat, setFat] = useState('');
  const abrir = () => { setCap(txt(ev?.capacidade ?? 350)); setIng(txt(ev?.meta_ingressos)); setFat(txt(ev?.meta_faturamento)); setAberto(true); };

  const salvar = useMutation({
    mutationFn: async () => {
      const capacidade = numOuNulo(cap), metaIng = numOuNulo(ing), metaFat = numOuNulo(fat);
      let id = ev?.id;
      if (!ev) {
        const novo = await r1Rpc<{ id: number }>('evento_criar', { p_linha: 'MÁQUINA DE VENDAS PRESENCIAL', p_cidade: cidade, p_mes_evento: mes, p_data_evento: e.inicio, p_capacidade: capacidade, p_meta_ingressos: metaIng });
        id = novo.id;
        if (metaFat == null) return;
      }
      await r1Rpc('evento_salvar', { p_id: id, p_data_evento: ev?.data_evento ?? e.inicio, p_local: ev?.local ?? null, p_capacidade: capacidade, p_meta_ingressos: metaIng, p_meta_faturamento: metaFat, p_observacao: ev?.observacao ?? null, p_ativo: true });
    },
    onSuccess: () => { setAberto(false); toast.success('Salvo com sucesso');  qc.invalidateQueries({ predicate: (q) => LEEM_METAS(q.queryKey[0]) }); },
  });

  if (lista.isLoading) return <span className="text-[11px] text-muted-foreground">metas…</span>;
  if (!aberto) {
    return <button type="button" className="text-primary font-semibold text-[11px]" onClick={abrir}
      title={ev ? 'Capacidade e metas deste evento. Valem em Eventos, Máquina de Vendas e Visão geral.' : 'Cadastrar o evento desta cidade com as metas. Valem em Eventos, Máquina de Vendas e Visão geral.'}>{ev ? 'metas' : 'cadastrar metas'}</button>;
  }
  return (
    <form className="basis-full rounded-lg border border-border bg-secondary/30 p-3 space-y-2" onSubmit={(x) => { x.preventDefault(); salvar.mutate(); }}>
      <p className="text-[11px] font-bold text-foreground">Metas de {cidade} · Turnê MDV · vale para tudo da Máquina de Vendas</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <label className="text-[10px] text-muted-foreground">Capacidade<input type="number" min={0} className={`${campo} mt-1`} value={cap} onChange={(x) => setCap(x.target.value)} /></label>
        <label className="text-[10px] text-muted-foreground">Meta de ingressos<input type="number" min={0} className={`${campo} mt-1`} value={ing} onChange={(x) => setIng(x.target.value)} /></label>
        <label className="text-[10px] text-muted-foreground">Meta de faturamento (R$)<input type="number" min={0} step="0.01" className={`${campo} mt-1`} value={fat} onChange={(x) => setFat(x.target.value)} /></label>
      </div>
      {salvar.error && <p className="text-xs text-red-400" role="alert">{(salvar.error as Error).message}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={salvar.isPending} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">{salvar.isPending ? 'Salvando…' : 'Salvar metas'}</button>
        <button type="button" onClick={() => setAberto(false)} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
      </div>
    </form>
  );
}
