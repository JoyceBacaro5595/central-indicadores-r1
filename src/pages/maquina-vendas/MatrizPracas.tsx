import { useMemo } from 'react';
import type { CidadeIng } from './CidadeCard';

/* Matriz - Praças (pedido da Joyce, 19/10): uma linha por praça do ano, em tempo real (Guru, a cada 5 min).
   Ocupação = ingressos emitidos (vendidos + cortesias) sobre as cadeiras; Ingressos totais = vendidos + cortesias.
   Onde a base não tem o dado aparece "—", nunca zero inventado. */
interface EventoPraca { cidade: string; mes_evento: string; data_evento: string | null; capacidade: number | null; meta_ingressos: number | null }

const PADRAO = { meta: 250, capacidade: 350 };
const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR'));
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pc = (a: number | null, b: number | null) => (a == null || !b ? '—' : `${((100 * a) / b).toFixed(0)}%`);
const dm = (d: string | null) => (d ? d.split('-').reverse().slice(0, 2).join('/') : '');
const nome = (s: string) => String(s).toLowerCase().replace(/(^|\s)(\S)/g, (_a, b, c) => b + c.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos)\b/g, (x) => x.toLowerCase());
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const th = 'px-3 py-2 font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap';

export default function MatrizPracas({ eventos, detalhe, carregando }: { eventos: EventoPraca[]; detalhe: CidadeIng[]; carregando: boolean }) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const linhas = useMemo(() => [...eventos].sort((a, b) => (a.data_evento ?? a.mes_evento).localeCompare(b.data_evento ?? b.mes_evento)).map((e) => {
    const d = detalhe.find((x) => norm(x.cidade) === norm(e.cidade) && x.mes_evento.slice(0, 7) === e.mes_evento.slice(0, 7)) ?? null;
    const cap = e.capacidade ?? PADRAO.capacidade;
    const ocup = d ? d.ingressos : null;
    const vend = d ? d.comuns_pagos + d.vip_pagos : null;
    return { e, d, meta: e.meta_ingressos ?? PADRAO.meta, cap, ocup, disp: ocup == null ? null : Math.max(0, cap - ocup), vend, cort: d ? d.cortesias : null, vip: d ? d.vip_pagos : null, fat: d ? d.faturamento : null, passou: (e.data_evento ?? e.mes_evento) < hoje };
  }).sort((a, b) => Number(a.passou) - Number(b.passou)), [eventos, detalhe, hoje]);
  const T = useMemo(() => linhas.reduce((s, l) => ({ meta: s.meta + l.meta, cap: s.cap + l.cap, ocup: s.ocup + (l.ocup ?? 0), disp: s.disp + (l.disp ?? 0), vend: s.vend + (l.vend ?? 0), cort: s.cort + (l.cort ?? 0), vip: s.vip + (l.vip ?? 0), fat: s.fat + (l.fat ?? 0) }), { meta: 0, cap: 0, ocup: 0, disp: 0, vend: 0, cort: 0, vip: 0, fat: 0 }), [linhas]);

  return (
    <section className="surface p-4 overflow-x-auto">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold text-foreground">Matriz · todas as praças</h2>
        <p className="text-[11px] text-muted-foreground">{linhas.length} praças em 2026 · Guru, atualizada a cada 5 minutos</p>
      </div>
      <table className="w-full text-xs mt-3 min-w-[1100px]">
        <thead>
          <tr className="text-muted-foreground text-right">
            <th className={`${th} text-left`}>Praça</th><th className={th}>Meta</th><th className={th}>Ocupação</th><th className={th}>%</th><th className={th}>Disponíveis</th><th className={th}>Faturamento</th>
            <th className={th}>Ingressos vendidos</th><th className={th}>% vendidos x totais</th><th className={th}>Ingressos cortesias</th><th className={th}>% cortesias x totais</th><th className={th}>Ingressos VIPs</th><th className={th}>% VIPs x totais</th>
          </tr>
        </thead>
        <tbody>
          {carregando && linhas.length === 0 && <tr><td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">Carregando…</td></tr>}
          {!carregando && linhas.length === 0 && <tr><td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">Sem praças no período.</td></tr>}
          {linhas.map((l) => (
            <tr key={`${l.e.cidade}|${l.e.mes_evento}`} className={`border-t border-border/50 text-right mono ${l.passou ? 'text-muted-foreground' : 'text-foreground'}`}>
              <td className="px-3 py-2 text-left font-semibold">{nome(l.e.cidade)}<span className="ml-2 text-[10px] font-normal text-muted-foreground">{dm(l.e.data_evento)}</span></td>
              <td className="px-3 py-2">{num(l.meta)}</td><td className="px-3 py-2">{num(l.ocup)}</td><td className="px-3 py-2">{pc(l.ocup, l.cap)}</td><td className="px-3 py-2">{num(l.disp)}</td><td className="px-3 py-2">{brl(l.fat)}</td>
              <td className="px-3 py-2">{num(l.vend)}</td><td className="px-3 py-2">{pc(l.vend, l.ocup)}</td><td className="px-3 py-2">{num(l.cort)}</td><td className="px-3 py-2">{pc(l.cort, l.ocup)}</td><td className="px-3 py-2">{num(l.vip)}</td><td className="px-3 py-2">{pc(l.vip, l.ocup)}</td>
            </tr>
          ))}
        </tbody>
        {linhas.length > 0 && (
          <tfoot>
            <tr className="border-t border-border text-right mono font-bold text-foreground">
              <td className="px-3 py-2 text-left">Total</td><td className="px-3 py-2">{num(T.meta)}</td><td className="px-3 py-2">{num(T.ocup)}</td><td className="px-3 py-2">{pc(T.ocup, T.cap)}</td><td className="px-3 py-2">{num(T.disp)}</td><td className="px-3 py-2">{brl(T.fat)}</td>
              <td className="px-3 py-2">{num(T.vend)}</td><td className="px-3 py-2">{pc(T.vend, T.ocup)}</td><td className="px-3 py-2">{num(T.cort)}</td><td className="px-3 py-2">{pc(T.cort, T.ocup)}</td><td className="px-3 py-2">{num(T.vip)}</td><td className="px-3 py-2">{pc(T.vip, T.ocup)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}
