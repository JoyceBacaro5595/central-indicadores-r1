interface ReceitaKitProps {
  faturamento?: number;
  vendas?: number;
  ticketMedio?: number;
  meta?: number;
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

export function ReceitaKit({ faturamento, vendas, ticketMedio, meta = 43071 }: ReceitaKitProps) {
  const receita = faturamento ?? 0;
  const pct = meta > 0 ? (receita / meta) * 100 : 0;

  return (
    <div className="surface px-5 py-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="section-label">Receita do Kit</span>
          <p className="text-[10px] text-muted-foreground mt-1">
            SOS: O Fim das Empresas — Gravação e Material
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-secondary text-foreground">
          META {brl(meta)}
        </span>
      </div>

      <div className="mt-4 flex items-end gap-6">
        <div>
          <p className="text-2xl font-extrabold text-foreground leading-none">{brl(receita)}</p>
          <p className="text-[10px] text-muted-foreground mt-1 font-medium">
            {pct.toFixed(0)}% da meta
          </p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground leading-none">{vendas ?? 0}</p>
          <p className="text-[10px] text-muted-foreground mt-1 font-medium">kits vendidos</p>
        </div>
      </div>

      <div className="mt-4 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
