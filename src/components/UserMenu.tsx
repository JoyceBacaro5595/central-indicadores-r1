import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, KeyRound } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';

const ROTULO: Record<string, string> = {
  administrador: 'Administrador', gestor: 'Gestor', analista: 'Analista', atendente: 'Atendente', consulta: 'Consulta',
};

export default function UserMenu() {
  const { session, perfil, sair } = useAuth();
  const nav = useNavigate();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  if (!session) return null;
  const nome = perfil?.nome || session.user.email || '';
  const inicial = nome.trim().charAt(0).toUpperCase() || '?';

  return (
    <div ref={ref} className="relative print:hidden">
      <button onClick={() => setAberto((v) => !v)} className="flex items-center gap-2 h-8 pl-1 pr-2 rounded-lg hover:bg-secondary" title={session.user.email}>
        <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">{inicial}</span>
        <span className="hidden sm:block text-xs font-semibold text-foreground max-w-[140px] truncate">{nome}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {aberto && (
        <div className="absolute right-0 mt-1 w-56 surface-elevated p-1.5 z-50 text-xs">
          <div className="px-2 py-1.5">
            <p className="font-semibold text-foreground truncate">{session.user.email}</p>
            <p className="text-muted-foreground">{perfil ? ROTULO[perfil.papel] ?? perfil.papel : 'Sem perfil'}</p>
          </div>
          <div className="h-px bg-border my-1" />
          <Link to="/central/conta" onClick={() => setAberto(false)} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary text-foreground">
            <KeyRound className="w-3.5 h-3.5" /> Trocar minha senha
          </Link>
          <button onClick={async () => { setAberto(false); await sair(); nav('/login', { replace: true }); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary text-foreground">
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      )}
    </div>
  );
}
