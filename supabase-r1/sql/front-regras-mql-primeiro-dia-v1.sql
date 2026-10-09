-- Regras do funil CRM (Joyce, 09/10/2026).
-- 1) MQL = lead no perfil: faturamento mensal declarado no HubSpot (rgv.deal.monthly_revenue_raw) igual ou acima de R$ 100 mil.
--    rgv.faturamento_mensal_min converte a faixa ("100 mil a 200 mil por mês", "Maior que 6 milhões por mês", "Não tenho faturamento"...)
--    no piso em reais; rgv.crm_funnel_deal_v1 expõe faturamento_mensal_min e mql_perfil.
-- 2) Cada etapa conta uma única vez por negócio, no PRIMEIRO dia em que foi alcançada (rgv.crm_funnel_snapshot_at_v2).
--    Antes, um NoShow ou diagnóstico realizado recontava o negócio como SQL/agendado naquele dia (08/10: 17 SQL = 17 agendados).
-- 3) Nas abas de campanhas, peças e LPs só entram itens com veiculação (impressões/investimento) ou leads no período (rgv.read_front).

create or replace function rgv.faturamento_mensal_min(p_raw text) returns numeric language sql immutable set search_path to '' as $$
select case
 when nullif(btrim(p_raw),'') is null then null
 when lower(p_raw) ~ '(não|nao) tenho' then 0
 when lower(btrim(p_raw)) ~ '^(menor que|até|ate)\M' then 0
 else (select (replace(m[1],',','.'))::numeric * case when m[2] = 'milh' then 1000000 else 1000 end
       from regexp_match(lower(p_raw), '([0-9]+(?:[.,][0-9]+)?)\s*(milh|mil)') m) end $$;

-- rgv.crm_funnel_deal_v1: mesma definição anterior + duas colunas no fim:
--   rgv.faturamento_mensal_min(d.monthly_revenue_raw) AS faturamento_mensal_min,
--   COALESCE(rgv.faturamento_mensal_min(d.monthly_revenue_raw) >= 100000, false) AS mql_perfil

create or replace function rgv.crm_funnel_snapshot_at_v2(p_cutoff date)
 RETURNS TABLE(deal_id text, campaign_id text, attribution_status text, missing_principal_history boolean, history_complete boolean, revenue numeric, movement_days jsonb, actual_mql_days jsonb, source_modified_at timestamp with time zone)
 LANGUAGE sql STABLE SET search_path TO '' AS $function$
with d as materialized (select * from rgv.crm_funnel_deal_v1 where campaign_ff and created_day<=p_cutoff),
h as (
 select deal_id,pipeline_id,stage_id,entered_at from rgv.stage_event
  where entered_at < ((p_cutoff+1)::timestamp at time zone 'America/Sao_Paulo') and pipeline_id in ('749390743','746355509')
 union all select deal_id,pipeline_id,current_stage_id,current_stage_entered_at from rgv.deal where current_stage_entered_at is not null
 union all select p.deal_id, dd.pipeline_id,
   case when p.property_name='motivo_de_loss__sdr_' then 'reason_contact' else 'reason_sql' end, p.occurred_at
  from rgv.property_event p join rgv.deal dd using(deal_id)
  where dd.pipeline_id in ('749390743','746355509')
    and ((p.property_name='motivo_de_loss__sdr_' and p.value='Fora do ICP (Ideal Customer Persona)')
      or (p.property_name='motivo_de_perda__closer_' and p.value='Comprou da concorrência'))),
ordem(stage_id,pos) as (values
 ('1089131932',1),('1386314639',2),('1089131933',3),('1089131934',4),('1089131935',5),('1089131936',6),
 ('1089186215',7),('1320560225',8),('1089186216',9),('1089186217',10),('1089186218',11),('1089131958',12),
 ('1089131959',13),('1089131960',14),('1089131961',15),('1089132032',16),('1089132033',17),('1121488310',18),
 ('1089132034',19),('1089131937',20)),
evidence as (
 select d.deal_id,x.step,(h.entered_at at time zone 'America/Sao_Paulo')::date as movement_day
 from d join h using(deal_id)
 left join ordem o on o.stage_id=h.stage_id and h.pipeline_id='749390743'
 cross join lateral(values
  ('contact', o.pos>=7 or h.stage_id in ('reason_contact','reason_sql')),
  ('sql', o.pos>=8 or h.stage_id='reason_sql'),
  ('scheduled', o.pos>=9),
  ('realized', o.pos>=12),
  ('noshow', o.pos=10),
  ('sales', d.sale_at is not null and (o.pos in (18,19,20) or (h.pipeline_id='746355509' and h.stage_id='1086562155')))
 ) x(step,qualifies)
 where x.qualifies and h.entered_at is not null and (h.entered_at at time zone 'America/Sao_Paulo')::date<=p_cutoff
 union all select deal_id,'crm_leads',created_day from d
 union all select deal_id,'mql',created_day from d where mql_perfil
),
days as (select deal_id,step,jsonb_build_array(min(movement_day)) days from evidence group by deal_id,step),
movements as (select deal_id,jsonb_object_agg(step,days) movement_days from days group by deal_id)
select d.deal_id,d.campaign_id,d.attribution_status,d.missing_principal_history,d.history_complete,d.revenue,
 coalesce(m.movement_days,'{}'::jsonb), coalesce(m.movement_days->'mql','[]'::jsonb), d.source_modified_at
from d left join movements m using(deal_id);
$function$;
