-- Backend preparation. Does not import data, activate cron, or replace existing RPCs.
create schema if not exists rgv;
revoke all on schema rgv from public, anon, authenticated;
grant usage on schema rgv to service_role;

create table rgv.import_batch (
  id uuid primary key default gen_random_uuid(), source text not null,
  file_sha256 text unique, expected_rows integer check (expected_rows >= 0),
  loaded_rows integer not null default 0 check (loaded_rows >= 0),
  status text not null default 'pending' check (status in ('pending','running','partial','success','error')),
  created_at timestamptz not null default now(), finished_at timestamptz
);
create table rgv.raw_record (
  batch_id uuid not null references rgv.import_batch(id), record_id text not null,
  payload jsonb not null, source_modified_at timestamptz, captured_at timestamptz not null default now(),
  primary key (batch_id, record_id)
);
create table rgv.deal (
  deal_id text primary key, pipeline_id text, pipeline_name text, current_stage_id text,
  created_at timestamptz, modified_at timestamptz, sale_at timestamptz, amount numeric,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  origin text, product text, monthly_revenue_raw text, employee_count_raw text,
  monthly_revenue_min numeric, monthly_revenue_max numeric,
  employees_min integer, employees_max integer, segment_key text,
  mql boolean, segmentation_status text not null default 'pending'
    check (segmentation_status in ('pending','verified','ambiguous')),
  history_complete boolean not null default false,
  source_modified_at timestamptz, processed_at timestamptz not null default now()
);
create index rgv_deal_modified on rgv.deal(source_modified_at);
create index rgv_deal_created on rgv.deal(created_at);
create table rgv.stage_mapping (
  pipeline_id text not null, stage_id text not null, stage_name text not null,
  funnel_step text check (funnel_step in ('mql','contact','sql','scheduled','realized','noshow','sale','lost')),
  verified boolean not null default false, primary key (pipeline_id,stage_id)
);
create table rgv.stage_event (
  deal_id text not null references rgv.deal(deal_id), pipeline_id text,
  stage_id text not null, entered_at timestamptz not null, exited_at timestamptz,
  source text not null, source_event_id text,
  primary key (deal_id,stage_id,entered_at), check (exited_at is null or exited_at >= entered_at)
);
create index rgv_stage_event_time on rgv.stage_event(entered_at);
create table rgv.landing_page (
  lp_id text primary key, canonical_url text not null unique, name text,
  verified boolean not null default false
);
create table rgv.ad (
  account_id text not null, ad_id text not null, campaign_id text not null, campaign_name text,
  adset_id text, adset_name text, ad_name text, creative_id text, creative_name text,
  preview_url text, destination_url text, lp_id text references rgv.landing_page(lp_id),
  campaign_verified boolean not null default false, lp_verified boolean not null default false,
  updated_at timestamptz not null default now(), primary key (account_id,ad_id)
);
create index rgv_ad_campaign on rgv.ad(account_id,campaign_id);
create table rgv.ad_daily (
  account_id text not null, ad_id text not null, day date not null,
  spend numeric check (spend >= 0), impressions bigint check (impressions >= 0),
  link_clicks bigint check (link_clicks >= 0), landing_page_views bigint check (landing_page_views >= 0),
  pixel_leads bigint check (pixel_leads >= 0), reach_daily bigint check (reach_daily >= 0),
  actions jsonb, attribution_setting text, collected_at timestamptz not null default now(),
  primary key (account_id,ad_id,day), foreign key (account_id,ad_id) references rgv.ad(account_id,ad_id)
);
create table rgv.attribution (
  deal_id text primary key references rgv.deal(deal_id), account_id text, ad_id text,
  lp_id text references rgv.landing_page(lp_id),
  method text, status text not null default 'pending' check (status in ('pending','verified','ambiguous','unmatched')),
  reason text, verified_at timestamptz,
  foreign key (account_id,ad_id) references rgv.ad(account_id,ad_id)
);
create table rgv.segment_rule (
  key text primary key, description text not null, rule jsonb not null,
  version integer not null default 1, enabled boolean not null default false, updated_at timestamptz not null default now()
);
create table rgv.sync_config (
  tool text primary key check (tool in ('hubspot','meta','csv','etl')),
  enabled boolean not null default false, rolling_days integer not null default 7 check (rolling_days between 1 and 365),
  daily_time time not null default '05:00', timezone text not null default 'America/Sao_Paulo',
  cron_expression text, timeout_ms integer not null default 90000 check (timeout_ms between 1000 and 120000),
  account_id text, campaign_id text, watermark timestamptz, checkpoint jsonb,
  updated_at timestamptz not null default now()
);
insert into rgv.sync_config(tool) values ('hubspot'),('meta'),('csv'),('etl');
create table rgv.sync_run (
  id uuid primary key default gen_random_uuid(), tool text not null references rgv.sync_config(tool),
  source text not null check (source in ('manual','cron','import')),
  status text not null default 'queued' check (status in ('queued','running','partial','success','error','timeout','skipped')),
  start_at timestamptz, end_at timestamptz, run_after timestamptz not null default now(),
  started_at timestamptz, finished_at timestamptz, checkpoint jsonb,
  rows_processed bigint not null default 0, error_type text, error_detail text,
  check (end_at is null or start_at is null or end_at >= start_at)
);
create index rgv_sync_run_tool on rgv.sync_run(tool,run_after desc);

-- ETL output contract. One row per DAY + GRAIN + ENTITY. Counts are distinct deals.
-- The worker must produce TOTAL from facts, not by summing attributed creative/LP rows.
-- Explicit completed zero days distinguish zero activity from absent data.
create table rgv.front_daily (
  grain text not null check (grain in ('total','creative','lp')), entity_id text not null,
  day date not null, label text,
  media_complete boolean not null default false, crm_complete boolean not null default false,
  history_complete boolean not null default false, attribution_complete boolean not null default false,
  spend numeric, impressions bigint, link_clicks bigint, landing_page_views bigint, pixel_leads bigint,
  crm_leads bigint, mql bigint, contact bigint, sql bigint, scheduled bigint, realized bigint,
  noshow bigint, sales bigint, revenue numeric, refreshed_at timestamptz not null default now(),
  primary key (grain,entity_id,day), check (grain <> 'total' or entity_id = 'all')
);
-- Reach is non-additive. Only a direct Meta insight for the exact interval belongs here.
create table rgv.period_reach (
  grain text not null check (grain in ('total','creative','lp')), entity_id text not null,
  start_day date not null, end_day date not null, reach bigint not null check (reach >= 0),
  verified boolean not null default false, collected_at timestamptz not null default now(),
  primary key (grain,entity_id,start_day,end_day), check (end_day >= start_day)
);

do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='rgv' loop
    execute format('alter table rgv.%I enable row level security',t.tablename);
    execute format('revoke all on table rgv.%I from public, anon, authenticated',t.tablename);
    execute format('grant all on table rgv.%I to service_role',t.tablename);
  end loop;
end $$;

-- Internal aggregate helper. Invoker; callable only by the protected reader and worker.
create function rgv.aggregate_front(p_de date,p_ate date,p_grain text,p_entity text)
returns jsonb language sql stable security invoker set search_path='' as $$
with x as (
 select count(*) as days, bool_and(media_complete) as media, bool_and(crm_complete) as crm,
 bool_and(history_complete) as history, bool_and(attribution_complete) as attributed,
 sum(spend) spend,sum(impressions) impressions,sum(link_clicks) clicks,sum(landing_page_views) views,
 sum(pixel_leads) pixel,sum(crm_leads) leads,sum(mql) mql,sum(contact) contact,sum(sql) sql,
 sum(scheduled) scheduled,sum(realized) realized,sum(noshow) noshow,sum(sales) sales,sum(revenue) revenue
 from rgv.front_daily where grain=p_grain and entity_id=p_entity and day between p_de and p_ate
), flags as (
 select *, days=p_ate-p_de+1 and coalesce(media,false) media_ok,
 days=p_ate-p_de+1 and coalesce(crm,false) crm_ok,
 days=p_ate-p_de+1 and coalesce(history,false) history_ok,
 days=p_ate-p_de+1 and coalesce(media and crm and history and attributed,false) costs_ok from x
)
select jsonb_build_object(
 'investimento',case when media_ok then spend end,'impressoes',case when media_ok then impressions end,
 'cliques',case when media_ok then clicks end,'visualizacoes_lp',case when media_ok then views end,
 'alcance',(select reach from rgv.period_reach where grain=p_grain and entity_id=p_entity and start_day=p_de and end_day=p_ate and verified),
 'leads_pixel',case when media_ok then pixel end,'leads_crm',case when crm_ok then leads end,
 'mql',case when crm_ok then mql end,'contato_efetivo',case when crm_ok and history_ok then contact end,
 'sql',case when crm_ok and history_ok then sql end,'reunioes_agendadas',case when crm_ok and history_ok then scheduled end,
 'reunioes_realizadas',case when crm_ok and history_ok then realized end,'noshow',case when crm_ok and history_ok then noshow end,
 'vendas',case when crm_ok and history_ok then sales end,'faturamento',case when crm_ok and history_ok then revenue end,
 'cpm',case when media_ok and impressions>0 then round(spend/impressions*1000,2) end,
 'ctr',case when media_ok and impressions>0 then round(clicks::numeric/impressions*100,2) end,
 'cpc',case when media_ok and clicks>0 then round(spend/clicks,2) end,
 'cpl_pixel',case when media_ok and pixel>0 then round(spend/pixel,2) end,
 'cpl',case when costs_ok and leads>0 then round(spend/leads,2) end,
 'cpmql',case when costs_ok and mql>0 then round(spend/mql,2) end,
 'custo_reuniao',case when costs_ok and realized>0 then round(spend/realized,2) end,
 'cac',case when costs_ok and sales>0 then round(spend/sales,2) end,
 'roas',case when costs_ok and spend>0 then round(revenue/spend,2) end,
 'conversao_lp',case when costs_ok and views>0 then round(leads::numeric/views*100,2) end,
 'taxa_mql',case when crm_ok and leads>0 then round(mql::numeric/leads*100,2) end,
 'taxa_contato',case when crm_ok and history_ok and mql>0 then round(contact::numeric/mql*100,2) end,
 'taxa_sql',case when crm_ok and history_ok and contact>0 then round(sql::numeric/contact*100,2) end,
 'taxa_agendamento',case when crm_ok and history_ok and sql>0 then round(scheduled::numeric/sql*100,2) end,
 'taxa_comparecimento',case when crm_ok and history_ok and scheduled>0 then round(realized::numeric/scheduled*100,2) end,
 'taxa_fechamento',case when crm_ok and history_ok and realized>0 then round(sales::numeric/realized*100,2) end,
 'cobertura',jsonb_build_object('dias_esperados',p_ate-p_de+1,'dias_carregados',days,
 'midia_completa',media_ok,'crm_completo',crm_ok,'historico_completo',history_ok,'custos_validos',costs_ok)
) from flags;
$$;
revoke all on function rgv.aggregate_front(date,date,text,text) from public,anon,authenticated;
grant execute on function rgv.aggregate_front(date,date,text,text) to service_role;

-- Only this guarded private-schema reader elevates privileges. Raw data is never returned.
create function rgv.read_front(p_de date,p_ate date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; de date:=coalesce(p_de,date '2026-01-01');
 ate date:=coalesce(p_ate,(now() at time zone 'America/Sao_Paulo')::date-1);
begin
 if auth.uid() is null then raise exception 'Login necessário' using errcode='28000'; end if;
 perform identity.exigir('painel');
 if ate<de or ate-de>1095 then raise exception 'Período inválido (máximo 1096 dias)' using errcode='22023'; end if;
 select jsonb_build_object(
 'versao',2,'atualizado_em',(select max(refreshed_at) from rgv.front_daily),
 'periodo',jsonb_build_object('inicio',de,'fim',ate),
 'ciclos',coalesce((select jsonb_agg(jsonb_build_object('ciclo',ciclo,'numero',numero,'inicio',inicio,'fim',fim,'dias',dias) order by numero) from marts.dim_ciclo),'[]'::jsonb),
 'fontes',jsonb_build_object(
   'meta_ate',(select max(day) from rgv.front_daily where grain='total' and media_complete),
   'funil_ate',(select max(day) from rgv.front_daily where grain='total' and crm_complete and history_complete),
   'meta_no_periodo',exists(select 1 from rgv.front_daily where grain='total' and media_complete and day between de and ate),
   'funil_no_periodo',exists(select 1 from rgv.front_daily where grain='total' and crm_complete and history_complete and day between de and ate),
   'criativo',exists(select 1 from rgv.front_daily where grain='creative' and day between de and ate),
   'lp',exists(select 1 from rgv.front_daily where grain='lp' and day between de and ate)),
 'resumo',rgv.aggregate_front(de,ate,'total','all'),
 'diario',coalesce((select jsonb_agg(jsonb_build_object('data',day)||rgv.aggregate_front(day,day,'total','all') order by day) from rgv.front_daily where grain='total' and day between de and ate),'[]'::jsonb),
 'por_criativo',(select jsonb_agg(jsonb_build_object('id',entity_id,'criativo',label)||rgv.aggregate_front(de,ate,'creative',entity_id) order by entity_id) from (select entity_id,max(label) label from rgv.front_daily where grain='creative' and day between de and ate group by entity_id) q),
 'por_lp',(select jsonb_agg(jsonb_build_object('id',entity_id,'pagina',label)||rgv.aggregate_front(de,ate,'lp',entity_id) order by entity_id) from (select entity_id,max(label) label from rgv.front_daily where grain='lp' and day between de and ate group by entity_id) q)
 ) into result;
 return result;
end $$;
revoke all on function rgv.read_front(date,date) from public,anon;
grant usage on schema rgv to authenticated;
grant execute on function rgv.read_front(date,date) to authenticated;

create function public.perpetuo_funil_v2(p_de date default null,p_ate date default null)
returns jsonb language sql stable security invoker set search_path='' as $$
select rgv.read_front(p_de,p_ate);
$$;
revoke all on function public.perpetuo_funil_v2(date,date) from public,anon;
grant execute on function public.perpetuo_funil_v2(date,date) to authenticated;

-- Server-only ingestion API. Receives normalized records, never provider tokens.
-- Entire chunk is atomic. Upserts are idempotent at each table's primary key.
create function public.perpetuo_ingest_v2(p_resource text,p_rows jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare cols text; updates text; keys text; defaults jsonb; payload jsonb; affected integer;
begin
 if p_resource not in ('deal','stage_event','ad','ad_daily','landing_page','attribution','front_daily','period_reach') then
   raise exception 'Recurso inválido' using errcode='22023';
 end if;
 if jsonb_typeof(p_rows) <> 'array' or p_rows is null then raise exception 'Esperado um array' using errcode='22023'; end if;
 if jsonb_array_length(p_rows)>500 then raise exception 'Máximo 500 registros por lote' using errcode='22023'; end if;
 if jsonb_array_length(p_rows)=0 then return 0; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) a where jsonb_typeof(a)<>'object') then
   raise exception 'Todos os registros devem ser objetos' using errcode='22023';
 end if;
 defaults:=case p_resource
   when 'deal' then jsonb_build_object('processed_at',now(),'segmentation_status','pending','history_complete',false)
   when 'ad' then jsonb_build_object('updated_at',now(),'campaign_verified',false,'lp_verified',false)
   when 'landing_page' then jsonb_build_object('verified',false)
   when 'ad_daily' then jsonb_build_object('collected_at',now())
   when 'attribution' then jsonb_build_object('status','pending')
   when 'front_daily' then jsonb_build_object('refreshed_at',now(),'media_complete',false,'crm_complete',false,'history_complete',false,'attribution_complete',false)
   when 'period_reach' then jsonb_build_object('collected_at',now(),'verified',false)
   else '{}'::jsonb end;
 select jsonb_agg(defaults||a) into payload from jsonb_array_elements(p_rows) a;
 select string_agg(format('%I',a.attname),',' order by a.attnum) into cols
 from pg_attribute a where a.attrelid=to_regclass('rgv.'||p_resource) and a.attnum>0 and not a.attisdropped;
 select string_agg(format('%I',a.attname),',' order by a.attnum) into keys
 from pg_attribute a join pg_index i on i.indrelid=a.attrelid and a.attnum=any(i.indkey)
 where a.attrelid=to_regclass('rgv.'||p_resource) and i.indisprimary;
 select string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum) into updates
 from pg_attribute a where a.attrelid=to_regclass('rgv.'||p_resource) and a.attnum>0 and not a.attisdropped
 and not exists(select 1 from pg_index i where i.indrelid=a.attrelid and i.indisprimary and a.attnum=any(i.indkey));
 execute format('insert into rgv.%I (%s) select %s from jsonb_populate_recordset(null::rgv.%I,$1) on conflict (%s) do update set %s',
 p_resource,cols,cols,p_resource,keys,updates) using payload;
 get diagnostics affected=row_count;
 return affected;
end $$;
revoke all on function public.perpetuo_ingest_v2(text,jsonb) from public,anon,authenticated;
grant execute on function public.perpetuo_ingest_v2(text,jsonb) to service_role;
