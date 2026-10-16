import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { r1Rpc } from '@/integrations/r1/client';

export interface Alerta { id: string; gravidade: 'critico' | 'atencao'; fonte: string; titulo: string; detalhe: string; desde: string | null; acao: string }
interface Resposta { agora: string; alertas: Alerta[] }

/** Alertas de saúde das integrações (só para quem tem o recurso gerenciador); recalcula a cada 5 min. */
export function useAlertas(habilitado: boolean) {
  return useQuery({ queryKey: ['gerenciador-alertas'], queryFn: () => r1Rpc<Resposta>('gerenciador_alertas'), enabled: habilitado, refetchInterval: 300_000, retry: false });
}

/** Rotina que refaz a carga de cada alerta (as mesmas de "Executar agora" em Integrações e logs). Alertas de agendamento desligado não têm botão. */
const JOB_POR_ALERTA = (id: string): string | null =>
  id === 'fonte:guru:transaction' ? 'guru-incremental-hourly'
  : id === 'fonte:guru:eticket' ? 'guru-etickets'
  : id.startsWith('fonte:hubspot:') ? 'hubspot-sync'
  : id === 'fonte:meta:ads' ? 'meta-ads-diaria'
  : id === 'base:pedidos' ? 'central-ingressos-refresh'
  : null;

const quando = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');

export default function AlertasSaude() {
  const { data, error, refetch } = useAlertas(true);
  const qc = useQueryClient();
  /* id do alerta → 'rodando' | 'persiste' (rodou e a falha continua) | mensagem de erro */
  const [estado, setEstado] = useState<Record<string, string>>({});
  const recarregar = useMutation({
    mutationFn: async (a: Alerta) => {
      setEstado((e) => ({ ...e, [a.id]: 'rodando' }));
      await r1Rpc('gerenciador_executar_agora', { p_jobname: JOB_POR_ALERTA(a.id) });
      await new Promise((r) => setTimeout(r, 8000)); /* a carga roda em segundo plano; dá tempo de gravar o log */
      await refetch();
      qc.invalidateQueries({ queryKey: ['gerenciador'] });
    },
    onSuccess: (_d, a) => setEstado((e) => ({ ...e, [a.id]: 'persiste' })),
    onError: (err: Error, a) => setEstado((e) => ({ ...e, [a.id]: `Não consegui recarregar: ${err.message}` })),
  });
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
            {JOB_POR_ALERTA(a.id) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={estado[a.id] === 'rodando'} onClick={() => recarregar.mutate(a)} className="inline-flex items-center gap-1.5 rounded-lg border border-current px-2.5 py-1 font-semibold hover:bg-white/5 disabled:opacity-60">
                  <RefreshCw className={`w-3.5 h-3.5 ${estado[a.id] === 'rodando' ? 'animate-spin' : ''}`} aria-hidden="true" />{estado[a.id] === 'rodando' ? 'Recarregando…' : 'Recarregar'}
                </button>
                {estado[a.id] === 'persiste' && <span className="text-muted-foreground">Recarreguei e a falha continua. Siga o “O que fazer” acima.</span>}
                {estado[a.id] && estado[a.id] !== 'rodando' && estado[a.id] !== 'persiste' && <span>{estado[a.id]}</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
