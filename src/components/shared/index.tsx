import { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import UserMenu from '@/components/UserMenu';

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
export const ZERO: Record<'num' | 'pct' | 'brl', string> = { num: '0', pct: '0,0%', brl: 'R$ 0' };
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
        <UserMenu />
      </div>
    </header>
  );
}

/** Área de conteúdo com largura e espaçamento padrão. */
export function PageBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`py-6 space-y-6 mx-auto max-w-[1520px] px-4 md:px-8 ${className}`}>{children}</main>;
}

/** Cartão de KPI. `value` nulo mostra o zero do tipo. */
export function KpiCard({ label, value, sub, highlight, motivo, tipo = 'num' }: {
  label: string; value: string | null | undefined; sub?: ReactNode; highlight?: boolean; motivo?: string; tipo?: keyof typeof ZERO;
}) {
  return (
    <div className={highlight ? 'kpi-card-highlight' : 'kpi-card'}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mono"><Valor v={value} motivo={motivo} tipo={tipo} /></div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
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
