-- Usuários e permissões · edição manual completa (pedido da Joyce, 08/10/2026)
-- Aplicado em 08/10: identity.permissao_historico, public.usuario_excluir_registro e a Edge Function "usuarios" v8
-- (operações editar_email e excluir). PENDENTE: public.permissoes_salvar (bloqueada pelo modo automático do Claude;
-- aplicar manualmente no SQL Editor do Supabase quando Joyce decidir).
-- A exclusão e a troca de e-mail acontecem na Edge Function via API admin do Auth
-- (identity.perfil cai em cascata; o e-mail sincroniza pelo trigger on_auth_user_email_updated).

create table if not exists identity.permissao_historico (
  id bigserial primary key,
  alterado_por uuid,
  em timestamptz not null default now(),
  antes jsonb not null,
  depois jsonb not null
);

-- Histórico da exclusão + trava do último administrador ativo. Só a chave de serviço chama.
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

-- ===== PENDENTE (aplicar manualmente) =====
-- Matriz editável sem apagar linhas: identity.permissao ganha "ativo"; o que sai da matriz fica inativo.
alter table identity.permissao add column if not exists ativo boolean not null default true;

create or replace function identity.permitido(p_recurso text)
returns boolean language sql stable security definer set search_path to 'identity','pg_temp' as $$
  select exists (select 1 from identity.perfil p join identity.permissao x on x.papel = p.papel
    where p.user_id = auth.uid() and p.ativo and x.ativo and x.recurso = p_recurso)
$$;

create or replace function public.meu_perfil()
returns jsonb language sql stable security definer set search_path to 'identity','pg_temp' as $$
  select case when p.user_id is null then null else jsonb_build_object(
    'user_id', p.user_id, 'email', p.email, 'nome', p.nome, 'papel', p.papel, 'ativo', p.ativo, 'escopos', p.escopos,
    'permissoes', (select coalesce(jsonb_agg(x.recurso order by x.recurso), '[]'::jsonb) from identity.permissao x where x.papel = p.papel and x.ativo and p.ativo)
  ) end
  from (select 1) s left join identity.perfil p on p.user_id = auth.uid();
$$;

create or replace function public.permissoes_listar()
returns jsonb language sql stable security definer set search_path to 'identity','pg_temp' as $$
  select identity.exigir('usuarios');
  select coalesce(jsonb_object_agg(recurso, papeis), '{}'::jsonb) from (
    select recurso, jsonb_agg(papel order by papel) as papeis from identity.permissao where ativo group by recurso) x;
$$;

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
    from (select recurso, jsonb_agg(papel order by papel) papeis from identity.permissao where ativo group by recurso) x;
  with nova as (
    select distinct k.recurso, v.papel::identity.papel as papel
    from jsonb_each(p_matriz) k(recurso, lista) cross join lateral jsonb_array_elements_text(k.lista) v(papel))
  insert into identity.permissao (recurso, papel, ativo)
    select recurso, papel, true from nova
    on conflict (recurso, papel) do update set ativo = true;
  update identity.permissao x set ativo = false
    where x.ativo and not exists (
      select 1 from jsonb_each(p_matriz) k(recurso, lista) cross join lateral jsonb_array_elements_text(k.lista) v(papel)
      where k.recurso = x.recurso and v.papel = x.papel::text);
  select coalesce(jsonb_object_agg(recurso, papeis), '{}'::jsonb) into depois
    from (select recurso, jsonb_agg(papel order by papel) papeis from identity.permissao where ativo group by recurso) x;
  if antes is distinct from depois then
    insert into identity.permissao_historico (alterado_por, antes, depois) values (auth.uid(), antes, depois);
  end if;
  return depois;
end $$;
revoke all on function public.permissoes_salvar(jsonb) from public, anon;
grant execute on function public.permissoes_salvar(jsonb) to authenticated;
