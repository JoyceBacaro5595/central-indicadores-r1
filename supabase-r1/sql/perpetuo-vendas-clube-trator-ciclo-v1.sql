-- Perpétuo: vendas de Clube R1 e Trator pela tag do ciclo (rgv.vendas_clube_trator.evento_tag, ex.: "RGV 45").
-- Pedido da Joyce, 14/10. Função nova, só leitura; não altera perpetuo_vendas_clube_trator (por data de fechamento).
-- Aplicada em produção em 14/10/2026.
create or replace function public.perpetuo_vendas_clube_trator_ciclo(p_ciclo text)
returns jsonb language plpgsql security definer set search_path to 'rgv','public' as $function$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  perform identity.exigir('perpetuo');
  return (
    with v as (
      select * from rgv.vendas_clube_trator
      where etapa='Ganho' and upper(regexp_replace(coalesce(evento_tag,''),'\s','','g')) = upper(regexp_replace(coalesce(p_ciclo,''),'\s','','g'))
    ), atrib as (
      select v.deal_id, v.grupo, v.valor,
        coalesce(ad.campaign_id, cp.campaign_id) campanha_id,
        ad.lp_id lp_id,
        case when v.utm_term is not null then rgv.peca_chave(v.utm_term) end peca
      from v
      left join lateral (select a.campaign_id, a.lp_id from rgv.ad a
         where a.account_id='696363384474339' and lower(btrim(a.ad_name))=lower(btrim(v.utm_term))
         order by a.updated_at desc nulls last limit 1) ad on true
      left join lateral (select a.campaign_id from rgv.ad a
         where a.account_id='696363384474339' and lower(btrim(a.campaign_name))=lower(btrim(v.utm_campanha))
         order by a.updated_at desc nulls last limit 1) cp on true
    ), agg as (
      select 'campanha' dim, campanha_id chave, grupo, count(*) n, coalesce(sum(valor),0) fat from atrib where campanha_id is not null group by 1,2,3
      union all select 'lp', lp_id, grupo, count(*), coalesce(sum(valor),0) from atrib where lp_id is not null group by 1,2,3
      union all select 'peca', peca, grupo, count(*), coalesce(sum(valor),0) from atrib where peca is not null group by 1,2,3
    )
    select jsonb_build_object(
      'clube_r1',    jsonb_build_object('vendas', count(*) filter (where grupo='clube_r1'),    'faturamento', coalesce(sum(valor) filter (where grupo='clube_r1'),0)),
      'trator',      jsonb_build_object('vendas', count(*) filter (where grupo='trator'),      'faturamento', coalesce(sum(valor) filter (where grupo='trator'),0)),
      'sem_produto', jsonb_build_object('vendas', count(*) filter (where grupo='sem_produto'), 'faturamento', coalesce(sum(valor) filter (where grupo='sem_produto'),0)),
      'atualizado_em', (select max(carregado_em) from rgv.vendas_clube_trator),
      'atribuidas', jsonb_build_object(
        'campanha', count(*) filter (where campanha_id is not null),
        'lp',       count(*) filter (where lp_id is not null),
        'peca',     count(*) filter (where peca is not null)),
      'itens', coalesce((select jsonb_agg(jsonb_build_object('dim',dim,'chave',chave,'grupo',grupo,'vendas',n,'faturamento',fat)) from agg),'[]'::jsonb))
    from atrib);
end $function$;
revoke all on function public.perpetuo_vendas_clube_trator_ciclo(text) from public, anon;
grant execute on function public.perpetuo_vendas_clube_trator_ciclo(text) to authenticated;
