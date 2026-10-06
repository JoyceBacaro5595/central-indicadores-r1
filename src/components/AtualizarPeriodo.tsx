import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadCloud } from 'lucide-react';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';

interface Pedido {
  id: number; de: string; ate: string; solicitante: string; solicitado_em: string; status: string; chamadas: number;
  lidas: number | null; versoes_novas: number | null; finalizado_em: string | null; erro: string | null; posicao: string | null;
}

const fmtData = (d: string) => d.split('-').reverse().join('/');
const fmtHora = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const diasAtrasISO = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const ROTULO: Record<string, string> = { em_andamento: 'em andamento', concluido: 'concluído', erro: 'erro' };
const COR: Record<string, string> = { em_andamento: 'text-amber-400', concluido: 'text-emerald-400', erro: 'text-red-400' };

/** Botão "Atualizar período agora": pede à Guru um intervalo exato de datas e mostra quem pediu e o andamento. */
export default function AtualizarPeriodo({ aoConcluir }: { aoConcluir?: () => void }) {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState(diasAtrasISO(7));
  const [ate, setAte] = useState(hojeISO());
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const pedidos = useQuery({
    queryKey: ['atualizacoes'],
    queryFn: () => r1Rpc<Pedido[]>('atualizacoes_listar'),
    enabled: aberto,
    refetchInterval: (q) => (q.state.data?.some((p) => p.status === 'em_andamento') ? 5000 : false),
  });
  const emAndamento = pedidos.data?.some((p) => p.status === 'em_andamento') ?? false;
  const concluidosRef = useRef<number>(0);
  useEffect(() => {
    const n = pedidos.data?.filter((p) => p.status === 'concluido').length ?? 0;
    if (concluidosRef.current && n > concluidosRef.current) aoConcluir?.();
    concluidosRef.current = n;
  }, [pedidos.data, aoConcluir]);

  const solicitar = useMutation({
    mutationFn: () => r1Rpc('atualizacao_solicitar', { p_de: de, p_ate: ate }),
    onSuccess: () => { setErro(null); qc.invalidateQueries({ queryKey: ['atualizacoes'] }); },
    onError: (e: Error) => setErro(e.message),
  });

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  if (!pode('gerenciador')) return null;

  return (
    <div ref={ref} className="relative print:hidden">
      <button onClick={() => setAberto((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20" title="Buscar na Guru um período exato de datas">
        <DownloadCloud className={`w-3.5 h-3.5 ${emAndamento ? 'animate-pulse' : ''}`} /> Atualizar período
      </button>
      {aberto && (
        <div className="absolute right-0 mt-1 w-[380px] surface-elevated p-3 z-50 text-xs space-y-3">
          <div>
            <p className="font-semibold text-foreground">Atualizar período agora</p>
            <p className="text-muted-foreground">Relê na Guru todas as transações do intervalo (até 93 dias por vez) e recalcula o painel ao terminar.</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); solicitar.mutate(); }} className="flex items-end gap-2">
            <label className="flex-1">De<input type="date" value={de} min="2026-01-01" max={ate} onChange={(e) => setDe(e.target.value)} className="mono w-full bg-secondary rounded px-2 py-1 text-foreground mt-0.5" /></label>
            <label className="flex-1">Até<input type="date" value={ate} min={de} max={hojeISO()} onChange={(e) => setAte(e.target.value)} className="mono w-full bg-secondary rounded px-2 py-1 text-foreground mt-0.5" /></label>
            <button type="submit" disabled={solicitar.isPending || emAndamento} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50">Atualizar</button>
          </form>
          {erro && <p className="text-red-400">{erro}</p>}
          <div>
            <p className="text-muted-foreground font-semibold mb-1">Últimos pedidos</p>
            {pedidos.isLoading && <p className="text-muted-foreground">Carregando…</p>}
            {pedidos.data?.length === 0 && <p className="text-muted-foreground">Nenhum pedido ainda.</p>}
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {pedidos.data?.map((p) => (
                <li key={p.id} className="border-t border-border pt-1">
                  <div className="flex justify-between gap-2">
                    <span className="mono">{fmtData(p.de)} → {fmtData(p.ate)}</span>
                    <span className={COR[p.status]}>{ROTULO[p.status] ?? p.status}{p.status === 'em_andamento' && p.posicao ? ` · em ${fmtData(p.posicao)}` : ''}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {p.solicitante} · pedido {fmtHora(p.solicitado_em)}
                    {p.status === 'concluido' && ` · ${(p.lidas ?? 0).toLocaleString('pt-BR')} lidas, ${(p.versoes_novas ?? 0).toLocaleString('pt-BR')} novas`}
                    {p.erro && <span className="text-red-400"> · {p.erro}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
