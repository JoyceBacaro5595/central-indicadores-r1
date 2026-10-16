import { useState } from 'react';
import { CAT_AGENDA, type EventoAgenda } from '../visao-geral/agenda';

export type EventoEditavel = EventoAgenda & { id?: number };
export interface RascunhoEvento { id: number | null; cat: string; titulo: string; local: string; hora: string; inicio: string; fim: string }

const campo = 'bg-secondary rounded-md px-2 py-1.5 text-xs text-foreground w-full';
export const novoRascunho = (dia: string, e?: EventoEditavel): RascunhoEvento =>
  e ? { id: e.id ?? null, cat: e.cat, titulo: e.titulo, local: e.local || '', hora: e.hora || '', inicio: e.inicio, fim: e.fim || e.inicio }
    : { id: null, cat: 'outros', titulo: '', local: '', hora: '', inicio: dia, fim: dia };

/** Formulário de evento da agenda (criar e editar). Início e fim sempre válidos: o fim nunca fica antes do início. */
export default function EditorEvento({ valor, salvando, erro, onSalvar, onCancelar }: {
  valor: RascunhoEvento; salvando: boolean; erro: string | null; onSalvar: (v: RascunhoEvento) => void; onCancelar: () => void;
}) {
  const [v, setV] = useState(valor);
  const set = (p: Partial<RascunhoEvento>) => setV((x) => ({ ...x, ...p }));
  const ok = v.titulo.trim() !== '' && v.inicio !== '' && v.fim >= v.inicio;
  return (
    <form className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (ok) onSalvar(v); }}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <label className="text-[10px] text-muted-foreground md:col-span-2">Título
          <input className={`${campo} mt-1`} value={v.titulo} onChange={(e) => set({ titulo: e.target.value })} required />
        </label>
        <label className="text-[10px] text-muted-foreground">Produto
          <select className={`${campo} mt-1`} value={v.cat} onChange={(e) => set({ cat: e.target.value })}>
            {Object.entries(CAT_AGENDA).map(([k, [, r]]) => <option key={k} value={k}>{r}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-muted-foreground">Local
          <input className={`${campo} mt-1`} value={v.local} onChange={(e) => set({ local: e.target.value })} />
        </label>
        <label className="text-[10px] text-muted-foreground">Início
          <input type="date" className={`${campo} mt-1`} value={v.inicio} max={v.fim || undefined}
            onChange={(e) => { if (e.target.value) set({ inicio: e.target.value, fim: v.fim < e.target.value ? e.target.value : v.fim }); }} />
        </label>
        <label className="text-[10px] text-muted-foreground">Fim
          <input type="date" className={`${campo} mt-1`} value={v.fim} min={v.inicio || undefined}
            onChange={(e) => { if (e.target.value) set({ fim: e.target.value }); }} />
        </label>
        <label className="text-[10px] text-muted-foreground">Horário (ex.: 19h30)
          <input className={`${campo} mt-1`} value={v.hora} onChange={(e) => set({ hora: e.target.value })} />
        </label>
      </div>
      {erro && <p className="text-xs text-red-400" role="alert">{erro}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!ok || salvando} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar'}</button>
        <button type="button" onClick={onCancelar} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
      </div>
    </form>
  );
}
