import { useMemo, useState } from 'react';
import { presets } from '@/lib/periodos';

/* FILTRO DE PERÍODO PADRÃO (Joyce, 19/10: "em todas as abas, igual ao do Perpétuo RGV · Fluxo Marketing RGV; nunca mais mude").
 * É o mesmo controle do Fluxo Marketing RGV: menu de períodos prontos (Personalizado, Hoje, Ontem, 2026 até hoje, Últimos N dias, mês...)
 * e, em "Personalizado", os campos De e Até. Toda tela de período deve usar este componente; não criar outro formato. */

export type CicloOpcao = { ciclo: string; inicio?: string; fim?: string };
const curta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function FiltroPeriodoPadrao({ preset, de, ate, onPreset, onCustom, ciclos }: {
  preset: string; de: string; ate: string;
  onPreset: (chave: string) => void; onCustom: (de: string, ate: string) => void;
  /** Só o Fluxo Marketing RGV tem ciclos. */
  ciclos?: CicloOpcao[];
}) {
  const lista = useMemo(presets, []);
  return (
    <>
      <select aria-label="Período" value={preset} onChange={(e) => onPreset(e.target.value)} className="select-r1">
        <option value="custom">Personalizado</option>
        {lista.map((p) => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}
        {ciclos && ciclos.length > 0 && (
          <optgroup label="Ciclos">
            {ciclos.map((c) => <option key={c.ciclo} value={c.ciclo}>{c.ciclo}{c.inicio && c.fim ? ` · ${curta(c.inicio)} a ${curta(c.fim)}` : ''}</option>)}
          </optgroup>
        )}
      </select>
      {preset === 'custom' && <>
        <label className="text-[11px] text-muted-foreground flex items-center gap-1">De <input type="date" value={de} max={ate || undefined} onChange={(e) => { const v = e.target.value; if (v) onCustom(v, v > ate ? v : ate); }} className="bg-secondary rounded px-2 py-1 text-xs text-foreground" /></label>
        <label className="text-[11px] text-muted-foreground flex items-center gap-1">Até <input type="date" value={ate} min={de || undefined} onChange={(e) => { const v = e.target.value; if (v) onCustom(v < de ? v : de, v); }} className="bg-secondary rounded px-2 py-1 text-xs text-foreground" /></label>
      </>}
    </>
  );
}

/** Estado do filtro padrão. `eventos`: telas por mês do evento incluem os eventos futuros do ano em "ano" e "todos". */
export function usePeriodoPadrao(chaveInicial = '30', opts?: { eventos?: boolean }) {
  const lista = useMemo(presets, []);
  const ini = lista.find((p) => p.chave === chaveInicial) ?? lista[0];
  const [preset, setPreset] = useState(ini.chave);
  const [de, setDe] = useState(ini.de);
  const [ate, setAte] = useState(ini.ate);
  const aplicar = (chave: string) => {
    setPreset(chave);
    const p = lista.find((x) => x.chave === chave);
    if (p) { setDe(p.de); setAte(p.ate); }
  };
  const personalizar = (a: string, b: string) => { setPreset('custom'); setDe(a); setAte(b); };
  const fimAno = `${ate.slice(0, 4)}-12-31`;
  const ateConsulta = opts?.eventos && (preset === 'ano' || preset === 'todos') ? fimAno : ate;
  return { preset, de, ate, ateConsulta, aplicar, personalizar };
}

/** Atalho: o filtro já ligado ao estado de `usePeriodoPadrao`. */
export function PeriodoPadrao({ p }: { p: ReturnType<typeof usePeriodoPadrao> }) {
  return <FiltroPeriodoPadrao preset={p.preset} de={p.de} ate={p.ate} onPreset={p.aplicar} onCustom={p.personalizar} />;
}
