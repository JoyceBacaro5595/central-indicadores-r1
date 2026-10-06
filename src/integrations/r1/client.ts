import { createClient } from '@supabase/supabase-js';

// Cliente do Supabase r1-indicadores (login, perfis e RPCs da central).
// A chave publicável é pública por natureza; o que protege os dados são as RPCs
// (só agregados) e as permissões por perfil checadas no banco.
export const R1_URL = 'https://lgaujmjedphzynhbokob.supabase.co';
export const R1_PUBLISHABLE_KEY = 'sb_publishable_IkNQonFM7rYG5rH4PRI1aA_3fhFurRp';

export const r1 = createClient(R1_URL, R1_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Cabeçalhos para chamar as RPCs do painel como o usuário logado. */
export async function r1Headers(): Promise<Record<string, string>> {
  const { data } = await r1.auth.getSession();
  const h: Record<string, string> = { apikey: R1_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (data.session?.access_token) h.Authorization = `Bearer ${data.session.access_token}`;
  return h;
}

/** Chama uma RPC pública do r1-indicadores como o usuário logado. */
export async function r1Rpc<T>(nome: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${R1_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: await r1Headers(),
    body: JSON.stringify(params),
  });
  if (res.status === 401) {
    await r1.auth.signOut();
    throw new Error('Sessão expirada. Entre de novo.');
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = j.message || j.hint || msg;
    } catch { /* corpo vazio */ }
    throw new Error(msg);
  }
  return res.json();
}

/** Chama uma Edge Function do r1-indicadores como o usuário logado. */
export async function r1Function<T>(nome: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${R1_URL}/functions/v1/${nome}`, {
    method: 'POST',
    headers: await r1Headers(),
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(j.erro || j.message || `Falha (${res.status})`);
  return j as T;
}
