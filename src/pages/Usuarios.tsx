import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { r1Function, r1Rpc } from '@/integrations/r1/client';
import { useAuth, type Papel } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/shared';

interface Usuario {
  user_id: string; email: string; nome: string | null; papel: Papel; ativo: boolean;
  escopos: Record<string, unknown>; criado_em: string; ultimo_login: string | null; confirmado: boolean;
}

const PAPEIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  { valor: 'administrador', rotulo: 'Administrador', descricao: 'Tudo, inclusive usuários e permissões' },
  { valor: 'gestor', rotulo: 'Gestor', descricao: 'Painel, relatório, gerenciador, recuperação, presença e dados pessoais' },
  { valor: 'analista', rotulo: 'Analista', descricao: 'Painel, relatório, exportação e presença, sem dado pessoal' },
  { valor: 'atendente', rotulo: 'Atendente', descricao: 'Painel, relatório, fila de recuperação e presença' },
  { valor: 'consulta', rotulo: 'Consulta', descricao: 'Só painel e relatório' },
];

const RECURSOS: Record<string, string> = {
  painel: 'Central de ingressos', relatorio: 'Relatório', exportar: 'Exportar CSV/PDF', gerenciador: 'Gerenciador (integrações e horários)',
  recuperacao: 'Fila de recuperação de carrinho', presenca: 'Presença e check-ins', dados_pessoais: 'Ver dados pessoais', usuarios: 'Usuários e permissões',
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

export default function Usuarios() {
  const { perfil, recarregarPerfil } = useAuth();
  const qc = useQueryClient();
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => r1Rpc<Usuario[]>('usuarios_listar') });
  const permissoes = useQuery({ queryKey: ['permissoes'], queryFn: () => r1Rpc<Record<string, Papel[]>>('permissoes_listar') });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // linha em edição (nome, e-mail, perfil, ativo) — só grava ao clicar em Salvar
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<{ nome: string; email: string; papel: Papel; ativo: boolean } | null>(null);
  // matriz de permissões em edição — só grava ao clicar em Salvar
  const [matriz, setMatriz] = useState<Record<string, Papel[]> | null>(null);

  const atualizar = useMutation({
    mutationFn: (v: { user_id: string; nome?: string; papel?: Papel; ativo?: boolean }) =>
      r1Rpc('usuario_atualizar', { p_user_id: v.user_id, p_nome: v.nome ?? null, p_papel: v.papel ?? null, p_ativo: v.ativo ?? null, p_escopos: null }),
    onSuccess: () => { setErro(null); qc.invalidateQueries({ queryKey: ['usuarios'] }); },
    onError: (e: Error) => setErro(e.message),
  });

  const acao = useMutation({
    mutationFn: (body: Record<string, unknown>) => r1Function<{ ok: boolean; mensagem?: string }>('usuarios', body),
    onSuccess: (r) => { setErro(null); setAviso(r.mensagem ?? 'Feito.'); qc.invalidateQueries({ queryKey: ['usuarios'] }); },
    onError: (e: Error) => { setAviso(null); setErro(e.message); },
  });

  // Salvar a linha: nome/perfil/ativo pela RPC; e-mail pela Edge Function (API admin do Auth).
  const salvarLinha = useMutation({
    mutationFn: async (v: { u: Usuario; r: NonNullable<typeof rascunho> }) => {
      const mudouPerfil = v.r.nome !== (v.u.nome ?? '') || v.r.papel !== v.u.papel || v.r.ativo !== v.u.ativo;
      if (mudouPerfil) {
        await r1Rpc('usuario_atualizar', { p_user_id: v.u.user_id, p_nome: v.r.nome !== (v.u.nome ?? '') ? v.r.nome : null,
          p_papel: v.r.papel !== v.u.papel ? v.r.papel : null, p_ativo: v.r.ativo !== v.u.ativo ? v.r.ativo : null, p_escopos: null });
      }
      const email = v.r.email.trim().toLowerCase();
      if (email !== v.u.email) await r1Function<{ ok: boolean }>('usuarios', { op: 'editar_email', user_id: v.u.user_id, email });
      return mudouPerfil || email !== v.u.email;
    },
    onSuccess: (mudou) => { setErro(null); setAviso(mudou ? 'Usuário salvo.' : 'Nada para salvar.'); setEditando(null); setRascunho(null); qc.invalidateQueries({ queryKey: ['usuarios'] }); },
    onError: (e: Error) => { setAviso(null); setErro(e.message); },
  });

  const excluir = useMutation({
    mutationFn: (u: Usuario) => r1Function<{ ok: boolean; mensagem?: string }>('usuarios', { op: 'excluir', user_id: u.user_id }),
    onSuccess: (r) => { setErro(null); setAviso(r.mensagem ?? 'Usuário excluído.'); setEditando(null); qc.invalidateQueries({ queryKey: ['usuarios'] }); },
    onError: (e: Error) => { setAviso(null); setErro(e.message); },
  });

  const salvarMatriz = useMutation({
    mutationFn: (m: Record<string, Papel[]>) => r1Rpc<Record<string, Papel[]>>('permissoes_salvar', { p_matriz: m }),
    onSuccess: async () => { setErro(null); setAviso('Matriz de permissões salva.'); setMatriz(null); qc.invalidateQueries({ queryKey: ['permissoes'] }); await recarregarPerfil(); },
    onError: (e: Error) => { setAviso(null); setErro(e.message); },
  });

  useEffect(() => { if (!erro && !aviso) return; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [erro, aviso]);

  function comecarEdicao(u: Usuario) {
    setEditando(u.user_id);
    setRascunho({ nome: u.nome ?? '', email: u.email, papel: u.papel, ativo: u.ativo });
  }

  function confirmarExclusao(u: Usuario) {
    const digitado = window.prompt(`Excluir o acesso de ${u.email}? Isso apaga o login e não pode ser desfeito.\nDigite o e-mail para confirmar:`);
    if (digitado === null) return;
    if (digitado.trim().toLowerCase() !== u.email) { setErro('E-mail digitado não confere; exclusão cancelada.'); return; }
    excluir.mutate(u);
  }

  function alternarPermissao(rec: string, papel: Papel) {
    setMatriz((m) => {
      const base = m ?? permissoes.data ?? {};
      const atual = base[rec] ?? [];
      return { ...base, [rec]: atual.includes(papel) ? atual.filter((p) => p !== papel) : [...atual, papel] };
    });
  }

  // novo usuário
  const [novoEmail, setNovoEmail] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novoPapel, setNovoPapel] = useState<Papel>('consulta');
  const [modo, setModo] = useState<'convidar' | 'criar'>('convidar');
  const [novaSenha, setNovaSenha] = useState('');

  function criar(e: FormEvent) {
    e.preventDefault();
    acao.mutate({ op: modo, email: novoEmail.trim(), nome: novoNome.trim() || null, papel: novoPapel, senha: modo === 'criar' ? novaSenha : undefined,
      redirect_to: `${window.location.origin}/redefinir-senha` });
    setNovoEmail(''); setNovoNome(''); setNovaSenha('');
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo="Usuários e permissões"
        subtitulo="Quem acessa a central e o que cada perfil pode ver"
        onAtualizar={() => usuarios.refetch()}
        atualizando={usuarios.isFetching}
      />

      <main className="py-6 space-y-6 mx-auto max-w-[1200px] px-4 md:px-8">
        {erro && <div className="surface p-3 text-xs text-red-400">{erro}</div>}
        {aviso && <div className="surface p-3 text-xs text-emerald-400">{aviso}</div>}

        <form onSubmit={criar} className="surface p-4 space-y-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2"><UserPlus className="w-4 h-4 text-primary" /> Novo usuário</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
              E-mail
              <input type="email" required value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} className="bg-secondary text-xs text-foreground rounded-md px-2 py-1.5 normal-case font-normal min-w-[220px]" />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
              Nome
              <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} className="bg-secondary text-xs text-foreground rounded-md px-2 py-1.5 normal-case font-normal min-w-[180px]" />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
              Perfil
              <select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value as Papel)} className="bg-secondary text-xs text-foreground rounded-md px-2 py-1.5 normal-case font-normal">
                {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
              Como
              <select value={modo} onChange={(e) => setModo(e.target.value as 'convidar' | 'criar')} className="bg-secondary text-xs text-foreground rounded-md px-2 py-1.5 normal-case font-normal">
                <option value="convidar">Enviar convite por e-mail</option>
                <option value="criar">Criar com senha temporária</option>
              </select>
            </label>
            {modo === 'criar' && (
              <label className="flex flex-col gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                Senha temporária
                <input type="text" required minLength={8} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} className="bg-secondary text-xs text-foreground rounded-md px-2 py-1.5 normal-case font-normal min-w-[160px]" />
              </label>
            )}
            <button type="submit" disabled={acao.isPending} className="rounded-md bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 disabled:opacity-50">
              {acao.isPending ? 'Enviando…' : modo === 'convidar' ? 'Convidar' : 'Criar'}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            O convite por e-mail depende do remetente configurado no Supabase; se não chegar, use a senha temporária e peça para a pessoa trocar em "Minha conta".
          </p>
        </form>

        <div className="surface overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left p-3">Usuário</th>
                <th className="text-left p-3">Perfil</th>
                <th className="text-left p-3">Ativo</th>
                <th className="text-left p-3">Último login</th>
                <th className="text-left p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(usuarios.data ?? []).map((u) => {
                const eu = u.user_id === perfil?.user_id;
                const emEdicao = editando === u.user_id && rascunho;
                const ocupado = salvarLinha.isPending || excluir.isPending;
                return (
                  <tr key={u.user_id} className={`border-b border-border/60 ${u.ativo || emEdicao ? '' : 'opacity-60'}`}>
                    <td className="p-3">
                      {emEdicao ? (
                        <div className="space-y-1">
                          <input value={rascunho.nome} placeholder="Nome" onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                            className="bg-secondary text-foreground font-semibold rounded-md px-2 py-1 w-full" />
                          <input type="email" value={rascunho.email} onChange={(e) => setRascunho({ ...rascunho, email: e.target.value })}
                            className="bg-secondary text-foreground rounded-md px-2 py-1 w-full" />
                        </div>
                      ) : (
                        <>
                          <p className="text-foreground font-semibold px-1">{u.nome || <span className="text-muted-foreground font-normal">Sem nome</span>}</p>
                          <p className="text-muted-foreground px-1">{u.email}{!u.confirmado && ' · convite pendente'}</p>
                        </>
                      )}
                    </td>
                    <td className="p-3">
                      {emEdicao ? (
                        <select value={rascunho.papel} disabled={eu} onChange={(e) => setRascunho({ ...rascunho, papel: e.target.value as Papel })}
                          className="bg-secondary text-xs text-foreground rounded-md px-2 py-1.5 disabled:opacity-60">
                          {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                        </select>
                      ) : <span className="text-foreground">{PAPEIS.find((p) => p.valor === u.papel)?.rotulo ?? u.papel}</span>}
                    </td>
                    <td className="p-3">
                      {emEdicao ? (
                        <input type="checkbox" checked={rascunho.ativo} disabled={eu} onChange={(e) => setRascunho({ ...rascunho, ativo: e.target.checked })} />
                      ) : <span className={u.ativo ? 'text-emerald-400' : 'text-muted-foreground'}>{u.ativo ? 'Sim' : 'Não'}</span>}
                    </td>
                    <td className="p-3 text-muted-foreground">{fmt(u.ultimo_login)}</td>
                    <td className="p-3">
                      {emEdicao ? (
                        <div className="flex flex-wrap gap-3">
                          <button type="button" disabled={ocupado} onClick={() => salvarLinha.mutate({ u, r: rascunho })}
                            className="rounded-md bg-primary text-primary-foreground font-semibold px-3 py-1.5 disabled:opacity-50">
                            {salvarLinha.isPending ? 'Salvando…' : 'Salvar'}
                          </button>
                          <button type="button" disabled={ocupado} onClick={() => { setEditando(null); setRascunho(null); }} className="text-muted-foreground font-semibold">Cancelar</button>
                          {!eu && (
                            <button type="button" disabled={ocupado} onClick={() => confirmarExclusao(u)} className="text-red-400 font-semibold inline-flex items-center gap-1">
                              <Trash2 className="w-3.5 h-3.5" /> Excluir
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          <button type="button" onClick={() => comecarEdicao(u)} className="text-primary font-semibold inline-flex items-center gap-1">
                            <Pencil className="w-3.5 h-3.5" /> Editar
                          </button>
                          <button type="button" onClick={() => acao.mutate({ op: 'resetar_senha', email: u.email, redirect_to: `${window.location.origin}/redefinir-senha` })} className="text-primary font-semibold">
                            Enviar redefinição de senha
                          </button>
                          {!u.confirmado && (
                            <button type="button" onClick={() => acao.mutate({ op: 'convidar', email: u.email, nome: u.nome, papel: u.papel, redirect_to: `${window.location.origin}/redefinir-senha` })} className="text-primary font-semibold">
                              Reenviar convite
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {usuarios.data?.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={5}>Nenhum usuário ainda.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-bold text-foreground">Matriz de permissões</h2>
            {matriz ? (
              <div className="flex gap-3 text-xs">
                <button type="button" disabled={salvarMatriz.isPending} onClick={() => salvarMatriz.mutate(matriz)}
                  className="rounded-md bg-primary text-primary-foreground font-semibold px-3 py-1.5 disabled:opacity-50">
                  {salvarMatriz.isPending ? 'Salvando…' : 'Salvar'}
                </button>
                <button type="button" disabled={salvarMatriz.isPending} onClick={() => setMatriz(null)} className="text-muted-foreground font-semibold">Cancelar</button>
              </div>
            ) : (
              <button type="button" disabled={!permissoes.data} onClick={() => setMatriz({ ...(permissoes.data ?? {}) })} className="text-primary text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                <Pencil className="w-3.5 h-3.5" /> Editar matriz
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left p-2">Recurso</th>
                  {PAPEIS.map((p) => <th key={p.valor} className="p-2 text-center" title={p.descricao}>{p.rotulo}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(RECURSOS).map(([rec, rotulo]) => (
                  <tr key={rec} className="border-b border-border/60">
                    <td className="p-2 text-foreground">{rotulo}</td>
                    {PAPEIS.map((p) => {
                      const ligado = !!(matriz ?? permissoes.data)?.[rec]?.includes(p.valor);
                      const travado = rec === 'usuarios' && p.valor === 'administrador';
                      return (
                        <td key={p.valor} className="p-2 text-center">
                          {matriz ? (
                            <input type="checkbox" checked={ligado} disabled={travado} onChange={() => alternarPermissao(rec, p.valor)}
                              title={travado ? 'O administrador sempre gerencia usuários' : `${rotulo} · ${p.rotulo}`} />
                          ) : ligado ? '●' : <span className="text-muted-foreground/40">·</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {matriz ? 'Marque o que cada perfil pode ver e clique em Salvar; a mudança vale para todos no próximo carregamento. O administrador sempre mantém "Usuários e permissões".'
              : 'Clique em "Editar matriz" para mudar o que cada perfil acessa. Toda alteração fica registrada no histórico.'}
          </p>
        </div>
      </main>
    </div>
  );
}
