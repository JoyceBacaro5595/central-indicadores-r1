-- Usuários e permissões · edição manual completa (pedido da Joyce, 08/10/2026)
-- Novas RPCs: permissoes_salvar (matriz editável pelo administrador, com histórico)
-- e usuario_excluir_registro (histórico da exclusão; só a Edge Function "usuarios", com a chave de serviço).
-- A exclusão em si e a troca de e-mail acontecem na Edge Function via API admin do Auth
-- (identity.perfil cai em cascata; o e-mail sincroniza pelo trigger on_auth_user_email_updated).

create table if not exists identity.permissao_historico (
  id bigserial primary key,
  alterado_por uuid,
  em timestamptz not null default now(),
  antes jsonb not null,
  depois jsonb not null
);

create or replace function public.permissoes_salvar(p_matriz jsonb)
returns jsonb language plpgsql security definer set search_path to 'identity','pg_temp' as $$
declare antes jsonb; depois jsonb; rec text; pap text; recursos_validos text[] := array['painel','relatorio','exportar','gerenciador','recuperacao','presenca','dados_pessoais','usuarios'];
begin
  perform identity.exigir('usuarios');
  if jsonb_typeof(p_matriz) <> 'object' then raise exception 'Matriz inválida'; end if;
  for rec in select jsonb_object_keys(p_matriz) loop
    if not rec = any(recursos_validos) then raise exception 'Recurso desconhecido: %', rec; end if;
    if jsonb_typeof(p_matriz->rec) <> 'array' then raise exception 'Lista de perfis inválida em %', rec; end if;
    for pap in select jsonb_array_elements_text(p_matriz->rec) loop
      if pap not in ('administrador','gestor','analista','atendente','consulta') then raise exception 'Perfil desconhecido: %', pap; end if;
    end loop;
  end loop;
  if not (p_matriz->'usuarios') ? 'administrador' then raise exception 'O administrador precisa manter "Usuários e permissões"'; end if;
  select coalesce(jsonb_object_agg(recurso, papeis), '{}'::jsonb) into antes
    from (select recurso, jsonb_agg(papel order by papel) papeis from identity.permissao group by recurso) x;
  delete from identity.permissao;
  insert into identity.permissao (recurso, papel)
    select distinct k.recurso, v.papel::identity.papel
    from jsonb_each(p_matriz) k(recurso, lista) cross join lateral jsonb_array_elements_text(k.lista) v(papel);
  select coalesce(jsonb_object_agg(recurso, papeis), '{}'::jsonb) into depois
    from (select recurso, jsonb_agg(papel order by papel) papeis from identity.permissao group by recurso) x;
  insert into identity.permissao_historico (alterado_por, antes, depois) values (auth.uid(), antes, depois);
  return depois;
end $$;
revoke all on function public.permissoes_salvar(jsonb) from public, anon;
grant execute on function public.permissoes_salvar(jsonb) to authenticated;

create or replace function public.usuario_excluir_registro(p_user_id uuid, p_por uuid)
returns jsonb language plpgsql security definer set search_path to 'identity','pg_temp' as $$
declare antes identity.perfil;
begin
  select * into antes from identity.perfil where user_id = p_user_id;
  if not found then raise exception 'Usuário não encontrado'; end if;
  if antes.papel = 'administrador' and antes.ativo
     and (select count(*) from identity.perfil where papel = 'administrador' and ativo) <= 1 then
    raise exception 'Não é possível excluir o último administrador ativo';
  end if;
  insert into identity.perfil_historico (user_id, alterado_por, antes, depois) values (p_user_id, p_por, to_jsonb(antes), null);
  return to_jsonb(antes);
end $$;
revoke all on function public.usuario_excluir_registro(uuid, uuid) from public, anon, authenticated;
grant execute on function public.usuario_excluir_registro(uuid, uuid) to service_role;
