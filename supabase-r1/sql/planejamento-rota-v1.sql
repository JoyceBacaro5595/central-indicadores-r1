-- Planejamento como orquestrador das metas de cada rota (pedido da Joyce, 13/10).
-- Uma linha por rota com as metas por cidade; o front usa essas metas nos cards, tabelas e Meta Global e,
-- se pedido, replica capacidade, meta de ingressos e meta de faturamento para os eventos da rota (via evento_salvar).
-- Para desfazer: drop function public.planejamento_salvar(text, jsonb); drop function public.planejamento_rotas(); drop table config.plano_rota;
create table if not exists config.plano_rota (
  rota text primary key,
  investimento numeric, vendas integer, cortesias integer, total_partic integer, capacidade integer,
  ticket numeric, cac numeric, cac_qualif numeric, qualif numeric, cpm numeric, ctr numeric,
  atualizado_em timestamptz not null default now(), atualizado_por text
);
alter table config.plano_rota enable row level security;

create or replace function public.planejamento_rotas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select identity.exigir('eventos');
  select coalesce(jsonb_agg(to_jsonb(p) order by p.rota), '[]'::jsonb) from config.plano_rota p;
$$;

create or replace function public.planejamento_salvar(p_rota text, p_metas jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform identity.exigir('gerenciador');
  if coalesce(trim(p_rota), '') = '' then raise exception 'rota obrigatória'; end if;
  insert into config.plano_rota as p (rota, investimento, vendas, cortesias, total_partic, capacidade, ticket, cac, cac_qualif, qualif, cpm, ctr, atualizado_em)
  values (trim(p_rota), (p_metas->>'investimento')::numeric, (p_metas->>'vendas')::int, (p_metas->>'cortesias')::int, (p_metas->>'total_partic')::int,
    (p_metas->>'capacidade')::int, (p_metas->>'ticket')::numeric, (p_metas->>'cac')::numeric, (p_metas->>'cac_qualif')::numeric,
    (p_metas->>'qualif')::numeric, (p_metas->>'cpm')::numeric, (p_metas->>'ctr')::numeric, now())
  on conflict (rota) do update set investimento = excluded.investimento, vendas = excluded.vendas, cortesias = excluded.cortesias,
    total_partic = excluded.total_partic, capacidade = excluded.capacidade, ticket = excluded.ticket, cac = excluded.cac,
    cac_qualif = excluded.cac_qualif, qualif = excluded.qualif, cpm = excluded.cpm, ctr = excluded.ctr, atualizado_em = now();
  return (select to_jsonb(x) from config.plano_rota x where x.rota = trim(p_rota));
end $$;

revoke all on function public.planejamento_rotas() from public, anon;
revoke all on function public.planejamento_salvar(text, jsonb) from public, anon;
grant execute on function public.planejamento_rotas() to authenticated;
grant execute on function public.planejamento_salvar(text, jsonb) to authenticated;
