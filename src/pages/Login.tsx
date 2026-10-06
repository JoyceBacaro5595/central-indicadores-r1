import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { r1 } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';

export default function Login() {
  const { session, carregando } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const destino = (loc.state as { de?: string } | null)?.de || '/central';
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!carregando && session) return <Navigate to={destino} replace />;

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null); setAviso(null); setEnviando(true);
    const { error } = await r1.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) {
      setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
      return;
    }
    nav(destino, { replace: true });
  }

  async function esqueci() {
    if (!email.trim()) { setErro('Digite seu e-mail para receber o link.'); return; }
    setErro(null); setEnviando(true);
    const { error } = await r1.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` });
    setEnviando(false);
    if (error) setErro(error.message);
    else setAviso('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.');
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <form onSubmit={entrar} className="surface-elevated p-8 w-full max-w-sm space-y-5">
        <div>
          <h1 className="text-lg font-extrabold text-foreground tracking-wide">Central de Indicadores R1</h1>
          <p className="text-xs text-muted-foreground mt-1">Entre com o e-mail e a senha cadastrados.</p>
        </div>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">E-mail</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-secondary text-sm text-foreground rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40" />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Senha</span>
          <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)}
            className="w-full bg-secondary text-sm text-foreground rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40" />
        </label>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        {aviso && <p className="text-xs text-emerald-400">{aviso}</p>}
        <button type="submit" disabled={enviando}
          className="w-full rounded-md bg-primary text-primary-foreground text-sm font-semibold py-2 disabled:opacity-50">
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <button type="button" onClick={esqueci} disabled={enviando} className="w-full text-xs text-muted-foreground hover:text-foreground">
          Esqueci minha senha
        </button>
      </form>
    </div>
  );
}
