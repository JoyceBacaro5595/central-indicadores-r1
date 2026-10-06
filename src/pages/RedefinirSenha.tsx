import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { r1 } from '@/integrations/r1/client';

// Chegada por link de convite ou de "esqueci minha senha": o Supabase abre a sessão
// pelo link e esta tela grava a senha nova.
export default function RedefinirSenha() {
  const nav = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [semSessao, setSemSessao] = useState(false);
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancel = false;
    const t = setTimeout(async () => {
      const { data } = await r1.auth.getSession();
      if (cancel) return;
      if (data.session) setPronto(true); else setSemSessao(true);
    }, 400);
    const { data: sub } = r1.auth.onAuthStateChange((ev, s) => {
      if (s && (ev === 'PASSWORD_RECOVERY' || ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION')) { setPronto(true); setSemSessao(false); }
    });
    return () => { cancel = true; clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) { setErro('A senha precisa ter pelo menos 8 caracteres.'); return; }
    if (senha !== confirma) { setErro('As senhas não conferem.'); return; }
    setSalvando(true);
    const { error } = await r1.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    nav('/central', { replace: true });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <form onSubmit={salvar} className="surface-elevated p-8 w-full max-w-sm space-y-5">
        <div>
          <h1 className="text-lg font-extrabold text-foreground tracking-wide">Definir senha</h1>
          <p className="text-xs text-muted-foreground mt-1">Escolha a senha que você vai usar para entrar na central.</p>
        </div>
        {semSessao && !pronto && (
          <p className="text-xs text-red-400">
            O link expirou ou já foi usado. <Link to="/login" className="text-primary font-semibold">Peça um novo na tela de login.</Link>
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Nova senha</span>
          <input type="password" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)} disabled={!pronto}
            className="w-full bg-secondary text-sm text-foreground rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50" />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Repita a senha</span>
          <input type="password" autoComplete="new-password" required value={confirma} onChange={(e) => setConfirma(e.target.value)} disabled={!pronto}
            className="w-full bg-secondary text-sm text-foreground rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50" />
        </label>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        <button type="submit" disabled={!pronto || salvando}
          className="w-full rounded-md bg-primary text-primary-foreground text-sm font-semibold py-2 disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar e entrar'}
        </button>
      </form>
    </div>
  );
}
