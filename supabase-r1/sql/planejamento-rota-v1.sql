-- Planejamento como orquestrador das metas de cada rota (pedido da Joyce, 13/10).
-- Uma linha por rota com as metas por cidade; o front usa essas metas nos cards, tabelas e Meta Global e,
-- se pedido, replica capacidade, meta de ingressos e meta de faturamento para os eventos da rota (via evento_salvar).
-- Cada salvamento grava em config.plano_rota_historico o que mudou (campo, antes, depois), quem alterou e quando (mesmo padrão de identity.perfil_historico).
-- Para desfazer: drop function public.planejamento_historico(text); drop function public.planejamento_salvar(text, jsonb); drop function public.planejamento_rotas(); drop table config.plano_rota_historico; drop table config.plano_rota;
create table if not exists config.plano_rota (
  rota text primary key,
  investimento numeric, vendas integer, cortesias integer, total_partic integer, capacidade integer,
  ticket numeric, cac numeric, cac_qualif numeric, qualif numeric, cpm numeric, ctr numeric,
  connect numeric, conv_pagina numeric, conv_checkout numeric, dias_captacao integer, dias_producao integer, cidades jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(), atualizado_por text
);
alter table config.plano_rota enable row level security;

create table if not exists config.plano_rota_historico (
  id bigint generated always as identity primary key,
  rota text not null, em timestamptz not null default now(),
  alterado_por uuid, alterado_nome text,
  antes jsonb, depois jsonb not null
);
alter table config.plano_rota_historico enable row level security;

create or replace function public.planejamento_rotas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select identity.exigir('eventos');
  select coalesce(jsonb_agg(to_jsonb(p) order by p.rota), '[]'::jsonb) from config.plano_rota p;
$$;

create or replace function public.planejamento_salvar(p_rota text, p_metas jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_rota text := trim(p_rota); v_antes jsonb; v_depois jsonb;
begin
  perform identity.exigir('gerenciador');
  if coalesce(v_rota, '') = '' then raise exception 'rota obrigatória'; end if;
  select to_jsonb(x) - 'atualizado_em' - 'atualizado_por' into v_antes from config.plano_rota x where x.rota = v_rota;
  insert into config.plano_rota as p (rota, investimento, vendas, cortesias, total_partic, capacidade, ticket, cac, cac_qualif, qualif, cpm, ctr, connect, conv_pagina, conv_checkout, dias_captacao, dias_producao, cidades, atualizado_em, atualizado_por)
  values (v_rota, (p_metas->>'investimento')::numeric, (p_metas->>'vendas')::int, (p_metas->>'cortesias')::int, (p_metas->>'total_partic')::int,
    (p_metas->>'capacidade')::int, (p_metas->>'ticket')::numeric, (p_metas->>'cac')::numeric, (p_metas->>'cac_qualif')::numeric,
    (p_metas->>'qualif')::numeric, (p_metas->>'cpm')::numeric, (p_metas->>'ctr')::numeric,
    (p_metas->>'connect')::numeric, (p_metas->>'conv_pagina')::numeric, (p_metas->>'conv_checkout')::numeric, (p_metas->>'dias_captacao')::int, (p_metas->>'dias_producao')::int,
    coalesce(p_metas->'cidades', '[]'::jsonb), now(), auth.uid()::text)
  on conflict (rota) do update set investimento = excluded.investimento, vendas = excluded.vendas, cortesias = excluded.cortesias,
    total_partic = excluded.total_partic, capacidade = excluded.capacidade, ticket = excluded.ticket, cac = excluded.cac,
    cac_qualif = excluded.cac_qualif, qualif = excluded.qualif, cpm = excluded.cpm, ctr = excluded.ctr, connect = excluded.connect, conv_pagina = excluded.conv_pagina,
    conv_checkout = excluded.conv_checkout, dias_captacao = excluded.dias_captacao, dias_producao = excluded.dias_producao, cidades = excluded.cidades,
    atualizado_em = now(), atualizado_por = auth.uid()::text;
  select to_jsonb(x) - 'atualizado_em' - 'atualizado_por' into v_depois from config.plano_rota x where x.rota = v_rota;
  if v_antes is distinct from v_depois then
    insert into config.plano_rota_historico (rota, alterado_por, alterado_nome, antes, depois)
    values (v_rota, auth.uid(), (select coalesce(nome, email) from identity.perfil where user_id = auth.uid()), v_antes, v_depois);
  end if;
  return (select to_jsonb(x) from config.plano_rota x where x.rota = v_rota);
end $$;

-- Histórico de alterações: uma linha por campo que mudou (antes e depois), mais recentes primeiro.
create or replace function public.planejamento_historico(p_rota text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select identity.exigir('eventos');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.em desc, x.campo), '[]'::jsonb) from (
    select h.rota, h.em, h.alterado_nome as quem, d.key as campo, h.antes -> d.key as antes, d.value as depois
    from config.plano_rota_historico h
    cross join lateral jsonb_each(h.depois) d
    where (p_rota is null or h.rota = p_rota) and (h.antes is null or h.antes -> d.key is distinct from d.value)
    order by h.em desc limit 300) x;
$$;

revoke all on function public.planejamento_rotas() from public, anon;
revoke all on function public.planejamento_salvar(text, jsonb) from public, anon;
revoke all on function public.planejamento_historico(text) from public, anon;
grant execute on function public.planejamento_rotas() to authenticated;
grant execute on function public.planejamento_salvar(text, jsonb) to authenticated;
grant execute on function public.planejamento_historico(text) to authenticated;
