-- Private derived layer. Raw HubSpot data and history are never rewritten.
create or replace view rgv.crm_funnel_deal_v1 with (security_invoker=true) as
with eligible as (
 select d.*,
 coalesce(d.product ~* '(^|[^[:alnum:]])RGV[[:space:]]*[0-9]+([^0-9]|$)' and d.product !~* 'processos',false) product_rgv,
 strpos(upper(coalesce(d.utm_campaign,'')),'[FF]')>0 campaign_ff
 from rgv.deal d
 where d.pipeline_id in ('749390743','746355509')
 and d.created_at >= '2026-01-01 00:00:00 America/Sao_Paulo'::timestamptz
), history as (
 select e.deal_id, e.stage_id, e.pipeline_id,e.entered_at from rgv.stage_event e
 union all
 select d.deal_id,d.current_stage_id,d.pipeline_id,d.current_stage_entered_at
 from eligible d
), facts as (
 select h.deal_id,
 min(h.entered_at) filter(where h.pipeline_id='749390743' and h.stage_id in
 ('1089131932','1386314639','1089131933','1089131934','1089131935','1089131936','1089186215','1320560225','1089186216','1089186217','1089186218','1089131958','1089131959','1089131960','1089131961','1089132032','1089132033','1121488310','1089132034','1089131937')) mql_at,
 min(h.entered_at) filter(where h.pipeline_id='749390743' and h.stage_id in
 ('1089186215','1320560225','1089186216','1089186217','1089186218','1089131958','1089131959','1089131960','1089131961','1089132032','1089132033','1121488310','1089132034','1089131937')) contact_at,
 min(h.entered_at) filter(where h.pipeline_id='749390743' and h.stage_id='1320560225') sql_at,
 min(h.entered_at) filter(where h.pipeline_id='749390743' and h.stage_id='1089186216') scheduled_at,
 min(h.entered_at) filter(where h.pipeline_id='749390743' and h.stage_id='1089131958') realized_at,
 min(h.entered_at) filter(where h.pipeline_id='749390743' and h.stage_id='1089186217') noshow_at,
 min(h.entered_at) filter(where (h.pipeline_id='749390743' and h.stage_id='1089131937') or (h.pipeline_id='746355509' and h.stage_id='1086562155')) won_at,
 bool_or(h.pipeline_id='749390743') principal_history_present
 from history h group by h.deal_id
), campaigns as (
 select campaign_id,min(campaign_name) campaign_name from rgv.ad where account_id='696363384474339' group by campaign_id
), attributed as (
 select d.deal_id,count(c.campaign_id) candidate_count,min(c.campaign_id) campaign_id
 from eligible d left join campaigns c on d.utm_campaign=c.campaign_name or d.utm_campaign=c.campaign_id group by d.deal_id
)
select d.deal_id,d.pipeline_id,d.created_at,
(d.created_at at time zone 'America/Sao_Paulo')::date created_day,
d.product,d.product_rgv,d.campaign_ff,d.utm_campaign,
case when a.candidate_count=1 then a.campaign_id end campaign_id,
case when nullif(btrim(d.utm_campaign),'') is null then 'missing_origin'
 when not d.campaign_ff then 'outside_ff'
 when a.candidate_count=0 then 'campaign_unmatched'
 when a.candidate_count>1 then 'campaign_ambiguous'
 else 'campaign_exact' end attribution_status,
d.history_complete,
(d.pipeline_id='746355509' and not coalesce(f.principal_history_present,false)) missing_principal_history,
f.mql_at,f.contact_at,f.sql_at,f.scheduled_at,f.realized_at,f.noshow_at,
case when d.product_rgv and ((d.pipeline_id='749390743' and d.current_stage_id='1089131937') or (d.pipeline_id='746355509' and d.current_stage_id='1086562155')) then f.won_at end sale_at,
case when d.product_rgv and ((d.pipeline_id='749390743' and d.current_stage_id='1089131937') or (d.pipeline_id='746355509' and d.current_stage_id='1086562155')) then d.amount end revenue,
f.won_at historical_won_at,
d.source_modified_at
from eligible d left join facts f using(deal_id) left join attributed a using(deal_id)
where d.pipeline_id='749390743' or d.product_rgv;
revoke all on rgv.crm_funnel_deal_v1 from public, anon, authenticated;
comment on view rgv.crm_funnel_deal_v1 is 'Validated 2026 Hub funnel, exact FF campaign attribution, one row per deal. Stage dates are first available qualifying evidence (including current stage); no inferred SQL/diagnosis. created_day is available but cohort policy not validated. Boletos product required; sale only current won RGV cycle. Private server-only view.';
