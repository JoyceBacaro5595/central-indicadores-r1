import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Link } from 'react-router-dom';

function Tela({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background flex items-center justify-center p-6 text-sm text-muted-foreground">{children}</div>;
}

/** Exige login. Com `recurso`, exige também a permissão daquele recurso para o perfil. */
export default function RequireAuth({ recurso }: { recurso?: string }) {
  const { session, perfil, carregando, pode, sair } = useAuth();
  const loc = useLocation();

  if (carregando) return <Tela>Carregando…</Tela>;
  if (!session) return <Navigate to="/login" replace state={{ de: loc.pathname + loc.search }} />;

  if (!perfil || !perfil.ativo) {
    return (
      <Tela>
        <div className="surface p-6 max-w-md text-center space-y-3">
          <p className="text-foreground font-semibold">Seu acesso ainda não foi liberado.</p>
          <p>Peça a um administrador para ativar seu perfil ({session.user.email}).</p>
          <button onClick={sair} className="text-primary font-semibold">Sair</button>
        </div>
      </Tela>
    );
  }

  if (recurso && !pode(recurso)) {
    return (
      <Tela>
        <div className="surface p-6 max-w-md text-center space-y-3">
          <p className="text-foreground font-semibold">Sem permissão para esta área.</p>
          <p>Seu perfil é <b>{perfil.papel}</b>. Fale com um administrador se precisar de acesso.</p>
          <Link to="/central" className="text-primary font-semibold">Voltar para a central</Link>
        </div>
      </Tela>
    );
  }

  return <Outlet />;
}
