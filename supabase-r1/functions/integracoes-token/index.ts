// Atualização de token de integração pelo app (tela Integrações e logs).
// Quem chama precisa estar logado e ter a permissão 'gerenciador' (gestor e administrador), checada no banco com o próprio login.
// Fluxo: valida o formato -> testa o token no provedor -> só se funcionar grava no cofre (vault 'token_<chave>') -> roda a carga da integração
// para confirmar com dados reais. O token nunca é devolvido nem registrado em log; o log guarda quem trocou, quando e o resultado.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.4';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const G = 'https://graph.facebook.com/v21.0';
const CONTA_META = Deno.env.get('META_ADS_CONTA') ?? '171474008015977';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Testa o token no provedor. Devolve uma frase curta do que foi confirmado, ou lança com o motivo (sem o token). */
async function testar(chave: string, token: string): Promise<string> {
  if (chave === 'meta_ads') {
    const me = await (await fetch(`${G}/me?fields=id,name&access_token=${encodeURIComponent(token)}`)).json();
    if (me.error) throw new Error(`O Meta recusou o token: ${String(me.error.message ?? '').slice(0, 160)}`);
    const ct = await (await fetch(`${G}/act_${CONTA_META}?fields=name,account_status&access_token=${encodeURIComponent(token)}`)).json();
    if (ct.error) throw new Error(`O token vale, mas não alcança a conta de anúncios ${CONTA_META}: ${String(ct.error.message ?? '').slice(0, 160)}`);
    return `Token aceito pelo Meta (${me.name ?? me.id}) e com acesso à conta ${ct.name ?? CONTA_META}.`;
  }
  throw new Error('Integração não suportada');
}

/** Roda a carga da integração com o token novo e devolve o resultado resumido. */
async function carga(chave: string, sql: any): Promise<{ ok: boolean; resumo: string }> {
  if (chave === 'meta_ads') {
    const [k] = await sql`select decrypted_secret as s from vault.decrypted_secrets where name = 'guru_sync_key'`;
    const r = await fetch(`${URL_}/functions/v1/meta-ads-sync?meses=2`, { headers: { 'x-guru-sync-key': k?.s ?? '' } });
    const b = await r.json().catch(() => ({}));
    if (b.ok) return { ok: true, resumo: `Carga do Meta concluída: ${b.linhas} linhas de ${b.janela?.since} a ${b.janela?.until}.` };
    return { ok: false, resumo: `A carga do Meta falhou: ${String(b.erro ?? r.status).slice(0, 200)}` };
  }
  return { ok: false, resumo: 'Sem carga de confirmação para esta integração.' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { ok: false, erro: 'Use POST' });
  // Diagnóstico das credenciais que as funções já têm (só diz se existem e se funcionam, nunca o valor). Chave interna do banco, como nas cargas.
  const chaveInterna = req.headers.get('x-guru-sync-key') ?? '';
  if (chaveInterna) {
    const sqlD = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });
    try {
      const [k] = await sqlD`select decrypted_secret as s from vault.decrypted_secrets where name = 'guru_sync_key'`;
      const esp = k?.s ?? '';
      if (!(esp.length > 0 && chaveInterna.length === esp.length && chaveInterna === esp)) return json(403, { ok: false, erro: 'chave inválida' });
      const out: unknown[] = [];
      for (const nome of ['META_ADS_TOKEN', 'META_TOKEN_API']) {
        const v = Deno.env.get(nome);
        if (!v) { out.push({ segredo: nome, presente: false }); continue; }
        try { out.push({ segredo: nome, presente: true, resultado: await testar('meta_ads', v) }); }
        catch (e) { out.push({ segredo: nome, presente: true, erro: String((e as Error).message ?? e).slice(0, 200) }); }
      }
      return json(200, { ok: true, conta: CONTA_META, segredos: out });
    } finally { await sqlD.end({ timeout: 3 }); }
  }
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(401, { ok: false, erro: 'Login necessário' });

  const comoUsuario = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const { data: perfil, error: ePerfil } = await comoUsuario.rpc('meu_perfil');
  if (ePerfil) return json(401, { ok: false, erro: ePerfil.message });
  if (!perfil?.ativo || !(perfil.permissoes ?? []).includes('gerenciador')) return json(403, { ok: false, erro: 'Sem permissão para atualizar tokens' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { ok: false, erro: 'Corpo inválido' }); }
  const chave = String(body.chave ?? '');
  const token = String(body.token ?? '').trim();
  if (chave !== 'meta_ads') return json(400, { ok: false, erro: 'Integração não suportada' });
  if (token.length < 20 || token.length > 1000 || /\s/.test(token)) return json(400, { ok: false, erro: 'O token parece incompleto: cole o valor inteiro, sem espaços.' });

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
  try {
    let teste: string;
    try { teste = await testar(chave, token); } catch (e) {
      const msg = String((e as Error).message ?? e);
      await sql`select public.integracao_token_registrar_falha(${chave}, ${perfil.user_id}::uuid, ${msg})`;
      return json(400, { ok: false, erro: msg });
    }
    await sql`select public.integracao_token_gravar(${chave}, ${token}, ${perfil.user_id}::uuid, ${teste})`;
    const c = await carga(chave, sql);
    return json(200, { ok: true, teste, carga_ok: c.ok, carga: c.resumo });
  } catch (e) {
    return json(500, { ok: false, erro: String((e as Error).message ?? e).replace(token, '***') });
  } finally {
    await sql.end({ timeout: 5 });
  }
});
