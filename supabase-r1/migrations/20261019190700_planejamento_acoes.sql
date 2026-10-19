-- Ações do Planejamento (pedido da Joyce, 19/10): cada rota tem uma lista de ações com investimento e campanhas do Meta.
-- Quando uma ação não anda como o planejado, a troca encerra a antiga (o gasto e os indicadores até ali ficam nela) e cria a nova ligada a ela, com motivo, data e quem trocou.
-- O investimento total da rota é a soma das ações, então nada do gasto já feito some. Indicadores por ação = soma das campanhas ligadas (raw.meta_ads_insight, mensal por campanha).
-- Para desfazer: drop function public.planejamento_acao_detalhe(bigint); drop function public.planejamento_acao_excluir(bigint); drop function public.planejamento_acao_trocar(bigint, text, numeric, text[], text, date);
--   drop function public.planejamento_acao_salvar(bigint, text, text, numeric, date, date, text[], boolean); drop function public.planejamento_campanhas(); drop function public.planejamento_acoes(text); drop table config.plano_rota_acao;
create table if not exists config.plano_rota_acao (
  id bigint generated always as identity primary key,
  rota text not null,
  nome text not null,
  investimento_planejado numeric not null default 0 check (investimento_planejado >= 0),
  inicio date not null,
  fim date,
  status text not null default 'ativa' check (status in ('ativa', 'encerrada')),
  ativo boolean not null default true,
  campanhas text[] not null default '{}',
  motivo text,
  acao_anterior_id bigint references config.plano_rota_acao (id),
  criado_em timestamptz not null default now(),
  criado_por uuid, criado_nome text,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  check (fim is null or fim >= inicio)
);
create index if not exists plano_rota_acao_rota_idx on config.plano_rota_acao (rota, inicio);
alter table config.plano_rota_acao enable row level security;

create or replace function public.planejamento_acoes(p_rota text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select identity.exigir('eventos');
  select coalesce(jsonb_agg(to_jsonb(a) order by a.rota, a.inicio, a.id), '[]'::jsonb)
  from config.plano_rota_acao a where p_rota is null or a.rota = p_rota;
$$;

-- Campanhas do Meta conhecidas (nome e gasto acumulado), para escolher ao criar ou trocar uma ação.
create or replace function public.planejamento_campanhas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select identity.exigir('eventos');
  select coalesce(jsonb_agg(to_jsonb(c) order by c.gasto desc), '[]'::jsonb) from (
    select i.objeto_id as id, max(i.payload ->> 'name') as nome,
      round(sum(coalesce(nullif(i.payload -> 'amount_spent' ->> 'value', '')::numeric, 0)), 2) as gasto
    from (select distinct on (objeto_id, data) * from raw.meta_ads_insight where nivel = 'campaign' order by objeto_id, data, capturado_em desc) i
    group by i.objeto_id) c;
$$;

create or replace function public.planejamento_acao_salvar(p_id bigint, p_rota text, p_nome text, p_investimento numeric, p_inicio date, p_fim date, p_campanhas text[], p_ativo boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint := p_id;
begin
  perform identity.exigir('gerenciador');
  if coalesce(trim(p_nome), '') = '' then raise exception 'nome da ação obrigatório'; end if;
  if v_id is null then
    if coalesce(trim(p_rota), '') = '' then raise exception 'rota obrigatória'; end if;
    insert into config.plano_rota_acao (rota, nome, investimento_planejado, inicio, fim, campanhas, ativo, criado_por, criado_nome)
    values (trim(p_rota), trim(p_nome), coalesce(p_investimento, 0), p_inicio, p_fim, coalesce(p_campanhas, '{}'), coalesce(p_ativo, true), auth.uid(),
      (select coalesce(nome, email) from identity.perfil where user_id = auth.uid()))
    returning id into v_id;
  else
    update config.plano_rota_acao set nome = trim(p_nome), investimento_planejado = coalesce(p_investimento, 0), inicio = p_inicio, fim = p_fim,
      campanhas = coalesce(p_campanhas, '{}'), ativo = coalesce(p_ativo, true), atualizado_em = now(), atualizado_por = auth.uid()
    where id = v_id;
    if not found then raise exception 'ação não encontrada'; end if;
  end if;
  return (select to_jsonb(a) from config.plano_rota_acao a where a.id = v_id);
end $$;

-- Troca: encerra a ação antiga na data informada (mantém tudo o que ela já gastou e gerou) e cria a nova ligada a ela.
create or replace function public.planejamento_acao_trocar(p_id_antiga bigint, p_nome text, p_investimento numeric, p_campanhas text[], p_motivo text, p_data date default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_ant config.plano_rota_acao; v_data date := coalesce(p_data, current_date); v_novo bigint;
begin
  perform identity.exigir('gerenciador');
  if coalesce(trim(p_nome), '') = '' then raise exception 'nome da nova ação obrigatório'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'informe o motivo da troca'; end if;
  select * into v_ant from config.plano_rota_acao where id = p_id_antiga for update;
  if not found then raise exception 'ação não encontrada'; end if;
  if v_ant.status <> 'ativa' then raise exception 'só dá para trocar uma ação ativa'; end if;
  if v_data < v_ant.inicio then raise exception 'a data da troca não pode ser anterior ao início da ação'; end if;
  update config.plano_rota_acao set status = 'encerrada', fim = v_data, atualizado_em = now(), atualizado_por = auth.uid() where id = v_ant.id;
  insert into config.plano_rota_acao (rota, nome, investimento_planejado, inicio, campanhas, motivo, acao_anterior_id, criado_por, criado_nome)
  values (v_ant.rota, trim(p_nome), coalesce(p_investimento, 0), v_data, coalesce(p_campanhas, '{}'), trim(p_motivo), v_ant.id, auth.uid(),
    (select coalesce(nome, email) from identity.perfil where user_id = auth.uid()))
  returning id into v_novo;
  return (select to_jsonb(a) from config.plano_rota_acao a where a.id = v_novo);
end $$;

create or replace function public.planejamento_acao_excluir(p_id bigint) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform identity.exigir('gerenciador');
  if exists (select 1 from config.plano_rota_acao where acao_anterior_id = p_id) then
    raise exception 'esta ação foi trocada por outra e faz parte do histórico; desative em vez de excluir';
  end if;
  delete from config.plano_rota_acao where id = p_id;
  return jsonb_build_object('excluida', found);
end $$;

-- Indicadores da ação: soma das campanhas ligadas nos meses que a ação cobre (o Meta chega por campanha e mês).
create or replace function public.planejamento_acao_detalhe(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_a config.plano_rota_acao; v jsonb;
begin
  perform identity.exigir('eventos');
  select * into v_a from config.plano_rota_acao where id = p_id;
  if not found then raise exception 'ação não encontrada'; end if;
  select jsonb_build_object(
    'acao_id', v_a.id, 'de', date_trunc('month', v_a.inicio)::date, 'ate', coalesce(v_a.fim, current_date),
    'gasto', round(coalesce(sum(g), 0), 2), 'impressoes', coalesce(sum(imp), 0), 'cliques', coalesce(sum(cl), 0),
    'lpv', coalesce(sum(lpv), 0), 'checkouts', coalesce(sum(co), 0), 'compras', coalesce(sum(cp), 0),
    'campanhas', coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'gasto', round(g, 2), 'compras', cp) order by g desc), '[]'::jsonb))
  into v from (
    select i.objeto_id as id, max(i.payload ->> 'name') as nome,
      sum(coalesce(nullif(i.payload -> 'amount_spent' ->> 'value', '')::numeric, 0)) as g,
      sum(coalesce(nullif(i.payload ->> 'impressions', '')::numeric, 0)) as imp,
      sum(coalesce(nullif(i.payload ->> 'link_click', '')::numeric, 0)) as cl,
      sum(coalesce(nullif(i.payload ->> 'lpv', '')::numeric, 0)) as lpv,
      sum(coalesce(nullif(i.payload ->> 'checkouts', '')::numeric, 0)) as co,
      sum(coalesce(nullif(i.payload ->> 'omni_purchase', '')::numeric, 0)) as cp
    from (select distinct on (objeto_id, data) * from raw.meta_ads_insight where nivel = 'campaign' order by objeto_id, data, capturado_em desc) i
    where i.objeto_id = any (v_a.campanhas) and i.data >= date_trunc('month', v_a.inicio)::date and i.data <= coalesce(v_a.fim, current_date)
    group by i.objeto_id) x;
  return v;
end $$;

revoke all on function public.planejamento_acoes(text) from public, anon;
revoke all on function public.planejamento_campanhas() from public, anon;
revoke all on function public.planejamento_acao_salvar(bigint, text, text, numeric, date, date, text[], boolean) from public, anon;
revoke all on function public.planejamento_acao_trocar(bigint, text, numeric, text[], text, date) from public, anon;
revoke all on function public.planejamento_acao_excluir(bigint) from public, anon;
revoke all on function public.planejamento_acao_detalhe(bigint) from public, anon;
grant execute on function public.planejamento_acoes(text), public.planejamento_campanhas(), public.planejamento_acao_salvar(bigint, text, text, numeric, date, date, text[], boolean),
  public.planejamento_acao_trocar(bigint, text, numeric, text[], text, date), public.planejamento_acao_excluir(bigint), public.planejamento_acao_detalhe(bigint) to authenticated;

-- Mix de ingressos por venda (único, duplo, triplo), pedido da Joyce em 19/10. Aplicado como migrações separadas no Supabase:
--   alter table config.plano_rota add column pct_unico/pct_duplo/pct_triplo numeric (0 a 100);
--   planejamento_salvar passa a gravar o mix e recusa quando a soma não dá 100%.
