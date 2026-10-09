-- RGV Processos como Lead no CRM (Joyce, 09/10/2026)
-- "O Lead no CRM consideramos também aqueles que foram gerados no pipeline RGV Processos, com as mesmas regras atuais.
--  Temos uma automação que encontra os leads que estão fora do MQL do marketing e transborda para essa pipeline.
--  Então Principal + Boletos + RGV Processos são considerados Leads no CRM."
--
-- Pipeline RGV Processos = 763255146. As etapas espelham o Principal (sem "Ligar Agora" e "Em Agendamento"),
-- por isso cada etapa recebe a mesma posição do funil do Principal; as demais regras não mudam.
-- Aplicação: Supabase SQL Editor (ou execute_sql), depois do OK da Joyce sobre o impacto apresentado no projeto.

create or replace view rgv.crm_funnel_deal_v1 as
with eligible as (
  select d.*,
         coalesce(d.product ~* '(^|[^[:alnum:]])RGV[[:space:]]*[0-9]+([^0-9]|$)' and d.product !~* 'processos', false) as product_rgv,
         rgv.campanha_perpetuo(d.utm_campaign) as campaign_ff
  from rgv.deal d
  where d.pipeline_id in ('749390743','746355509','763255146') and d.created_at >= '2026-01-01 00:00:00-03'
),
-- posição de cada etapa no funil (Principal e RGV Processos)
stage_pos(pipeline_id,stage_id,pos) as (values
 ('749390743','1089131932',1),('749390743','1386314639',2),('749390743','1089131933',3),('749390743','1089131934',4),('749390743','1089131935',5),('749390743','1089131936',6),
 ('749390743','1089186215',7),('749390743','1320560225',8),('749390743','1089186216',9),('749390743','1089186217',10),('749390743','1089186218',11),('749390743','1089131958',12),
 ('749390743','1089131959',13),('749390743','1089131960',14),('749390743','1089131961',15),('749390743','1089132032',16),('749390743','1089132033',17),('749390743','1121488310',18),
 ('749390743','1089132034',19),('749390743','1089131937',20),
 ('763255146','1111643924',1),('763255146','1111643925',3),('763255146','1111643926',4),('763255146','1111643927',5),('763255146','1111643928',6),
 ('763255146','1111643929',7),('763255146','1111643930',9),('763255146','1111643938',10),('763255146','1111643939',11),('763255146','1111643940',12),
 ('763255146','1111643941',13),('763255146','1111643942',14),('763255146','1111643943',15),('763255146','1111643944',16),('763255146','1111643945',17),('763255146','1166508330',18),
 ('763255146','1111643946',19),('763255146','1111643947',20)),
history as (
  select e.deal_id, e.stage_id, e.pipeline_id, e.entered_at from rgv.stage_event e
  union all
  select d.deal_id, d.current_stage_id, d.pipeline_id, d.current_stage_entered_at from eligible d
  union all
  select p.deal_id,
         case when p.property_name = 'motivo_de_loss__sdr_' then 'reason_contact' else 'reason_sql' end as stage_id,
         d.pipeline_id, p.occurred_at as entered_at
  from rgv.property_event p join rgv.deal d using (deal_id)
  where d.pipeline_id in ('749390743','746355509','763255146')
    and ((p.property_name = 'motivo_de_loss__sdr_' and p.value = 'Fora do ICP (Ideal Customer Persona)')
      or (p.property_name = 'motivo_de_perda__closer_' and p.value = 'Comprou da concorrência'))
),
facts as (
  select h.deal_id,
         min(h.entered_at) filter (where s.pos between 1 and 20) as mql_at,
         min(h.entered_at) filter (where s.pos >= 7 or h.stage_id in ('reason_contact','reason_sql')) as contact_at,
         min(h.entered_at) filter (where s.pos = 8 or h.stage_id = 'reason_sql') as sql_at,
         min(h.entered_at) filter (where s.pos = 9) as scheduled_at,
         min(h.entered_at) filter (where s.pos = 12) as realized_at,
         min(h.entered_at) filter (where s.pos = 10) as noshow_at,
         min(h.entered_at) filter (where s.pos in (18,19,20) or (h.pipeline_id = '746355509' and h.stage_id = '1086562155')) as won_at,
         bool_or(h.pipeline_id = '749390743') as principal_history_present
  from history h left join stage_pos s on s.pipeline_id = h.pipeline_id and s.stage_id = h.stage_id
  group by h.deal_id
),
campaigns as (
  select ad.campaign_id, min(ad.campaign_name) as campaign_name from rgv.ad where ad.account_id = '696363384474339' group by ad.campaign_id
),
attributed as (
  select d.deal_id, count(c.campaign_id) as candidate_count, min(c.campaign_id) as campaign_id
  from eligible d left join campaigns c on d.utm_campaign = c.campaign_name or d.utm_campaign = c.campaign_id
  group by d.deal_id
)
select d.deal_id, d.pipeline_id, d.created_at,
       (d.created_at at time zone 'America/Sao_Paulo')::date as created_day,
       d.product, d.product_rgv, d.campaign_ff, d.utm_campaign,
       case when a.candidate_count = 1 then a.campaign_id end as campaign_id,
       case when nullif(btrim(d.utm_campaign),'') is null then 'missing_origin'
            when not d.campaign_ff then 'outside_ff'
            when a.candidate_count = 0 then 'campaign_unmatched'
            when a.candidate_count > 1 then 'campaign_ambiguous'
            else 'campaign_exact' end as attribution_status,
       d.history_complete,
       d.pipeline_id = '746355509' and not coalesce(f.principal_history_present,false) as missing_principal_history,
       f.mql_at, f.contact_at, f.sql_at, f.scheduled_at, f.realized_at, f.noshow_at,
       case when d.product_rgv and ((d.pipeline_id = '749390743' and d.current_stage_id in ('1089131937','1121488310','1089132034'))
                                 or (d.pipeline_id = '763255146' and d.current_stage_id in ('1111643947','1166508330','1111643946'))
                                 or (d.pipeline_id = '746355509' and d.current_stage_id = '1086562155')) then f.won_at end as sale_at,
       case when d.product_rgv and ((d.pipeline_id = '749390743' and d.current_stage_id in ('1089131937','1121488310','1089132034'))
                                 or (d.pipeline_id = '763255146' and d.current_stage_id in ('1111643947','1166508330','1111643946'))
                                 or (d.pipeline_id = '746355509' and d.current_stage_id = '1086562155')) then d.amount end as revenue,
       f.won_at as historical_won_at,
       d.source_modified_at,
       rgv.faturamento_mensal_min(d.monthly_revenue_raw) as faturamento_mensal_min,
       coalesce(rgv.faturamento_mensal_min(d.monthly_revenue_raw) >= 100000, false) as mql_perfil
from eligible d
left join facts f using (deal_id)
left join attributed a using (deal_id)
where d.pipeline_id in ('749390743','763255146') or d.product_rgv;

create or replace function rgv.crm_funnel_snapshot_at_v2(p_cutoff date)
 returns table(deal_id text, campaign_id text, attribution_status text, missing_principal_history boolean, history_complete boolean, revenue numeric, movement_days jsonb, actual_mql_days jsonb, source_modified_at timestamp with time zone)
 language sql stable set search_path to ''
as $function$
-- Regras (Joyce, 09/10/2026): cada etapa conta uma única vez por negócio, no PRIMEIRO dia em que foi alcançada.
-- MQL = lead no perfil (faturamento mensal declarado >= R$ 100 mil), contado no dia de criação do lead.
-- Lead no CRM = Principal + Boletos + RGV Processos (763255146), mesmas regras; as etapas do RGV Processos recebem a posição equivalente do Principal.
with d as materialized (select * from rgv.crm_funnel_deal_v1 where campaign_ff and created_day<=p_cutoff),
h as (
 select deal_id,pipeline_id,stage_id,entered_at from rgv.stage_event
  where entered_at < ((p_cutoff+1)::timestamp at time zone 'America/Sao_Paulo') and pipeline_id in ('749390743','746355509','763255146')
 union all select deal_id,pipeline_id,current_stage_id,current_stage_entered_at from rgv.deal where current_stage_entered_at is not null
 union all select p.deal_id, dd.pipeline_id,
   case when p.property_name='motivo_de_loss__sdr_' then 'reason_contact' else 'reason_sql' end, p.occurred_at
  from rgv.property_event p join rgv.deal dd using(deal_id)
  where dd.pipeline_id in ('749390743','746355509','763255146')
    and ((p.property_name='motivo_de_loss__sdr_' and p.value='Fora do ICP (Ideal Customer Persona)')
      or (p.property_name='motivo_de_perda__closer_' and p.value='Comprou da concorrência'))),
ordem(pipeline_id,stage_id,pos) as (values
 ('749390743','1089131932',1),('749390743','1386314639',2),('749390743','1089131933',3),('749390743','1089131934',4),('749390743','1089131935',5),('749390743','1089131936',6),
 ('749390743','1089186215',7),('749390743','1320560225',8),('749390743','1089186216',9),('749390743','1089186217',10),('749390743','1089186218',11),('749390743','1089131958',12),
 ('749390743','1089131959',13),('749390743','1089131960',14),('749390743','1089131961',15),('749390743','1089132032',16),('749390743','1089132033',17),('749390743','1121488310',18),
 ('749390743','1089132034',19),('749390743','1089131937',20),
 ('763255146','1111643924',1),('763255146','1111643925',3),('763255146','1111643926',4),('763255146','1111643927',5),('763255146','1111643928',6),
 ('763255146','1111643929',7),('763255146','1111643930',9),('763255146','1111643938',10),('763255146','1111643939',11),('763255146','1111643940',12),
 ('763255146','1111643941',13),('763255146','1111643942',14),('763255146','1111643943',15),('763255146','1111643944',16),('763255146','1111643945',17),('763255146','1166508330',18),
 ('763255146','1111643946',19),('763255146','1111643947',20)),
evidence as (
 select d.deal_id,x.step,(h.entered_at at time zone 'America/Sao_Paulo')::date as movement_day
 from d join h using(deal_id)
 left join ordem o on o.pipeline_id=h.pipeline_id and o.stage_id=h.stage_id
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

-- Publicação diária: o "histórico pendente" passa a considerar também o RGV Processos.
-- (rgv.try_publish_front tem a mesma checagem; alterá-la exige o SQL Editor porque o corpo contém DELETE.)
-- Observação: o histórico do RGV Processos foi carregado a partir de 01/09/2026 (7.760 negócios); a checagem abaixo
-- só olha negócios já carregados, então os lotes anteriores a 01/09 continuam publicáveis.
create or replace function rgv.dispatch_front_daily(p_dry boolean default false) returns jsonb language plpgsql set search_path to '' as $function$
declare corte date := (now() at time zone 'America/Sao_Paulo')::date - 1;
        inicio date := coalesce((select (checkpoint->>'start_day')::date from rgv.sync_config where tool='etl'), date '2026-09-01');
        cap jsonb := rgv.capacity_status(); why text; outcome jsonb; run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('rgv.front_daily_dispatch',0));
  if not coalesce((select enabled from rgv.sync_config where tool='etl'), false) then why := 'ETL desativado em rgv.sync_config';
  elsif exists (select 1 from rgv.front_batch where status in ('staging','waiting') and end_day >= corte) then why := 'Lote do corte '||corte||' ainda aguardando publicação';
  elsif not (cap->>'ok')::boolean then why := 'Capacidade: banco com '||pg_size_pretty((cap->>'db_bytes')::bigint)||', limite '||pg_size_pretty((cap->>'limit_bytes')::bigint)||'. Novo lote bloqueado até decisão (limpar snapshots ou ampliar plano).';
  elsif not exists (select 1 from rgv.sync_config where tool='hubspot' and enabled and coalesce((checkpoint->>'bootstrap_done')::boolean,false) and watermark >= ((corte+1)::timestamp at time zone 'America/Sao_Paulo')) then why := 'HubSpot ainda não fechou o corte '||corte;
  elsif exists (select 1 from rgv.deal where created_at >= '2026-01-01 00:00:00-03' and created_at < ((corte+1)::timestamp at time zone 'America/Sao_Paulo') and pipeline_id in ('749390743','746355509','763255146') and not coalesce(history_complete,false)) then why := 'HubSpot com histórico pendente';
  elsif exists (select 1 from generate_series(inicio::timestamp, corte::timestamp, interval '1 day') d cross join (values('696363384474339'),('171474008015977')) a(account_id)
                where not exists (select 1 from rgv.meta_complete_window w where w.account_id=a.account_id and d::date between w.start_day and w.end_day)) then why := 'Meta ainda não fechou o corte '||corte||' nas duas contas';
  end if;
  if why is not null then
    if not p_dry then insert into rgv.sync_run(tool,source,status,start_at,end_at,started_at,finished_at,error_type,error_detail) values('etl','cron','skipped',inicio,corte,now(),now(),'aguardando',why); end if;
    return jsonb_build_object('status','skipped','corte',corte,'motivo',why,'capacidade',cap,'dry',p_dry);
  end if;
  if p_dry then return jsonb_build_object('status','ready','corte',corte,'inicio',inicio,'capacidade',cap,'dry',true); end if;
  insert into rgv.sync_run(tool,source,status,start_at,end_at,started_at) values('etl','cron','running',inicio,corte,now()) returning id into run_id;
  begin
    outcome := rgv.refresh_front_batch_v1(inicio, corte);
    update rgv.sync_run set status = case when outcome->>'status'='published' then 'success' else 'partial' end, finished_at=now(), rows_processed=coalesce((outcome->>'rows')::bigint,0), checkpoint=outcome, error_detail=outcome->>'reason' where id=run_id;
  exception when others then
    update rgv.sync_run set status='error', finished_at=now(), error_type=sqlstate, error_detail=left(sqlerrm,500) where id=run_id;
    return jsonb_build_object('status','error','reason',left(sqlerrm,500),'run_id',run_id);
  end;
  return outcome || jsonb_build_object('corte',corte,'capacidade',cap);
end $function$;

-- Depois de aplicar: recalcular a parcial e republicar os lotes desde 01/09 (select rgv.build_front_parcial(); e o lote diário das 23:10).
