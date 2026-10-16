import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import UserMenu from '@/components/UserMenu';
import { presets } from '@/lib/periodos';
import AvisosSino from '@/components/AvisosSino';

/* ─── Componentes visuais compartilhados da Central ─── */

export const fmtBrl = (v: number | null | undefined, casas = 0) =>
  v == null ? null : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: casas, minimumFractionDigits: casas });
export const fmtNum = (v: number | null | undefined) => (v == null ? null : v.toLocaleString('pt-BR'));
export const fmtPct = (v: number | null | undefined, casas = 1) =>
  v == null ? null : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

/** Texto padrão quando a métrica ainda não está conectada ao ETL. */
export function NaoDisponivel({ motivo, className = '' }: { motivo?: string; className?: string }) {
  return (
    <span className={`text-muted-foreground italic ${className}`} title={motivo}>Não disponível</span>
  );
}

/** Indicador sem valor: mostra o zero do tipo (0, 0,0% ou R$ 0) em cinza, com o motivo no tooltip.
 *  Pedido de Joyce (09/10/2026): os indicadores trazem unicamente números, nunca texto. */
export const ZERO: Record<'num' | 'pct' | 'brl', string> = { num: '0', pct: '0,0%', brl: 'R$ 0,00' };
export function Zero({ tipo = 'num', motivo, className = '' }: { tipo?: keyof typeof ZERO; motivo?: string; className?: string }) {
  return <span className={`text-muted-foreground ${className}`} title={motivo}>{ZERO[tipo]}</span>;
}

/** Valor formatado ou zero do tipo (indicadores só com números). */
export function Valor({ v, motivo, tipo = 'num' }: { v: string | null | undefined; motivo?: string; tipo?: keyof typeof ZERO }) {
  return v == null ? <Zero tipo={tipo} motivo={motivo} /> : <>{v}</>;
}

/** Cabeçalho de página: título, subtítulo e ações à direita (sempre com o menu do usuário). */
export function PageHeader({ titulo, subtitulo, acoes, onAtualizar, atualizando }: {
  titulo: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode; onAtualizar?: () => void; atualizando?: boolean;
}) {
  return (
    <header className="dashboard-header print:hidden">
      <div className="min-w-0">
        <h1 className="text-sm font-extrabold text-foreground tracking-wide truncate">{titulo}</h1>
        {subtitulo && <p className="text-[10px] text-muted-foreground font-medium truncate">{subtitulo}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {acoes}
        {onAtualizar && (
          <button onClick={onAtualizar} disabled={atualizando} title="Atualizar"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${atualizando ? 'animate-spin' : ''}`} />
          </button>
        )}
        <AvisosSino />
        <UserMenu />
      </div>
    </header>
  );
}

/** Área de conteúdo com largura e espaçamento padrão. */
export function PageBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`py-6 space-y-6 mx-auto max-w-[1520px] px-4 md:px-8 ${className}`}>{children}</main>;
}

/** Texto de apoio de card: se traz número (ex.: "53% de 5.968") continua visível; se é só descritivo, vira dica ao passar o mouse. */
export const subVisivel = (sub: unknown): boolean => typeof sub !== 'string' || /\d/.test(sub);

/** Cartão de KPI. `value` nulo mostra o zero do tipo. */
export function KpiCard({ label, value, sub, highlight, motivo, tipo = 'num' }: {
  label: string; value: string | null | undefined; sub?: ReactNode; highlight?: boolean; motivo?: string; tipo?: keyof typeof ZERO;
}) {
  return (
    <div className={highlight ? 'kpi-card-highlight' : 'kpi-card'} title={sub && !subVisivel(sub) ? String(sub) : undefined}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mono"><Valor v={value} motivo={motivo} tipo={tipo} /></div>
      {sub && subVisivel(sub) && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 4 | 6 | 8 }) {
  const c = cols === 8 ? 'md:grid-cols-4 lg:grid-cols-8' : cols === 6 ? 'md:grid-cols-3 lg:grid-cols-6' : 'md:grid-cols-4';
  return <div className={`grid grid-cols-2 ${c} gap-2.5`}>{children}</div>;
}

/** Seção com rótulo (surface). */
export function Secao({ titulo, acoes, children, className = '' }: { titulo: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`surface p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="section-label">{titulo}</span>
        {acoes}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export interface Coluna<T> {
  chave: string;
  titulo: string;
  render: (linha: T) => ReactNode;
  alinhar?: 'left' | 'right';
  largura?: string;
}

/** Tabela padrão: primeira coluna à esquerda, numéricas à direita e em mono. */
export function Tabela<T>({ colunas, linhas, chave, vazio = 'Sem dados no período', minWidth }: {
  colunas: Coluna<T>[]; linhas: T[]; chave: (l: T) => string; vazio?: ReactNode; minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr className="text-muted-foreground">
            {colunas.map((c) => (
              <th key={c.chave} className={`pb-2 font-semibold ${c.alinhar === 'left' ? 'text-left' : 'text-right'}`} style={c.largura ? { width: c.largura } : undefined}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && (
            <tr><td colSpan={colunas.length} className="py-3 text-muted-foreground">{vazio}</td></tr>
          )}
          {linhas.map((l) => (
            <tr key={chave(l)} className="border-t border-border">
              {colunas.map((c) => (
                <td key={c.chave} className={`py-1.5 ${c.alinhar === 'left' ? 'text-left' : 'text-right mono'}`}>{c.render(l)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Abas no estilo da Central (pílulas). */
export function Abas<T extends string>({ valor, onChange, itens }: { valor: T; onChange: (v: T) => void; itens: { valor: T; rotulo: string }[] }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-secondary/60 border border-border">
      {itens.map((i) => (
        <button key={i.valor} onClick={() => onChange(i.valor)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${valor === i.valor ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          {i.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Aviso discreto (dados parciais, métrica não conectada etc.). */
export function Aviso({ children }: { children: ReactNode }) {
  return <div className="surface p-3 text-xs text-muted-foreground leading-relaxed">{children}</div>;
}

/* ─── Filtro padrão: escolher 1, vários ou Todos (lista vazia = Todos) ─── */
export interface OpcaoFiltro { valor: string; rotulo: string; cor?: string; contagem?: number }

/** Filtro com seleção múltipla. `valor` vazio significa Todos. Em `chips` as opções ficam visíveis; em `lista` abrem num menu (para listas longas). */
export function FiltroMulti({ rotulo, opcoes, valor, onChange, variante = 'lista' }: {
  rotulo: string; opcoes: OpcaoFiltro[]; valor: string[]; onChange: (v: string[]) => void; variante?: 'lista' | 'chips';
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  const sel = valor.filter((v) => opcoes.some((o) => o.valor === v));
  const alternar = (v: string) => {
    const n = sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v];
    onChange(n.length === opcoes.length ? [] : n);
  };
  const resumo = sel.length === 0 ? 'Todos' : sel.length === 1 ? (opcoes.find((o) => o.valor === sel[0])?.rotulo ?? sel[0]) : `${sel.length} selecionados`;
  const ponto = (c?: string) => c ? <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c }} /> : null;

  if (variante === 'chips') {
    return (
      <div role="group" aria-label={rotulo} className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{rotulo}</span>
        <button type="button" aria-pressed={sel.length === 0} onClick={() => onChange([])}
          className={`rounded-full border px-3 py-1 text-[11px] font-bold ${sel.length === 0 ? 'bg-primary text-primary-foreground border-transparent' : 'border-border text-muted-foreground hover:text-foreground'}`}>Todos</button>
        {opcoes.map((o) => {
          const on = sel.includes(o.valor);
          return (
            <button key={o.valor} type="button" aria-pressed={on} onClick={() => alternar(o.valor)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${on ? 'border-primary bg-secondary text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {ponto(o.cor)}{o.rotulo}{o.contagem != null && <span className="text-muted-foreground">{o.contagem}</span>}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}
        className="inline-flex items-center gap-2 rounded-lg bg-secondary border border-border px-3 py-1.5 text-xs text-foreground hover:border-primary">
        <span className="text-muted-foreground font-semibold">{rotulo}</span>
        <span className="font-bold">{resumo}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {aberto && (
        <div role="listbox" aria-multiselectable="true" aria-label={rotulo} className="absolute z-30 mt-1 min-w-52 max-h-72 overflow-auto rounded-xl border border-border bg-card p-1.5 shadow-xl">
          <label className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-bold hover:bg-secondary cursor-pointer">
            <input type="checkbox" checked={sel.length === 0} onChange={() => onChange([])} /> Todos
          </label>
          {opcoes.map((o) => (
            <label key={o.valor} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-secondary cursor-pointer">
              <input type="checkbox" checked={sel.includes(o.valor)} onChange={() => alternar(o.valor)} />
              {ponto(o.cor)}<span className="truncate">{o.rotulo}</span>
              {o.contagem != null && <span className="ml-auto text-muted-foreground">{o.contagem}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fecha o menu ao clicar fora ou apertar Esc (usado pelos filtros em formato de botão). */
function useMenu() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  return { aberto, setAberto, ref };
}
const BOTAO_FILTRO = 'inline-flex items-center gap-2 rounded-lg bg-secondary border border-border px-3 py-1.5 text-xs text-foreground hover:border-primary';

/** Filtro de escolha única, no mesmo formato do FiltroMulti (ordenação, visão etc.). */
export function FiltroUnico({ rotulo, opcoes, valor, onChange }: {
  rotulo: string; opcoes: { valor: string; rotulo: string }[]; valor: string; onChange: (v: string) => void;
}) {
  const { aberto, setAberto, ref } = useMenu();
  const atual = opcoes.find((o) => o.valor === valor)?.rotulo ?? valor;
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={aberto} onClick={() => setAberto((a) => !a)} className={BOTAO_FILTRO}>
        <span className="text-muted-foreground font-semibold">{rotulo}</span>
        <span className="font-bold">{atual}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {aberto && (
        <div role="listbox" aria-label={rotulo} className="absolute z-30 mt-1 min-w-52 max-h-72 overflow-auto rounded-xl border border-border bg-card p-1.5 shadow-xl">
          {opcoes.map((o) => (
            <button key={o.valor} type="button" role="option" aria-selected={o.valor === valor} onClick={() => { onChange(o.valor); setAberto(false); }}
              className={`w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-secondary ${o.valor === valor ? 'font-bold text-foreground bg-secondary' : 'text-muted-foreground'}`}>{o.rotulo}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_SEM = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const p2 = (n: number) => String(n).padStart(2, '0');
const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const somaDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const fmtMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;

/** Filtro de período no padrão da Central. `modo="mes"` escolhe meses (datas sempre no dia 1) e `modo="dia"` escolhe dias, com atalhos.
 *  Duas escolhas fecham o período: a primeira marca o início, a segunda o fim (se vier antes, as duas se invertem). */
/** Período no modelo oficial (o mesmo da Recuperação de carrinho): menu com atalhos e, em Personalizado, De e Até. No modo mês os atalhos viram meses inteiros. */
export function FiltroPeriodo({ rotulo = 'Período', modo, de, ate, onChange }: {
  rotulo?: string; modo: 'mes' | 'dia'; de: string; ate: string; onChange: (de: string, ate: string) => void; atalhos?: boolean;
}) {
  const diaHoje = hojeSP();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lista = useMemo(presets, [diaHoje]);
  const mes = (d: string) => `${d.slice(0, 7)}-01`;
  const ajusta = (d: string, a: string): [string, string] => (modo === 'mes' ? [mes(d), mes(a)] : [d, a]);
  const achado = lista.find((p) => { const [d, a] = ajusta(p.de, p.ate); return d === de && a === ate; });
  const [custom, setCustom] = useState(false);
  const chave = custom || !achado ? 'custom' : achado.chave;
  const escolher = (c: string) => {
    if (c === 'custom') { setCustom(true); return; }
    const p = lista.find((x) => x.chave === c);
    if (!p) return;
    setCustom(false);
    const [d, a] = ajusta(p.de, p.ate);
    onChange(d, a);
  };
  const campo = 'bg-secondary rounded px-2 py-1 text-xs font-semibold text-foreground';
  const tipo = modo === 'mes' ? 'month' : 'date';
  const v = (d: string) => (modo === 'mes' ? d.slice(0, 7) : d);
  const dado = (x: string) => (modo === 'mes' ? `${x}-01` : x);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={rotulo} title={rotulo} value={chave} onChange={(e) => escolher(e.target.value)} className={campo}>
        <option value="custom">Personalizado</option>
        {lista.map((p) => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}
      </select>
      {chave === 'custom' && (
        <>
          <label className="text-[11px] text-muted-foreground flex items-center gap-1">De <input type={tipo} value={v(de)} max={ate ? v(ate) : undefined} onChange={(e) => e.target.value && onChange(dado(e.target.value), dado(e.target.value) > ate ? dado(e.target.value) : ate)} className={campo} /></label>
          <label className="text-[11px] text-muted-foreground flex items-center gap-1">Até <input type={tipo} value={v(ate)} min={de ? v(de) : undefined} onChange={(e) => e.target.value && onChange(dado(e.target.value) < de ? dado(e.target.value) : de, dado(e.target.value))} className={campo} /></label>
        </>
      )}
    </div>
  );
}
