-- Atalho para atualizar tokens de integração dentro do app (pedido da Joyce, 16/10/2026).
-- O token novo é digitado na tela Integrações e logs (só quem tem a permissão 'gerenciador': gestor e administrador), enviado à Edge Function
-- integracoes-token, que testa o token no provedor e só então grava no cofre (vault.secrets, nome 'token_<chave>'). As cargas leem o token do cofre
-- primeiro e, se não houver, do segredo da função. O valor nunca volta para a tela nem entra em log; o log guarda só quem trocou, quando e o resultado.

create table if not exists config.integracao_token_log (
  id bigint generated always as identity primary key,
  chave text not null,
  por uuid,
  em timestamptz not null default now(),
  resultado text not null,
  detalhe text
);
alter table config.integracao_token_log enable row level security;
revoke all on config.integracao_token_log from anon, authenticated;

-- Catálogo das integrações que aceitam token pelo app.
create or replace function config.integracao_token_catalogo()
 returns table(chave text, rotulo text, fonte text, entidade text, segredo_funcao text)
 language sql immutable set search_path to ''
as $$ select * from (values
  ('meta_ads', 'Meta Ads · Máquina de Vendas', 'meta', 'ads', 'META_ADS_TOKEN')
) c(chave, rotulo, fonte, entidade, segredo_funcao) $$;

-- Estado de cada integração para a tela (sem nenhum valor de token).
create or replace function public.integracoes_tokens_status_v1()
 returns jsonb
 language sql stable security definer set search_path to ''
as $function$
  select identity.exigir('gerenciador');
  select coalesce(jsonb_agg(jsonb_build_object(
    'chave', c.chave, 'rotulo', c.rotulo,
    'no_cofre', s.id is not null,
    'atualizado_em', s.updated_at,
    'atualizado_por', (select p.nome from config.integracao_token_log l join identity.perfil p on p.user_id = l.por where l.chave = c.chave and l.resultado = 'ok' order by l.em desc limit 1),
    'ultimo_ok', (select max(g.finalizado_em) from raw.log_ingestao g where g.fonte = c.fonte and g.entidade = c.entidade and g.status = 'sucesso'),
    'ultimo_status', (select g.status from raw.log_ingestao g where g.fonte = c.fonte and g.entidade = c.entidade order by g.iniciado_em desc limit 1),
    'ultimo_erro', (select left(g.mensagem_erro, 240) from raw.log_ingestao g where g.fonte = c.fonte and g.entidade = c.entidade order by g.iniciado_em desc limit 1),
    'token_provavel', coalesce((select g.status = 'erro' and g.mensagem_erro ~* 'token|expired|session|oauth|permission' from raw.log_ingestao g where g.fonte = c.fonte and g.entidade = c.entidade order by g.iniciado_em desc limit 1), false)
  ) order by c.chave), '[]'::jsonb)
  from config.integracao_token_catalogo() c left join vault.secrets s on s.name = 'token_' || c.chave;
$function$;

-- Funções só da Edge Function (chave de serviço): ler e gravar o token no cofre.
create or replace function public.integracao_token_ler(p_chave text)
 returns text language sql stable security definer set search_path to ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'token_' || p_chave $$;

create or replace function public.integracao_token_gravar(p_chave text, p_token text, p_por uuid, p_detalhe text)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare v_id uuid;
begin
  if not exists (select 1 from config.integracao_token_catalogo() where chave = p_chave) then raise exception 'Integração desconhecida'; end if;
  select id into v_id from vault.secrets where name = 'token_' || p_chave;
  if v_id is null then
    perform vault.create_secret(p_token, 'token_' || p_chave, 'Token da integração ' || p_chave || ' (atualizado pelo app; nunca sai do banco)');
  else
    perform vault.update_secret(v_id, p_token, 'token_' || p_chave, 'Token da integração ' || p_chave || ' (atualizado pelo app; nunca sai do banco)');
  end if;
  insert into config.integracao_token_log (chave, por, resultado, detalhe) values (p_chave, p_por, 'ok', p_detalhe);
end $function$;

create or replace function public.integracao_token_registrar_falha(p_chave text, p_por uuid, p_detalhe text)
 returns void language sql security definer set search_path to ''
as $$ insert into config.integracao_token_log (chave, por, resultado, detalhe) values (p_chave, p_por, 'falha', left(p_detalhe, 300)) $$;

revoke all on function public.integracao_token_ler(text), public.integracao_token_gravar(text, text, uuid, text), public.integracao_token_registrar_falha(text, uuid, text) from public, anon, authenticated;
grant execute on function public.integracao_token_ler(text), public.integracao_token_gravar(text, text, uuid, text), public.integracao_token_registrar_falha(text, uuid, text) to service_role;
revoke all on function public.integracoes_tokens_status_v1() from public, anon;
grant execute on function public.integracoes_tokens_status_v1() to authenticated;
