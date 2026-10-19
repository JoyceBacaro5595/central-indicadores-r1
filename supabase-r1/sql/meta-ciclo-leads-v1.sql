-- Meta de leads do ciclo (Joyce, 19/10): coluna nova em config.meta_ciclo; meta_ciclo_salvar passa a gravar `leads`.
-- Ciclo 45 cadastrado com o plano da Lovable do RGV (3.200 leads, R$ 1.050.000, 80 vendas). Aplicada como migration meta_ciclo_leads_v1.
-- Para desfazer: alter table config.meta_ciclo drop column leads; (e restaurar meta_ciclo_salvar de meta-ciclo-rgv-v1.sql)
alter table config.meta_ciclo add column if not exists leads integer;

create or replace function public.meta_ciclo_salvar(p_ciclo text, p_metas jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_ciclo text := trim(p_ciclo);
begin
  perform identity.exigir('gerenciador');
  if coalesce(v_ciclo, '') = '' then raise exception 'ciclo obrigatório'; end if;
  insert into config.meta_ciclo as m (ciclo, conexao, qualificacao, agendamento, comparecimento, fechamento, mql_venda, investimento, vendas, leads, atualizado_em, atualizado_por)
  values (v_ciclo, (p_metas->>'conexao')::numeric, (p_metas->>'qualificacao')::numeric, (p_metas->>'agendamento')::numeric,
    (p_metas->>'comparecimento')::numeric, (p_metas->>'fechamento')::numeric, (p_metas->>'mql_venda')::numeric,
    (p_metas->>'investimento')::numeric, (p_metas->>'vendas')::int, (p_metas->>'leads')::int, now(), auth.uid()::text)
  on conflict (ciclo) do update set conexao = excluded.conexao, qualificacao = excluded.qualificacao, agendamento = excluded.agendamento,
    comparecimento = excluded.comparecimento, fechamento = excluded.fechamento, mql_venda = excluded.mql_venda,
    investimento = excluded.investimento, vendas = excluded.vendas, leads = excluded.leads, atualizado_em = now(), atualizado_por = auth.uid()::text;
  return (select to_jsonb(x) - 'atualizado_por' from config.meta_ciclo x where x.ciclo = v_ciclo);
end $$;
