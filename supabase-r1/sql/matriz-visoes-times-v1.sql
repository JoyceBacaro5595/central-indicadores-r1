-- Matriz de permissões com todas as visões + cadastro de times (pedido de Joyce, 09/10/2026)
-- Regras: ninguém perde nem ganha acesso na virada (os recursos novos copiam o acesso que a visão já tinha);
-- o administrador sempre mantém "usuarios"; toda mudança da matriz vai para identity.permissao_historico.
-- Aplicação: via apply_migration do Claude ou, se barrado, colado no SQL Editor do Supabase (idempotente).

-- 1) Catálogo de visões/recursos: toda visão nova do sistema entra aqui e aparece na matriz.
create table if not exists identity.recurso (
  chave text primary key,
  rotulo text not null,
  descricao text,
  ordem int not null default 100,
  ativo boolean not null default true
);
insert into identity.recurso (chave, rotulo, descricao, ordem) values
  ('painel',         'Visão geral (Central de ingressos)', 'Página inicial da Máquina de Vendas', 10),
  ('eventos',        'Eventos e metas',                   'Eventos, metas por evento e HubSpot', 20),
  ('relatorio',      'Relatório',                         'Relatório de ingressos', 30),
  ('exportar',       'Exportar CSV/PDF',                  'Botões de exportação', 40),
  ('presenca',       'Check-ins',                         'Presença e check-ins', 50),
  ('recuperacao',    'Recuperação',                       'Fila de recuperação de carrinho', 60),
  ('dados_pessoais', 'Ver dados pessoais',                'Nome, e-mail e telefone nas listas', 70),
  ('perpetuo',       'Fluxo Marketing (Perpétuo RGV)',    'Funil por campanha, criativo e página', 80),
  ('regras',         'Regras de segmentação',             'Regras e testes de segmentação', 90),
  ('gerenciador',    'Integrações e logs',                'Gerenciador de integrações e horários', 100),
  ('analista',       'Consulta SQL (analista de dados)',  'Catálogo e consultas do analista', 110),
  ('usuarios',       'Usuários e permissões',             'Gestão de acessos e matriz', 120)
on conflict (chave) do update set rotulo = excluded.rotulo, descricao = excluded.descricao, ordem = excluded.ordem;

-- 2) Matriz editável sem apagar linhas: o que sai da matriz fica inativo.
alter table identity.permissao add column if not exists ativo boolean not null default true;

-- 3) Recursos novos começam com o mesmo acesso que a visão já tinha:
--    perpetuo e eventos entravam por 'painel'; regras entrava por 'gerenciador'.
insert into identity.permissao (recurso, papel)
  select 'perpetuo', papel from identity.permissao where recurso = 'painel' and ativo
  union select 'eventos', papel from identity.permissao where recurso = 'painel' and ativo
  union select 'regras', papel from identity.permissao where recurso = 'gerenciador' and ativo
on conflict (recurso, papel) do nothing;

create or replace function identity.permitido(p_recurso text)
returns boolean language sql stable security definer set search_path to 'identity','pg_temp' as $$
  select exists (select 1 from identity.perfil p join identity.permissao x on x.papel = p.papel
    where p.user_id = auth.uid() and p.ativo and x.ativo and x.recurso = p_recurso)
$$;

-- 4) Times: cadastro próprio e campo no perfil (classificação; as permissões continuam por perfil).
create table if not exists identity.time (
  id serial primary key,
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
insert into identity.time (nome) values ('Comercial'), ('Marketing'), ('Diretoria'), ('CS')
on conflict (nome) do nothing;
alter table identity.perfil add column if not exists time_id int references identity.time(id);

create or replace function public.meu_perfil()
returns jsonb language sql stable security definer set search_path to 'identity','pg_temp' as $$
  select case when p.user_id is null then null else jsonb_build_object(
    'user_id', p.user_id, 'email', p.email, 'nome', p.nome, 'papel', p.papel, 'ativo', p.ativo, 'escopos', p.escopos,
    'time_id', p.time_id, 'time', (select t.nome from identity.time t where t.id = p.time_id),
    'permissoes', (select coalesce(jsonb_agg(x.recurso order by x.recurso), '[]'::jsonb) from identity.permissao x where x.papel = p.papel and x.ativo and p.ativo)
  ) end
  from (select 1) s left join identity.perfil p on p.user_id = auth.uid();
$$;

create or replace function public.usuarios_listar()
returns jsonb language sql stable security definer set search_path to 'identity','pg_temp' as $$
  select identity.exigir('usuarios');
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', p.user_id, 'email', p.email, 'nome', p.nome, 'papel', p.papel, 'ativo', p.ativo, 'escopos', p.escopos,
    'time_id', p.time_id, 'time', t.nome,
    'criado_em', p.criado_em, 'ultimo_login', u.last_sign_in_at, 'confirmado', u.email_confirmed_at is not null
  ) order by p.ativo desc, p.papel, p.email), '[]'::jsonb)
  from identity.perfil p left join auth.users u on u.id = p.user_id left join identity.time t on t.id = p.time_id;
$$;

-- p_time_id = 0 limpa o time; null mantém.
create or replace function public.usuario_atualizar(p_user_id uuid, p_nome text default null, p_papel text default null, p_ativo boolean default null, p_escopos jsonb default null, p_time_id int default null)
returns jsonb language plpgsql security definer set search_path to 'identity','pg_temp' as $$
declare antes identity.perfil; depois identity.perfil;
begin
  perform identity.exigir('usuarios');
  select * into antes from identity.perfil where user_id = p_user_id;
  if not found then raise exception 'Usuário não encontrado'; end if;
  if p_user_id = auth.uid() and ((p_papel is not null and p_papel <> 'administrador') or p_ativo = false) then
    raise exception 'Você não pode rebaixar nem desativar o próprio acesso';
  end if;
  update identity.perfil set
    nome = coalesce(p_nome, nome), papel = coalesce(p_papel::identity.papel, papel),
    ativo = coalesce(p_ativo, ativo), escopos = coalesce(p_escopos, escopos),
    time_id = case when p_time_id is null then time_id when p_time_id = 0 then null else p_time_id end,
    atualizado_em = now(), atualizado_por = auth.uid()
  where user_id = p_user_id returning * into depois;
  insert into identity.perfil_historico (user_id, alterado_por, antes, depois) values (p_user_id, auth.uid(), to_jsonb(antes), to_jsonb(depois));
  return to_jsonb(depois);
end $$;

create or replace function public.usuario_definir_papel(p_user_id uuid, p_papel text, p_nome text default null, p_por uuid default null, p_time_id int default null)
returns jsonb language plpgsql security definer set search_path to 'identity','pg_temp' as $$
declare antes identity.perfil; depois identity.perfil;
begin
  select * into antes from identity.perfil where user_id = p_user_id;
  if not found then
    insert into identity.perfil (user_id, email, nome, papel, time_id)
    select id, lower(email), coalesce(p_nome, split_part(email,'@',1)), p_papel::identity.papel, p_time_id from auth.users where id = p_user_id
    returning * into depois;
  else
    update identity.perfil set papel = p_papel::identity.papel, nome = coalesce(p_nome, nome), time_id = coalesce(p_time_id, time_id), atualizado_em = now(), atualizado_por = p_por
    where user_id = p_user_id returning * into depois;
  end if;
  insert into identity.perfil_historico (user_id, alterado_por, antes, depois) values (p_user_id, p_por, to_jsonb(antes), to_jsonb(depois));
  return to_jsonb(depois);
end $$;

create or replace function public.times_listar()
returns jsonb language sql stable security definer set search_path to 'identity','pg_temp' as $$
  select identity.exigir('usuarios');
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'ativo', ativo, 'pessoas', (select count(*) from identity.perfil p where p.time_id = t.id)) order by nome), '[]'::jsonb)
  from identity.time t;
$$;
grant execute on function public.times_listar() to authenticated;

-- p_id null cria; com id, renomeia/ativa/desativa. Desativar não apaga: as pessoas continuam vinculadas.
create or replace function public.time_salvar(p_id int default null, p_nome text default null, p_ativo boolean default null)
returns jsonb language plpgsql security definer set search_path to 'identity','pg_temp' as $$
declare r identity.time;
begin
  perform identity.exigir('usuarios');
  if p_id is null then
    if coalesce(btrim(p_nome), '') = '' then raise exception 'Informe o nome do time'; end if;
    insert into identity.time (nome) values (btrim(p_nome)) returning * into r;
  else
    update identity.time set nome = coalesce(nullif(btrim(p_nome), ''), nome), ativo = coalesce(p_ativo, ativo) where id = p_id returning * into r;
    if not found then raise exception 'Time não encontrado'; end if;
  end if;
  return to_jsonb(r);
end $$;
grant execute on function public.time_salvar(int, text, boolean) to authenticated;

-- 5) Matriz: leitura devolve o catálogo + a matriz; gravação valida contra o catálogo e registra histórico.
create or replace function public.permissoes_listar()
returns jsonb language sql stable security definer set search_path to 'identity','pg_temp' as $$
  select identity.exigir('usuarios');
  select jsonb_build_object(
    'recursos', (select coalesce(jsonb_agg(jsonb_build_object('chave', chave, 'rotulo', rotulo, 'descricao', descricao) order by ordem, chave), '[]'::jsonb) from identity.recurso where ativo),
    'matriz', (select coalesce(jsonb_object_agg(recurso, papeis), '{}'::jsonb) from (
      select recurso, jsonb_agg(papel order by papel) as papeis from identity.permissao where ativo group by recurso) x));
$$;

create or replace function public.permissoes_salvar(p_matriz jsonb)
returns jsonb language plpgsql security definer set search_path to 'identity','pg_temp' as $$
declare antes jsonb; depois jsonb; rec text; pap text;
begin
  perform identity.exigir('usuarios');
  if jsonb_typeof(p_matriz) <> 'object' then raise exception 'Matriz inválida'; end if;
  for rec in select jsonb_object_keys(p_matriz) loop
    if not exists (select 1 from identity.recurso where chave = rec and ativo) then raise exception 'Recurso desconhecido: %', rec; end if;
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
    where x.ativo and exists (select 1 from identity.recurso r where r.chave = x.recurso and r.ativo) and not exists (
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

-- 6) RPCs das visões que ganharam recurso próprio.
--    Perpétuo: rgv.read_front e rgv.fontes_atualizacao passam de exigir('painel') para exigir('perpetuo').
--    Eventos e metas: public.eventos_listar e public.meta_eventos passam para exigir('eventos').
--    Regras: public.segmentacao_regras_listar/_testar/_conflitos/_regra_salvar passam para exigir('regras').
--    (aplicado com create or replace das funções, só trocando o recurso exigido)
