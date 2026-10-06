import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingBarProps {
  fetching: boolean;
  loaded: number;
  total: number;
}

export function LoadingBar({ fetching, loaded, total }: LoadingBarProps) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!fetching) {
      setPct(loaded >= total && total > 0 ? 100 : 0);
      return;
    }
    setPct(0);
    const id = setInterval(() => {
      setPct((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 8)) : p));
    }, 250);
    return () => clearInterval(id);
  }, [fetching, loaded, total]);

  if (!fetching) return null;

  const fontesLabel = `${loaded} de ${total} fontes carregadas · aguarde 100% para dados completos`;

  return (
    <div
      className="surface px-5 py-4"
      style={{ borderColor: 'hsl(var(--primary) / 0.25)' }}
    >
      <div className="flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">
            Carregando dados do dashboard
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{fontesLabel}</p>
        </div>
        <span className="text-sm font-bold text-primary tabular-nums">{pct}%</span>
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
