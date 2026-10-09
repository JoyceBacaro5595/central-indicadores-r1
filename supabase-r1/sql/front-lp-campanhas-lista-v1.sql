-- Painel da página (Joyce, 09/10/2026: "Páginas"): lista das campanhas que levam à página, com o investimento do período.
-- rgv.lp_campanhas_lista devolve [{id, nome, investimento, status}] das campanhas com anúncios nesta página e coleta de
-- mídia no período, maior investimento primeiro. read_front passa a incluí-la em por_lp.campanhas_lista.
create or replace function rgv.lp_campanhas_lista(p_de date, p_ate date, p_lp text)
returns jsonb language sql stable set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.campaign_id,'nome',c.nome,'investimento',c.invest,'status',c.st) order by c.invest desc nulls last, c.nome),'[]'::jsonb)
  from (
    select a.campaign_id, max(a.campaign_name) nome, sum(d.spend) invest,
           case when bool_or(a.campaign_status='ACTIVE') then 'no_ar' when bool_or(a.campaign_status is not null) then 'pausado' end st
    from rgv.ad a join rgv.ad_daily d on d.account_id=a.account_id and d.ad_id=a.ad_id and d.day between p_de and p_ate
    where a.account_id='696363384474339' and a.lp_id=p_lp
    group by a.campaign_id
  ) c;
$$;
revoke all on function rgv.lp_campanhas_lista(date,date,text) from public, anon, authenticated;

do $$ declare d text; begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname='read_front' and p.pronamespace='rgv'::regnamespace;
  if position('campanhas_lista' in d)=0 then
    d:=replace(d,'rgv.aggregate_dimension_media(de,ate,''lp'',q.entity_id,parcial) base','rgv.aggregate_dimension_media(de,ate,''lp'',q.entity_id,parcial) || jsonb_build_object(''campanhas_lista'',rgv.lp_campanhas_lista(de,ate,q.entity_id)) base');
    if position('campanhas_lista' in d)=0 then raise exception 'trecho de por_lp não encontrado'; end if;
    execute d;
  end if;
end $$;
