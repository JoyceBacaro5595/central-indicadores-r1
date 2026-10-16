-- Agenda do grupo guardada na Central (pedido da Joyce, 16/10): a planilha "R1 | Agenda 2026" é importada uma vez
-- e, a partir daí, as edições feitas na Central permanecem (a importação nunca sobrescreve nem recria o que já existe).
-- Evento excluído fica com ativo=false (não volta numa nova importação). Evento editado fica com editado=true.
-- Para desfazer: drop function public.agenda_listar(); drop function public.agenda_importar(jsonb); drop function public.agenda_salvar(bigint, text, text, text, text, date, date); drop function public.agenda_excluir(bigint); drop table config.agenda_evento;
create table if not exists config.agenda_evento (
  id bigint generated always as identity primary key,
  cat text not null, titulo text not null, local text, hora text,
  inicio date not null, fim date not null,
  origem text not null default 'central' check (origem in ('planilha', 'central')),
  chave text unique,
  ativo boolean not null default true, editado boolean not null default false,
  atualizado_em timestamptz not null default now(), atualizado_por text,
  check (fim >= inicio)
);
alter table config.agenda_evento enable row level security;

create or replace function public.agenda_listar() returns jsonb
language sql stable security definer set search_path = '' as $$
  select identity.exigir('eventos');
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'cat', e.cat, 'titulo', e.titulo, 'local', coalesce(e.local, ''), 'hora', coalesce(e.hora, ''),
    'inicio', e.inicio, 'fim', e.fim, 'origem', e.origem) order by e.inicio, e.id), '[]'::jsonb)
  from config.agenda_evento e where e.ativo;
$$;

-- Importa os eventos da planilha que ainda não existem (pela chave cat|titulo|local|inicio). Não altera nada que já esteja na tabela.
create or replace function public.agenda_importar(p_eventos jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer;
begin
  perform identity.exigir('gerenciador');
  with novos as (
    insert into config.agenda_evento (cat, titulo, local, hora, inicio, fim, origem, chave, atualizado_por)
    select x->>'cat', x->>'titulo', nullif(x->>'local', ''), nullif(x->>'hora', ''), (x->>'inicio')::date, coalesce(nullif(x->>'fim', ''), x->>'inicio')::date, 'planilha',
      concat_ws('|', x->>'cat', x->>'titulo', coalesce(x->>'local', ''), x->>'inicio'), auth.uid()::text
    from jsonb_array_elements(p_eventos) x
    where coalesce(x->>'titulo', '') <> '' and coalesce(x->>'inicio', '') <> ''
    on conflict (chave) do nothing returning 1)
  select count(*) into v_n from novos;
  return v_n;
end $$;

create or replace function public.agenda_salvar(p_id bigint, p_cat text, p_titulo text, p_local text, p_hora text, p_inicio date, p_fim date) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform identity.exigir('gerenciador');
  if coalesce(trim(p_titulo), '') = '' then raise exception 'título obrigatório'; end if;
  if p_inicio is null then raise exception 'data obrigatória'; end if;
  if coalesce(p_fim, p_inicio) < p_inicio then raise exception 'o fim não pode ser antes do início'; end if;
  if p_id is null then
    insert into config.agenda_evento (cat, titulo, local, hora, inicio, fim, origem, editado, atualizado_por)
    values (p_cat, trim(p_titulo), nullif(trim(p_local), ''), nullif(trim(p_hora), ''), p_inicio, coalesce(p_fim, p_inicio), 'central', true, auth.uid()::text) returning id into v_id;
  else
    update config.agenda_evento set cat = p_cat, titulo = trim(p_titulo), local = nullif(trim(p_local), ''), hora = nullif(trim(p_hora), ''),
      inicio = p_inicio, fim = coalesce(p_fim, p_inicio), editado = true, ativo = true, atualizado_em = now(), atualizado_por = auth.uid()::text
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'evento não encontrado'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.agenda_excluir(p_id bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform identity.exigir('gerenciador');
  update config.agenda_evento set ativo = false, editado = true, atualizado_em = now(), atualizado_por = auth.uid()::text where id = p_id;
end $$;

revoke all on function public.agenda_listar() from public, anon;
revoke all on function public.agenda_importar(jsonb) from public, anon;
revoke all on function public.agenda_salvar(bigint, text, text, text, text, date, date) from public, anon;
revoke all on function public.agenda_excluir(bigint) from public, anon;
grant execute on function public.agenda_listar() to authenticated;
grant execute on function public.agenda_importar(jsonb) to authenticated;
grant execute on function public.agenda_salvar(bigint, text, text, text, text, date, date) to authenticated;
grant execute on function public.agenda_excluir(bigint) to authenticated;
