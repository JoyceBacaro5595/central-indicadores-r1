import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { r1, r1Rpc } from '@/integrations/r1/client';

export type Papel = 'administrador' | 'gestor' | 'analista' | 'atendente' | 'consulta';

export interface Perfil {
  user_id: string;
  email: string;
  nome: string | null;
  papel: Papel;
  ativo: boolean;
  escopos: Record<string, unknown>;
  permissoes: string[];
}

interface AuthState {
  session: Session | null;
  perfil: Perfil | null;
  carregando: boolean;
  pode: (recurso: string) => boolean;
  recarregarPerfil: () => Promise<void>;
  sair: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregarPerfil = useCallback(async (s: Session | null) => {
    if (!s) { setPerfil(null); return; }
    try {
      const p = await r1Rpc<Perfil | null>('meu_perfil');
      setPerfil(p);
    } catch {
      setPerfil(null);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    r1.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      setSession(data.session);
      await carregarPerfil(data.session);
      setCarregando(false);
    });
    const { data: sub } = r1.auth.onAuthStateChange(async (evento, s) => {
      setSession(s);
      if (evento === 'SIGNED_OUT') setPerfil(null);
      else if (evento === 'SIGNED_IN' || evento === 'USER_UPDATED' || evento === 'TOKEN_REFRESHED') await carregarPerfil(s);
    });
    return () => { ativo = false; sub.subscription.unsubscribe(); };
  }, [carregarPerfil]);

  const value = useMemo<AuthState>(() => ({
    session,
    perfil,
    carregando,
    pode: (recurso) => !!perfil?.ativo && perfil.permissoes.includes(recurso),
    recarregarPerfil: () => carregarPerfil(session),
    sair: async () => { await r1.auth.signOut(); },
  }), [session, perfil, carregando, carregarPerfil]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth precisa do AuthProvider');
  return v;
}
