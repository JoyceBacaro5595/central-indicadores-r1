import { Filter } from 'lucide-react';

interface Props {
  /** Total investido na campanha */
  investido?: number;
  /** Total de inscritos */
  inscritos?: number;
  /** Inscritos considerados qualificados */
  qualificados?: number;
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function QualificacaoProduto({ investido, inscritos, qualificados }: Props) {
  const temTaxa = inscritos != null && inscritos > 0 && qualificados != null;
  const taxa = temTaxa ? (qualificados! / inscritos!) * 100 : null;
  const custo =
    investido != null && qualificados != null && qualificados > 0 ? investido / qualificados : null;

  return (
    <div className="surface px-5 py-4 border-primary/40">
      <div className="flex items-center gap-2.5">
        <Filter className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
          Taxa de qualificação
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-3xl font-extrabold mono tracking-tight text-foreground">
            {taxa != null ? `${Math.round(taxa)}%` : '—'}
          </p>
          <div className="mt-3 h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${taxa != null ? Math.min(taxa, 100) : 0}%` }}
            />
          </div>
        </div>

        <div className="sm:border-l sm:border-border sm:pl-5">
          <p className="text-3xl font-extrabold mono tracking-tight text-foreground">
            {custo != null ? brl(custo) : '—'}
          </p>
          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
            Custo por qualificado
          </p>
        </div>
      </div>
    </div>
  );
}
