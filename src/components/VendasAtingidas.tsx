import { CheckCircle2 } from 'lucide-react';

const META_VENDAS = 500;
const EVENTO = new Date(2026, 8, 21);

function diasRestantes() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diff = Math.ceil((EVENTO.getTime() - inicio.getTime()) / 86400000);
  return Math.max(diff, 0);
}

interface Props {
  vendidos?: number;
  diasRodando?: number;
  /** Estado atual da campanha. 'parada' tem prioridade sobre as demais. */
  statusCampanha?: 'vendendo' | 'parada' | 'aguardando';
}

export function VendasAtingidas({ vendidos: vendidosProp, diasRodando = 0, statusCampanha }: Props) {
  const dias = diasRestantes();
  const vendidos = vendidosProp ?? null;
  const pct = vendidos != null ? (vendidos / META_VENDAS) * 100 : null;
  const saldo = vendidos != null ? Math.max(META_VENDAS - vendidos, 0) : META_VENDAS;
  const media = vendidos != null && diasRodando > 0 ? vendidos / diasRodando : null;
  const necessarioDia = dias > 0 ? saldo / dias : saldo;

  const status =
    statusCampanha === 'parada'
      ? { texto: 'Campanha parada', classe: 'text-amber-500' }
      : statusCampanha === 'vendendo' || (vendidos != null && vendidos > 0)
      ? { texto: 'Vendendo', classe: 'text-foreground' }
      : { texto: 'Aguardando', classe: 'text-muted-foreground' };

  return (
    <div className="surface px-5 py-4 border-emerald-500/40">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-500">
            Vendas atingidas
          </span>
        </div>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {dias}d restantes · Evento 21/09
        </span>
      </div>

      <div className="mt-4 flex items-end gap-4 flex-wrap">
        <div>
          <p className="text-3xl font-extrabold mono tracking-tight text-foreground">
            {vendidos != null ? `${vendidos} / ${META_VENDAS}` : '— / 500'}
          </p>
          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
            {vendidos != null
              ? `${pct?.toFixed(1)}% da meta · ${vendidos} de ${META_VENDAS}`
              : `Meta de ${META_VENDAS} ingressos vendidos`}
          </p>
        </div>
      </div>

      {/* barra de progresso */}
      <div className="mt-4">
        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct != null ? Math.min(pct, 100) : 0}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
          <span>{pct != null ? `${pct.toFixed(1)}% da meta` : '0% da meta'}</span>
          <span>Meta {META_VENDAS} ingressos</span>
        </div>
      </div>

      {/* mini métricas */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-border pt-3">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Necessário/dia</div>
          <div className="text-sm font-bold mono text-foreground mt-1">{Math.ceil(necessarioDia)}</div>
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Saldo</div>
          <div className="text-sm font-bold mono text-foreground mt-1">{saldo}</div>
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Média/dia</div>
          <div className="text-sm font-bold mono text-foreground mt-1">
            {media != null ? media.toFixed(1) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status</div>
          <div className={`text-sm font-bold mono mt-1 ${status.classe}`}>
            {status.texto}
          </div>
        </div>
      </div>
    </div>
  );
}
