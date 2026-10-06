import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { r1 } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import UserMenu from '@/components/UserMenu';

export default function Conta() {
  const { session, perfil } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (senha.length < 8) { setMsg({ ok: false, texto: 'A senha precisa ter pelo menos 8 caracteres.' }); return; }
    if (senha !== confirma) { setMsg({ ok: false, texto: 'As senhas não conferem.' }); return; }
    setSalvando(true);
    const { error } = await r1.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) setMsg({ ok: false, texto: error.message });
    else { setMsg({ ok: true, texto: 'Senha atualizada.' }); setSenha(''); setConfirma(''); }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="dashboard-header">
        <div className="flex items-center gap-3">
          <Link to="/central" className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center" title="Voltar">
            <ArrowLeft className="w-4 h-4 text-primary" />
          </Link>
          <div>
            <h1 className="text-sm font-extrabold text-foreground tracking-wide">Minha conta</h1>
            <p className="text-[10px] text-muted-foreground font-medium">{session?.user.email} · perfil {perfil?.papel}</p>
          </div>
        </div>
        <UserMenu />
      </header>
      <main className="py-6 mx-auto max-w-md px-4">
        <form onSubmit={salvar} className="surface p-6 space-y-4">
          <h2 className="text-sm font-bold text-foreground">Trocar senha</h2>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Nova senha</span>
            <input type="password" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)}
              className="w-full bg-secondary text-sm text-foreground rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Repita a senha</span>
            <input type="password" autoComplete="new-password" required value={confirma} onChange={(e) => setConfirma(e.target.value)}
              className="w-full bg-secondary text-sm text-foreground rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.texto}</p>}
          <button type="submit" disabled={salvando} className="rounded-md bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
      </main>
    </div>
  );
}
