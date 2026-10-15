import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useAlertas } from '@/components/AlertasSaude';

const quando = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');

/** Sino no topo da página: reúne todos os avisos do sistema (integrações e base de pedidos). Só aparece para quem acessa o Gerenciador. */
export default function AvisosSino() {
  const { pode } = useAuth();
  const habilitado = pode('gerenciador');
  const { data, error } = useAlertas(habilitado);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fechar); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  if (!habilitado || error) return null;
  const alertas = data?.alertas ?? [];
  const critico = alertas.some((a) => a.gravidade === 'critico');

  return (
    <div ref={ref} className="relative print:hidden">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-label={alertas.length ? `${alertas.length} avisos` : 'Avisos'} title={alertas.length ? `${alertas.length} aviso(s)` : 'Sem avisos'}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary">
        <Bell className="w-4 h-4" aria-hidden="true" />
        {alertas.length > 0 && <span className={`absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white ${critico ? 'bg-red-500' : 'bg-amber-500'}`}>{alertas.length}</span>}
      </button>
      {aberto && (
        <div role="dialog" aria-label="Avisos" className="absolute right-0 top-10 z-50 w-[min(92vw,380px)] max-h-[70vh] overflow-y-auto surface-elevated rounded-lg border border-border p-3 space-y-2 shadow-2xl">
          <p className="section-label">Avisos</p>
          {alertas.length === 0 && <p className="text-xs text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" aria-hidden="true" />Tudo em dia: integrações e base de pedidos atualizadas.</p>}
          {alertas.map((a) => (
            <div key={a.id} className={`rounded-lg border p-2.5 text-xs ${a.gravidade === 'critico' ? 'border-red-500/40' : 'border-amber-500/40'}`}>
              <p className={`font-bold flex items-start gap-2 ${a.gravidade === 'critico' ? 'text-red-400' : 'text-amber-400'}`}><AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />{a.titulo}</p>
              <p className="mt-1 text-foreground">{a.detalhe}</p>
              <p className="mt-1 text-muted-foreground">Último sucesso: {quando(a.desde)}</p>
              <p className="mt-1 text-muted-foreground">O que fazer: {a.acao}</p>
            </div>
          ))}
          <Link to="/central/gerenciador" onClick={() => setAberto(false)} className="block text-[11px] text-primary hover:underline">Abrir Integrações e logs</Link>
        </div>
      )}
    </div>
  );
}
