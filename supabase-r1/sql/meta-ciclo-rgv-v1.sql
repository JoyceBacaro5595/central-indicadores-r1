-- Metas do ciclo do RGV cadastradas no calendário (pedido da Joyce, 16/10): uma linha por ciclo (ex.: "RGV 45").
-- As taxas são entre etapas, em %: conexão, qualificação, agendamento, comparecimento, fechamento e MQL → venda.
-- O Fluxo Marketing RGV usa essas metas na régua e nas cores das taxas.
-- Para desfazer: drop function public.meta_ciclo_listar(); drop function public.meta_ciclo_salvar(text, jsonb); drop table config.meta_ciclo;
create table if not exists config.meta_ciclo (
  ciclo text primary key,
  conexao numeric, qualificacao numeric, agendamento numeric, comparecimento numeric, fechamento numeric, mql_venda numeric,
  investimento numeric, vendas integer,
  atualizado_em timestamptz not null default now(), atualizado_por text
);
alter table config.meta_ciclo enable row level security;

create or replace function public.meta_ciclo_listar() returns jsonb
language sql stable security definer set search_path = '' as $$
  select identity.exigir('perpetuo');
  select coalesce(jsonb_agg(to_jsonb(m) - 'atualizado_por' order by m.ciclo), '[]'::jsonb) from config.meta_ciclo m;
$$;

create or replace function public.meta_ciclo_salvar(p_ciclo text, p_metas jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_ciclo text := trim(p_ciclo);
begin
  perform identity.exigir('gerenciador');
  if coalesce(v_ciclo, '') = '' then raise exception 'ciclo obrigatório'; end if;
  insert into config.meta_ciclo as m (ciclo, conexao, qualificacao, agendamento, comparecimento, fechamento, mql_venda, investimento, vendas, atualizado_em, atualizado_por)
  values (v_ciclo, (p_metas->>'conexao')::numeric, (p_metas->>'qualificacao')::numeric, (p_metas->>'agendamento')::numeric,
    (p_metas->>'comparecimento')::numeric, (p_metas->>'fechamento')::numeric, (p_metas->>'mql_venda')::numeric,
    (p_metas->>'investimento')::numeric, (p_metas->>'vendas')::int, now(), auth.uid()::text)
  on conflict (ciclo) do update set conexao = excluded.conexao, qualificacao = excluded.qualificacao, agendamento = excluded.agendamento,
    comparecimento = excluded.comparecimento, fechamento = excluded.fechamento, mql_venda = excluded.mql_venda,
    investimento = excluded.investimento, vendas = excluded.vendas, atualizado_em = now(), atualizado_por = auth.uid()::text;
  return (select to_jsonb(x) - 'atualizado_por' from config.meta_ciclo x where x.ciclo = v_ciclo);
end $$;
revoke execute on function public.meta_ciclo_listar() from public, anon;
revoke execute on function public.meta_ciclo_salvar(text, jsonb) from public, anon;
