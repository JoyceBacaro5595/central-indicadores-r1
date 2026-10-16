import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { useMetaCiclo, type MetaCicloRgv } from '@/hooks/usePerpetuo';
import type { EventoEditavel } from './EditorEvento';

const campo = 'bg-secondary rounded-md px-2 py-1.5 text-xs text-foreground w-full';
const txt = (v: number | null | undefined) => (v == null ? '' : String(v));
const numOuNulo = (v: string) => (v.trim() === '' ? null : Number(v));
const TAXAS: [keyof MetaCicloRgv, string][] = [['conexao', 'Conexão (%)'], ['qualificacao', 'Qualificação (%)'], ['agendamento', 'Agendamento (%)'], ['comparecimento', 'Comparecimento (%)'], ['fechamento', 'Fechamento (%)'], ['mql_venda', 'MQL → venda (%)']];

/** Ciclo do RGV a partir do título da agenda ("Método RGV 44" → "RGV 44"). */
export const cicloDoEvento = (e: EventoEditavel): string | null => { const n = /\bRGV\s*(\d{2,3})\b/i.exec(e.titulo) ?? /(\d{2,3})\s*$/.exec(e.titulo); return n ? `RGV ${n[1]}` : null; };

/** Metas do ciclo do RGV direto na data da agenda. Valem no Fluxo Marketing RGV (régua e cores das taxas). */
export default function MetasCicloRgv({ e }: { e: EventoEditavel }) {
  const qc = useQueryClient();
  const ciclo = cicloDoEvento(e);
  const lista = useMetaCiclo();
  const atual = lista.data?.find((m) => m.ciclo === ciclo);
  const [aberto, setAberto] = useState(false);
  const [v, setV] = useState<Record<string, string>>({});
  const abrir = () => { setV(Object.fromEntries([...TAXAS.map(([k]) => k), 'investimento', 'vendas'].map((k) => [k, txt(atual?.[k as keyof MetaCicloRgv] as number | null | undefined)]))); setAberto(true); };
  const salvar = useMutation({
    mutationFn: () => r1Rpc('meta_ciclo_salvar', { p_ciclo: ciclo, p_metas: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, numOuNulo(x)])) }),
    onSuccess: () => { setAberto(false); qc.invalidateQueries({ queryKey: ['meta-ciclo'] }); qc.invalidateQueries({ queryKey: ['perpetuo-funil-v2'] }); },
  });
  if (!ciclo) return null;
  if (!aberto) return <button type="button" className="text-primary font-semibold text-[11px]" onClick={abrir} title="Metas do ciclo. Valem no Fluxo Marketing RGV.">{atual ? 'metas do ciclo' : 'cadastrar metas do ciclo'}</button>;
  return (
    <form className="basis-full rounded-lg border border-border bg-secondary/30 p-3 space-y-2" onSubmit={(x) => { x.preventDefault(); salvar.mutate(); }}>
      <p className="text-[11px] font-bold text-foreground">Metas do ciclo {ciclo} · vale para tudo do RGV</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {TAXAS.map(([k, r]) => <label key={k} className="text-[10px] text-muted-foreground">{r}<input type="number" min={0} max={100} step="0.1" className={`${campo} mt-1`} value={v[k] ?? ''} onChange={(x) => setV((o) => ({ ...o, [k]: x.target.value }))} /></label>)}
        <label className="text-[10px] text-muted-foreground">Investimento (R$)<input type="number" min={0} step="0.01" className={`${campo} mt-1`} value={v.investimento ?? ''} onChange={(x) => setV((o) => ({ ...o, investimento: x.target.value }))} /></label>
        <label className="text-[10px] text-muted-foreground">Vendas<input type="number" min={0} className={`${campo} mt-1`} value={v.vendas ?? ''} onChange={(x) => setV((o) => ({ ...o, vendas: x.target.value }))} /></label>
      </div>
      {salvar.error && <p className="text-xs text-red-400" role="alert">{(salvar.error as Error).message}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={salvar.isPending} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">{salvar.isPending ? 'Salvando…' : 'Salvar metas'}</button>
        <button type="button" onClick={() => setAberto(false)} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
      </div>
    </form>
  );
}
