import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { r1Rpc } from '@/integrations/r1/client';

export interface Alerta { id: string; gravidade: 'critico' | 'atencao'; fonte: string; titulo: string; detalhe: string; desde: string | null; acao: string }
interface Resposta { agora: string; alertas: Alerta[] }

/** Alertas de saúde das integrações (só para quem tem o recurso gerenciador); recalcula a cada 5 min. */
export function useAlertas(habilitado: boolean) {
  return useQuery({ queryKey: ['gerenciador-alertas'], queryFn: () => r1Rpc<Resposta>('gerenciador_alertas'), enabled: habilitado, refetchInterval: 300_000, retry: false });
}

const quando = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');

export default function AlertasSaude() {
  const { data, error } = useAlertas(true);
  if (error) return null;
  const alertas = data?.alertas ?? [];
  if (!data) return null;
  if (alertas.length === 0) {
    return <div className="surface p-3 text-xs text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" aria-hidden="true" />Todas as integrações estão dentro do prazo.</div>;
  }
  return (
    <section aria-label="Alertas das integrações" className="surface p-4 space-y-3">
      <span className="section-label">Alertas das integrações ({alertas.length})</span>
      <ul className="space-y-2">
        {alertas.map((a) => (
          <li key={a.id} className={`rounded-lg border p-3 text-xs ${a.gravidade === 'critico' ? 'border-red-500/40 text-red-400' : 'border-amber-500/40 text-amber-400'}`}>
            <p className="font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />{a.titulo}<span className="font-normal text-muted-foreground">· último sucesso: {quando(a.desde)}</span></p>
            <p className="mt-1 text-foreground">{a.detalhe}</p>
            <p className="mt-1 text-muted-foreground">O que fazer: {a.acao}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
