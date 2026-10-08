create or replace function rgv.refresh_exact_ad_attribution_v1(p_deal_ids text[])
returns jsonb language plpgsql security invoker set search_path='' as $f$
declare n bigint;begin
with d as materialized(select f.deal_id,f.campaign_id,f.attribution_status,x.utm_content from rgv.crm_funnel_deal_v1 f join rgv.deal x using(deal_id) where f.campaign_ff and (p_deal_ids is null or f.deal_id=any(p_deal_ids))),
candidates as (
 select d.deal_id,count(a.ad_id) n,min(a.ad_id) ad_id,min(a.creative_id) creative_id
 from d left join rgv.ad a on d.campaign_id=a.campaign_id and a.account_id='696363384474339' and nullif(btrim(d.utm_content),'')=a.ad_name
 group by d.deal_id
)
insert into rgv.attribution(deal_id,account_id,ad_id,lp_id,method,status,reason,verified_at)
select d.deal_id,case when c.n=1 and c.creative_id is not null then '696363384474339' end,
case when c.n=1 and c.creative_id is not null then c.ad_id end,null,
'auto_exact_campaign_content_v1',
case when d.campaign_id is null or nullif(btrim(d.utm_content),'') is null or c.n=0 then 'unmatched' when c.n>1 then 'ambiguous' when c.creative_id is null then 'pending' else 'verified' end,
case when d.campaign_id is null then 'Campanha sem correspondência exata e única.'
when nullif(btrim(d.utm_content),'') is null then 'utm_content ausente.'
when c.n=0 then 'utm_content não corresponde exatamente a nome de anúncio nesta campanha; pode identificar conjunto.'
when c.n>1 then 'Nome de anúncio repetido dentro da campanha: atribuição ambígua.'
when c.creative_id is null then 'Anúncio único, mas creative_id ainda não coletado.'
else 'Campanha comprovada e utm_content exatamente igual a nome único de anúncio; creative_id confirmado. LP não atribuída: destino de anúncio não comprova página de conversão.' end,
case when c.n=1 and c.creative_id is not null then now() end
from d join candidates c using(deal_id)
on conflict(deal_id) do update set account_id=excluded.account_id,ad_id=excluded.ad_id,lp_id=excluded.lp_id,status=excluded.status,reason=excluded.reason,verified_at=excluded.verified_at
where rgv.attribution.method='auto_exact_campaign_content_v1';
get diagnostics n=row_count;return jsonb_build_object('rows',n);
end $f$;
revoke all on function rgv.refresh_exact_ad_attribution_v1(text[]) from public,anon,authenticated;

create or replace function rgv.refresh_exact_ad_attribution_v1() returns jsonb language sql security invoker set search_path='' as $$select rgv.refresh_exact_ad_attribution_v1(null::text[])$$;revoke all on function rgv.refresh_exact_ad_attribution_v1() from public,anon,authenticated;