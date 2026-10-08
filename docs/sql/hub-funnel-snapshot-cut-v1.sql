create or replace function rgv.crm_funnel_snapshot_at_v1(p_cutoff date)
returns table(deal_id text,campaign_id text,attribution_status text,missing_principal_history boolean,history_complete boolean,revenue numeric,movement_days jsonb,actual_mql_days jsonb,source_modified_at timestamptz)
language sql stable security invoker set search_path='' as $snapshot$
with d as materialized (select * from rgv.crm_funnel_deal_v1 where campaign_ff and created_day<=p_cutoff), h as (
 select deal_id,pipeline_id,stage_id,entered_at from rgv.stage_event where entered_at < ((p_cutoff+1)::timestamp at time zone 'America/Sao_Paulo') and pipeline_id in ('749390743','746355509')
 union all select deal_id,pipeline_id,current_stage_id,current_stage_entered_at from rgv.deal where current_stage_entered_at is not null
), evidence as (
 select d.deal_id,x.step,(h.entered_at at time zone 'America/Sao_Paulo')::date as movement_day
 from d join h using(deal_id)
 cross join lateral(values
 ('mql',h.pipeline_id='749390743' and h.stage_id in ('1089131932','1386314639','1089131933','1089131934','1089131935','1089131936','1089186215','1320560225','1089186216','1089186217','1089186218','1089131958','1089131959','1089131960','1089131961','1089132032','1089132033','1121488310','1089132034','1089131937')),
 ('contact',h.pipeline_id='749390743' and h.stage_id in ('1089186215','1320560225','1089186216','1089186217','1089186218','1089131958','1089131959','1089131960','1089131961','1089132032','1089132033','1121488310','1089132034','1089131937')),
 ('sql',h.pipeline_id='749390743' and h.stage_id='1320560225'),
 ('scheduled',h.pipeline_id='749390743' and h.stage_id='1089186216'),
 ('realized',h.pipeline_id='749390743' and h.stage_id='1089131958'),
 ('noshow',h.pipeline_id='749390743' and h.stage_id='1089186217'),
 ('sales',d.sale_at is not null and ((h.pipeline_id='749390743' and h.stage_id='1089131937') or (h.pipeline_id='746355509' and h.stage_id='1086562155')))
 ) x(step,qualifies)
 where d.campaign_ff and x.qualifies and h.entered_at is not null and (h.entered_at at time zone 'America/Sao_Paulo')::date<=p_cutoff
 union all select deal_id,'crm_leads',created_day from rgv.crm_funnel_deal_v1 where campaign_ff and created_day<=p_cutoff
), days as(select deal_id,step,jsonb_agg(distinct movement_day order by movement_day) days from evidence group by deal_id,step),
movements as(select deal_id,jsonb_object_agg(step,days) movement_days from days group by deal_id)
select d.deal_id,d.campaign_id,d.attribution_status,d.missing_principal_history,d.history_complete,d.revenue,
(coalesce(m.movement_days,'{}'::jsonb)-'mql') || case when m.movement_days ? 'mql' then jsonb_build_object('mql',jsonb_build_array(d.created_day)) else '{}'::jsonb end movement_days,
coalesce(m.movement_days->'mql','[]'::jsonb) actual_mql_days,d.source_modified_at
from d left join movements m using(deal_id) where d.campaign_ff and d.created_day<=p_cutoff;
$snapshot$;
revoke all on function rgv.crm_funnel_snapshot_at_v1(date) from public,anon,authenticated;
comment on function rgv.crm_funnel_snapshot_at_v1(date) is 'Server-only immutable-snapshot input: MQL by creation date, other evidenced Sao Paulo movement dates by deal/step; publication must freeze rows and count each deal once if ANY date is in selected period. Summing daily unique counts is invalid for period totals.';
