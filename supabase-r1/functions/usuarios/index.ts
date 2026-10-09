// Gestão de usuários da Central de Indicadores R1.
// Só quem tem a permissão 'usuarios' (administrador) pode convidar, criar, editar e-mail, definir senha, excluir ou resetar senha.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAPEIS = ['administrador', 'gestor', 'analista', 'atendente', 'consulta'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function redirectPermitido(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname.endsWith('.vercel.app') ? url : undefined;
  } catch { return undefined; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { ok: false, erro: 'Use POST' });

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(401, { ok: false, erro: 'Login necessário' });

  // 1) quem chama, com as permissões do próprio perfil (checadas no banco)
  const comoUsuario = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: perfil, error: ePerfil } = await comoUsuario.rpc('meu_perfil');
  if (ePerfil) return json(401, { ok: false, erro: ePerfil.message });
  const permissoes: string[] = perfil?.permissoes ?? [];
  if (!perfil?.ativo || !permissoes.includes('usuarios')) return json(403, { ok: false, erro: 'Sem permissão para gerenciar usuários' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { ok: false, erro: 'Corpo inválido' }); }
  const op = String(body.op ?? '');
  const email = String(body.email ?? '').trim().toLowerCase();
  const nome = body.nome ? String(body.nome).trim() : null;
  const papel = body.papel ? String(body.papel) : 'consulta';
  const userId = body.user_id ? String(body.user_id) : '';
  const redirectTo = redirectPermitido(body.redirect_to as string | undefined);
  const precisaEmail = ['convidar', 'criar', 'resetar_senha', 'editar_email'].includes(op);
  const precisaUsuario = ['excluir', 'editar_email', 'definir_senha'].includes(op);
  if (precisaEmail && (!email || !email.includes('@'))) return json(400, { ok: false, erro: 'E-mail inválido' });
  if (precisaUsuario && !userId) return json(400, { ok: false, erro: 'Usuário não informado' });
  if (!PAPEIS.includes(papel)) return json(400, { ok: false, erro: 'Perfil inválido' });

  // 2) operações administrativas com a chave de serviço (nunca sai da função)
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  async function aplicarPerfil(id: string) {
    const { error } = await admin.rpc('usuario_definir_papel', { p_user_id: id, p_papel: papel, p_nome: nome, p_por: perfil.user_id });
    if (error) throw new Error(error.message);
  }

  try {
    if (op === 'convidar') {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { nome }, redirectTo });
      if (error) throw new Error(error.message);
      await aplicarPerfil(data.user.id);
      return json(200, { ok: true, mensagem: `Convite enviado para ${email}` });
    }
    if (op === 'criar') {
      const senha = String(body.senha ?? '');
      if (senha.length < 8) return json(400, { ok: false, erro: 'Senha temporária precisa ter ao menos 8 caracteres' });
      const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (error) throw new Error(error.message);
      await aplicarPerfil(data.user.id);
      return json(200, { ok: true, mensagem: `Usuário ${email} criado; a pessoa pode trocar a senha em “Minha conta” quando quiser` });
    }
    if (op === 'definir_senha') {
      // Senha definida pelo administrador para um acesso já existente; a pessoa troca depois em “Minha conta”.
      const senha = String(body.senha ?? '');
      if (senha.length < 8) return json(400, { ok: false, erro: 'A senha precisa ter ao menos 8 caracteres' });
      const { data, error } = await admin.auth.admin.updateUserById(userId, { password: senha, email_confirm: true });
      if (error) throw new Error(error.message);
      return json(200, { ok: true, mensagem: `Senha definida para ${data.user?.email ?? 'o usuário'}; ela pode ser trocada em “Minha conta”` });
    }
    if (op === 'resetar_senha') {
      const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new Error(error.message);
      return json(200, { ok: true, mensagem: `E-mail de redefinição enviado para ${email}` });
    }
    if (op === 'editar_email') {
      // Troca o e-mail de login sem exigir confirmação; identity.perfil sincroniza pelo trigger.
      const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (error) throw new Error(error.message);
      return json(200, { ok: true, mensagem: `E-mail alterado para ${email}` });
    }
    if (op === 'excluir') {
      if (userId === perfil.user_id) return json(400, { ok: false, erro: 'Você não pode excluir o próprio acesso' });
      // Registra no histórico (e bloqueia o último administrador ativo) antes de apagar o login.
      const { data: antes, error: eReg } = await admin.rpc('usuario_excluir_registro', { p_user_id: userId, p_por: perfil.user_id });
      if (eReg) throw new Error(eReg.message);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
      return json(200, { ok: true, mensagem: `Usuário ${antes?.email ?? ''} excluído` });
    }
    return json(400, { ok: false, erro: `Operação desconhecida: ${op}` });
  } catch (e) {
    return json(400, { ok: false, erro: (e as Error).message });
  }
});
