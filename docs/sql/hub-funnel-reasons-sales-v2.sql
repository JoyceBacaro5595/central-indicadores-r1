create or replace view rgv.crm_funnel_deal_v1 with (security_invoker=true) as  WITH eligible AS (
         SELECT d_1.deal_id,
            d_1.pipeline_id,
            d_1.pipeline_name,
            d_1.current_stage_id,
            d_1.created_at,
            d_1.modified_at,
            d_1.sale_at,
            d_1.amount,
            d_1.utm_source,
            d_1.utm_medium,
            d_1.utm_campaign,
            d_1.utm_content,
            d_1.utm_term,
            d_1.origin,
            d_1.product,
            d_1.monthly_revenue_raw,
            d_1.employee_count_raw,
            d_1.monthly_revenue_min,
            d_1.monthly_revenue_max,
            d_1.employees_min,
            d_1.employees_max,
            d_1.segment_key,
            d_1.mql,
            d_1.segmentation_status,
            d_1.history_complete,
            d_1.source_modified_at,
            d_1.processed_at,
            d_1.current_stage_name,
            d_1.current_stage_entered_at,
            d_1.source_timezone,
            d_1.source_timezone_verified,
            COALESCE(d_1.product ~* '(^|[^[:alnum:]])RGV[[:space:]]*[0-9]+([^0-9]|$)'::text AND d_1.product !~* 'processos'::text, false) AS product_rgv,
            strpos(upper(COALESCE(d_1.utm_campaign, ''::text)), '[FF]'::text) > 0 AS campaign_ff
           FROM rgv.deal d_1
          WHERE (d_1.pipeline_id = ANY (ARRAY['749390743'::text, '746355509'::text])) AND d_1.created_at >= '2026-01-01 03:00:00+00'::timestamp with time zone
        ), history AS (
         SELECT e.deal_id,
            e.stage_id,
            e.pipeline_id,
            e.entered_at
           FROM rgv.stage_event e
        UNION ALL
         SELECT d_1.deal_id,
            d_1.current_stage_id,
            d_1.pipeline_id,
            d_1.current_stage_entered_at
           FROM eligible d_1
        UNION ALL select p.deal_id, case when p.property_name='motivo_de_loss__sdr_' then 'reason_contact' else 'reason_sql' end stage_id,d.pipeline_id,p.occurred_at entered_at from rgv.property_event p join rgv.deal d using(deal_id) where d.pipeline_id in ('749390743','746355509') and ((p.property_name='motivo_de_loss__sdr_' and p.value='Fora do ICP (Ideal Customer Persona)') or (p.property_name='motivo_de_perda__closer_' and p.value='Comprou da concorrência')) ), facts AS (
         SELECT h.deal_id,
            min(h.entered_at) FILTER (WHERE h.pipeline_id = '749390743'::text AND (h.stage_id = ANY (ARRAY['1089131932'::text, '1386314639'::text, '1089131933'::text, '1089131934'::text, '1089131935'::text, '1089131936'::text, '1089186215'::text, '1320560225'::text, '1089186216'::text, '1089186217'::text, '1089186218'::text, '1089131958'::text, '1089131959'::text, '1089131960'::text, '1089131961'::text, '1089132032'::text, '1089132033'::text, '1121488310'::text, '1089132034'::text, '1089131937'::text]))) AS mql_at,
            min(h.entered_at) FILTER (WHERE h.pipeline_id = '749390743'::text AND (h.stage_id = ANY (ARRAY['1089186215'::text, '1320560225'::text, '1089186216'::text, '1089186217'::text, '1089186218'::text, '1089131958'::text, '1089131959'::text, '1089131960'::text, '1089131961'::text, '1089132032'::text, '1089132033'::text, '1121488310'::text, '1089132034'::text, '1089131937'::text])) OR h.stage_id in ('reason_contact','reason_sql')) AS contact_at,
            min(h.entered_at) FILTER (WHERE (h.pipeline_id = '749390743'::text AND h.stage_id = '1320560225'::text) OR h.stage_id='reason_sql') AS sql_at,
            min(h.entered_at) FILTER (WHERE h.pipeline_id = '749390743'::text AND h.stage_id = '1089186216'::text) AS scheduled_at,
            min(h.entered_at) FILTER (WHERE h.pipeline_id = '749390743'::text AND h.stage_id = '1089131958'::text) AS realized_at,
            min(h.entered_at) FILTER (WHERE h.pipeline_id = '749390743'::text AND h.stage_id = '1089186217'::text) AS noshow_at,
            min(h.entered_at) FILTER (WHERE h.pipeline_id = '749390743'::text AND h.stage_id = ANY (ARRAY['1089131937'::text,'1121488310'::text,'1089132034'::text]) OR h.pipeline_id = '746355509'::text AND h.stage_id = '1086562155'::text) AS won_at,
            bool_or(h.pipeline_id = '749390743'::text) AS principal_history_present
           FROM history h
          GROUP BY h.deal_id
        ), campaigns AS (
         SELECT ad.campaign_id,
            min(ad.campaign_name) AS campaign_name
           FROM rgv.ad
          WHERE ad.account_id = '696363384474339'::text
          GROUP BY ad.campaign_id
        ), attributed AS (
         SELECT d_1.deal_id,
            count(c.campaign_id) AS candidate_count,
            min(c.campaign_id) AS campaign_id
           FROM eligible d_1
             LEFT JOIN campaigns c ON d_1.utm_campaign = c.campaign_name OR d_1.utm_campaign = c.campaign_id
          GROUP BY d_1.deal_id
        )
 SELECT d.deal_id,
    d.pipeline_id,
    d.created_at,
    (d.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date AS created_day,
    d.product,
    d.product_rgv,
    d.campaign_ff,
    d.utm_campaign,
        CASE
            WHEN a.candidate_count = 1 THEN a.campaign_id
            ELSE NULL::text
        END AS campaign_id,
        CASE
            WHEN NULLIF(btrim(d.utm_campaign), ''::text) IS NULL THEN 'missing_origin'::text
            WHEN NOT d.campaign_ff THEN 'outside_ff'::text
            WHEN a.candidate_count = 0 THEN 'campaign_unmatched'::text
            WHEN a.candidate_count > 1 THEN 'campaign_ambiguous'::text
            ELSE 'campaign_exact'::text
        END AS attribution_status,
    d.history_complete,
    d.pipeline_id = '746355509'::text AND NOT COALESCE(f.principal_history_present, false) AS missing_principal_history,
    f.mql_at,
    f.contact_at,
    f.sql_at,
    f.scheduled_at,
    f.realized_at,
    f.noshow_at,
        CASE
            WHEN d.product_rgv AND (d.pipeline_id = '749390743'::text AND d.current_stage_id = ANY (ARRAY['1089131937'::text,'1121488310'::text,'1089132034'::text]) OR d.pipeline_id = '746355509'::text AND d.current_stage_id = '1086562155'::text) THEN f.won_at
            ELSE NULL::timestamp with time zone
        END AS sale_at,
        CASE
            WHEN d.product_rgv AND (d.pipeline_id = '749390743'::text AND d.current_stage_id = ANY (ARRAY['1089131937'::text,'1121488310'::text,'1089132034'::text]) OR d.pipeline_id = '746355509'::text AND d.current_stage_id = '1086562155'::text) THEN d.amount
            ELSE NULL::numeric
        END AS revenue,
    f.won_at AS historical_won_at,
    d.source_modified_at
   FROM eligible d
     LEFT JOIN facts f USING (deal_id)
     LEFT JOIN attributed a USING (deal_id)
  WHERE d.pipeline_id = '749390743'::text OR d.product_rgv;
CREATE OR REPLACE FUNCTION rgv.crm_funnel_snapshot_at_v1(p_cutoff date)
 RETURNS TABLE(deal_id text, campaign_id text, attribution_status text, missing_principal_history boolean, history_complete boolean, revenue numeric, movement_days jsonb, actual_mql_days jsonb, source_modified_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with d as materialized (select * from rgv.crm_funnel_deal_v1 where campaign_ff and created_day<=p_cutoff), h as (
 select deal_id,pipeline_id,stage_id,entered_at from rgv.stage_event where entered_at < ((p_cutoff+1)::timestamp at time zone 'America/Sao_Paulo') and pipeline_id in ('749390743','746355509')
 union all select deal_id,pipeline_id,current_stage_id,current_stage_entered_at from rgv.deal where current_stage_entered_at is not null
UNION ALL select p.deal_id, d.pipeline_id, case when p.property_name='motivo_de_loss__sdr_' then 'reason_contact' else 'reason_sql' end stage_id,p.occurred_at entered_at from rgv.property_event p join rgv.deal d using(deal_id) where d.pipeline_id in ('749390743','746355509') and ((p.property_name='motivo_de_loss__sdr_' and p.value='Fora do ICP (Ideal Customer Persona)') or (p.property_name='motivo_de_perda__closer_' and p.value='Comprou da concorrência')) ), evidence as (
 select d.deal_id,x.step,(h.entered_at at time zone 'America/Sao_Paulo')::date as movement_day
 from d join h using(deal_id)
 cross join lateral(values
 ('mql',h.pipeline_id='749390743' and h.stage_id in ('1089131932','1386314639','1089131933','1089131934','1089131935','1089131936','1089186215','1320560225','1089186216','1089186217','1089186218','1089131958','1089131959','1089131960','1089131961','1089132032','1089132033','1121488310','1089132034','1089131937')),
 ('contact',h.pipeline_id='749390743' and h.stage_id in ('1089186215','1320560225','1089186216','1089186217','1089186218','1089131958','1089131959','1089131960','1089131961','1089132032','1089132033','1121488310','1089132034','1089131937') or h.stage_id in ('reason_contact','reason_sql')),
 ('sql',(h.pipeline_id='749390743' and h.stage_id='1320560225') or h.stage_id='reason_sql'),
 ('scheduled',h.pipeline_id='749390743' and h.stage_id='1089186216'),
 ('realized',h.pipeline_id='749390743' and h.stage_id='1089131958'),
 ('noshow',h.pipeline_id='749390743' and h.stage_id='1089186217'),
 ('sales',d.sale_at is not null and ((h.pipeline_id='749390743' and h.stage_id in ('1089131937','1121488310','1089132034')) or (h.pipeline_id='746355509' and h.stage_id='1086562155')))
 ) x(step,qualifies)
 where d.campaign_ff and x.qualifies and h.entered_at is not null and (h.entered_at at time zone 'America/Sao_Paulo')::date<=p_cutoff
 union all select deal_id,'crm_leads',created_day from rgv.crm_funnel_deal_v1 where campaign_ff and created_day<=p_cutoff
), days as(select deal_id,step,jsonb_agg(distinct movement_day order by movement_day) days from evidence group by deal_id,step),
movements as(select deal_id,jsonb_object_agg(step,days) movement_days from days group by deal_id)
select d.deal_id,d.campaign_id,d.attribution_status,d.missing_principal_history,d.history_complete,d.revenue,
(coalesce(m.movement_days,'{}'::jsonb)-'mql') || case when m.movement_days ? 'mql' then jsonb_build_object('mql',jsonb_build_array(d.created_day)) else '{}'::jsonb end movement_days,
coalesce(m.movement_days->'mql','[]'::jsonb) actual_mql_days,d.source_modified_at
from d left join movements m using(deal_id) where d.campaign_ff and d.created_day<=p_cutoff;
$function$
;
revoke all on rgv.crm_funnel_deal_v1 from public,anon,authenticated;
revoke all on function rgv.crm_funnel_snapshot_at_v1(date) from public,anon,authenticated;