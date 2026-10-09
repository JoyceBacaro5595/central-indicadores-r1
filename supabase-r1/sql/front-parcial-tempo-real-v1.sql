-- Parcial em tempo real (Joyce, 09/10/2026: "precisamos ver em tempo real seguindo o cron").
-- Os dias depois do último lote publicado (corte + 1 até hoje) são recalculados a cada meia hora a partir da coleta
-- mais recente do Meta (conta Perpétuo) e do HubSpot, em tabelas separadas do lote publicado:
--   rgv.front_daily_parcial        mídia por dia/grão (mesma estrutura de rgv.front_daily)
--   rgv.front_crm_snapshot_parcial snapshot do funil CRM com corte = hoje
-- O lote publicado continua sendo a única fonte dos dias fechados; a parcial nunca o substitui.

create table if not exists rgv.front_daily_parcial (like rgv.front_daily including all);
create table if not exists rgv.front_crm_snapshot_parcial (like rgv.front_crm_snapshot including defaults);
do $$ begin
 if not exists (select 1 from pg_constraint where conrelid='rgv.front_crm_snapshot_parcial'::regclass and contype='p') then
  alter table rgv.front_crm_snapshot_parcial add primary key (deal_id);
 end if;
end $$;

create or replace function rgv.crm_snapshot_rows(p_batch uuid) returns setof rgv.front_crm_snapshot language sql stable set search_path to '' as $$
 select * from rgv.front_crm_snapshot where batch_id=p_batch union all select * from rgv.front_crm_snapshot_parcial where p_batch is null $$;
-- rgv.deal_ad_resolution(p_batch) e rgv.crm_matrix_v3(p_de,p_ate,p_batch) leem rgv.crm_snapshot_rows(p_batch); p_batch null = parcial.

create or replace function rgv.build_front_parcial() returns jsonb language plpgsql set search_path to '' as $function$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; corte date; ini date; n_media bigint; n_crm bigint; t0 timestamptz := clock_timestamp();
begin
 perform pg_advisory_xact_lock(hashtextextended('rgv.front_parcial',0));
 select max(end_day) into corte from rgv.front_batch where status='published';
 if corte is null then return jsonb_build_object('status','skipped','motivo','Sem lote publicado'); end if;
 ini := corte + 1;
 delete from rgv.front_crm_snapshot_parcial;
 delete from rgv.front_daily_parcial;
 if ini > hoje then
  insert into rgv.sync_config(tool,enabled,checkpoint,updated_at) values('parcial',true,jsonb_build_object('status','vazio','corte_publicado',corte,'built_at',now()),now())
   on conflict(tool) do update set checkpoint=excluded.checkpoint, updated_at=now();
  return jsonb_build_object('status','skipped','motivo','Corte publicado já cobre hoje','corte',corte);
 end if;
 insert into rgv.front_crm_snapshot_parcial(batch_id,deal_id,campaign_id,attribution_status,missing_principal_history,history_complete,revenue,movement_days)
  select null,deal_id,campaign_id,attribution_status,coalesce(missing_principal_history,false),coalesce(history_complete,false),revenue,movement_days from rgv.crm_funnel_snapshot_at_v2(hoje);
 get diagnostics n_crm=row_count;
 with campaigns as (select campaign_id,max(campaign_name) label from rgv.ad where account_id='696363384474339' and strpos(upper(coalesce(campaign_name,'')),'[FF]')>0 group by campaign_id),
 entities as (select 'total'::text grain,'all'::text entity_id,'Perpétuo RGV · [FF]'::text label union all select 'campaign',campaign_id,label from campaigns),
 days as (select d::date as day from generate_series(ini::timestamp,hoje::timestamp,interval '1 day') d),
 media as (select a.campaign_id,m.day,sum(m.spend) spend,sum(m.impressions) impressions,sum(m.link_clicks) clicks,
  case when bool_and(m.landing_page_views is not null) then sum(m.landing_page_views) end views,
  case when bool_and(m.pixel_leads is not null) then sum(m.pixel_leads) end pixel
  from rgv.ad_daily m join rgv.ad a using(account_id,ad_id) join campaigns c using(campaign_id)
  where m.account_id='696363384474339' and m.day between ini and hoje group by a.campaign_id,m.day),
 aggregated as (select 'campaign'::text grain,campaign_id entity_id,day,spend,impressions,clicks,views,pixel from media
  union all select 'total','all',day,sum(spend),sum(impressions),sum(clicks),case when bool_and(views is not null) then sum(views) end,case when bool_and(pixel is not null) then sum(pixel) end from media group by day)
 insert into rgv.front_daily_parcial(grain,entity_id,day,label,media_complete,crm_complete,history_complete,attribution_complete,spend,impressions,link_clicks,landing_page_views,pixel_leads,refreshed_at)
 select e.grain,e.entity_id,d.day,e.label,
  -- mídia "completa" na parcial = o dia já tem coleta do Meta (de hora em hora); sem coleta fica cinza na tela
  exists(select 1 from rgv.ad_daily x where x.account_id='696363384474339' and x.day=d.day),
  true,not exists(select 1 from rgv.front_crm_snapshot_parcial s where not s.history_complete),
  false,coalesce(m.spend,0),coalesce(m.impressions,0),coalesce(m.clicks,0),case when m.entity_id is null then 0 else m.views end,case when m.entity_id is null then 0 else m.pixel end,now()
 from entities e cross join days d left join aggregated m on m.grain=e.grain and m.entity_id=e.entity_id and m.day=d.day;
 get diagnostics n_media=row_count;
 with ads as (
  select a.*,d.day,d.spend,d.impressions,d.link_clicks,d.landing_page_views,d.pixel_leads
  from rgv.ad_daily d join rgv.ad a using(account_id,ad_id)
  where d.account_id='696363384474339' and d.day between ini and hoje and strpos(upper(coalesce(a.campaign_name,'')),'[FF]')>0
 ), dims as (
  select 'creative'::text grain,creative_id entity_id,coalesce(creative_name,ad_name) label,day,spend,impressions,link_clicks,landing_page_views,pixel_leads from ads where creative_id is not null
  union all
  select 'lp',lp_id, destination_url,day,spend,impressions,link_clicks,landing_page_views,pixel_leads from ads where lp_id is not null
 )
 insert into rgv.front_daily_parcial(grain,entity_id,day,label,media_complete,crm_complete,history_complete,attribution_complete,spend,impressions,link_clicks,landing_page_views,pixel_leads,refreshed_at)
 select grain,entity_id,day,max(label),true,true,true,false,sum(spend),sum(impressions),sum(link_clicks),
  case when bool_and(landing_page_views is not null) then sum(landing_page_views) end,
  case when bool_and(pixel_leads is not null) then sum(pixel_leads) end,now()
 from dims group by grain,entity_id,day;
 insert into rgv.sync_config(tool,enabled,checkpoint,updated_at) values('parcial',true,jsonb_build_object('status','ok','cutoff',hoje,'inicio',ini,'corte_publicado',corte,'built_at',now(),'deals',n_crm,'linhas_midia',n_media,'ms',round(extract(epoch from clock_timestamp()-t0)*1000)),now())
  on conflict(tool) do update set checkpoint=excluded.checkpoint, updated_at=now();
 return jsonb_build_object('status','ok','inicio',ini,'cutoff',hoje,'deals',n_crm,'linhas_midia',n_media);
end $function$;

-- Coleta do Meta só do dia de hoje, conta Perpétuo, sem marcar janela completa (o dia está aberto).
create or replace function rgv.prepare_meta_today_refresh() returns jsonb language plpgsql set search_path to '' as $function$
declare c rgv.sync_config; hoje date := (now() at time zone 'America/Sao_Paulo')::date; secret_key text; request_id bigint;
begin
select * into c from rgv.sync_config where tool='meta' for update;
if not c.enabled then return jsonb_build_object('status','disabled'); end if;
if (c.checkpoint->>'lease_until')::timestamptz>now() then return jsonb_build_object('status','busy'); end if;
if c.checkpoint->>'priority_period' in ('incremental_hourly','revisao_semanal_7_dias','parcial_hoje') then return jsonb_build_object('status','pending_resume'); end if;
update rgv.sync_config set checkpoint=jsonb_build_object('day',hoje::text,'start_day',hoje::text,'end_day',hoje::text,'account_index',0,'historical_done',false,'priority_period','parcial_hoje','resume_checkpoint',coalesce(c.checkpoint,'{}'::jsonb)),updated_at=now() where tool='meta';
select decrypted_secret into secret_key from vault.decrypted_secrets where name='rgv_sync_key';
if secret_key is null then raise exception 'internal_sync_key_missing'; end if;
request_id:=net.http_post(url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-meta-sync',body:='{"source":"cron"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',secret_key),timeout_milliseconds:=110000);
return jsonb_build_object('status','queued','dia',hoje,'request_id',request_id);
end $function$;

create or replace function rgv.resume_meta_priority_refresh() returns jsonb language plpgsql set search_path to '' as $function$
declare c rgv.sync_config; secret_key text; request_id bigint;
begin
select * into c from rgv.sync_config where tool='meta' for update;
if not c.enabled then return jsonb_build_object('status','disabled'); end if;
if c.checkpoint->>'priority_period' not in ('incremental_hourly','revisao_semanal_7_dias','parcial_hoje') or c.checkpoint->>'priority_period' is null then return jsonb_build_object('status','not_due'); end if;
if (c.checkpoint->>'lease_until')::timestamptz>now() then return jsonb_build_object('status','busy'); end if;
select decrypted_secret into secret_key from vault.decrypted_secrets where name='rgv_sync_key';
if secret_key is null then raise exception 'internal_sync_key_missing'; end if;
request_id:=net.http_post(url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-meta-sync',body:='{"source":"cron"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',secret_key),timeout_milliseconds:=110000);
return jsonb_build_object('status','queued','request_id',request_id);
end $function$;

create or replace function rgv.prepare_meta_hourly_refresh() returns jsonb language plpgsql set search_path to '' as $function$
declare c rgv.sync_config; end_date date; secret_key text; request_id bigint;
begin
select * into c from rgv.sync_config where tool='meta' for update;
if not c.enabled then return jsonb_build_object('status','disabled'); end if;
if (c.checkpoint->>'lease_until')::timestamptz>now() then return jsonb_build_object('status','busy'); end if;
if c.checkpoint->>'priority_period' in ('incremental_hourly','revisao_semanal_7_dias','parcial_hoje') then return jsonb_build_object('status','pending_resume'); end if;
end_date:=(now() at time zone 'America/Sao_Paulo')::date-1;
update rgv.sync_config set checkpoint=jsonb_build_object('day',(end_date-greatest(1,c.rolling_days)+1)::text,'start_day',(end_date-greatest(1,c.rolling_days)+1)::text,'end_day',end_date::text,'account_index',0,'historical_done',false,'priority_period','incremental_hourly','resume_checkpoint',coalesce(c.checkpoint,'{}'::jsonb)),updated_at=now() where tool='meta';
select decrypted_secret into secret_key from vault.decrypted_secrets where name='rgv_sync_key';
if secret_key is null then raise exception 'internal_sync_key_missing'; end if;
request_id:=net.http_post(url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-meta-sync',body:='{"source":"cron"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',secret_key),timeout_milliseconds:=110000);
return jsonb_build_object('status','queued','inicio',end_date-greatest(1,c.rolling_days)+1,'fim',end_date,'request_id',request_id);
end $function$;

-- Cron (pg_cron): coleta do dia a cada meia hora e recálculo da parcial 5 minutos depois.
-- select cron.schedule('rgv-meta-parcial-hoje','15,45 * * * *',$$select rgv.prepare_meta_today_refresh();$$);
-- select cron.schedule('rgv-front-parcial','20,50 * * * *',$$select rgv.build_front_parcial();$$);

-- Nota de implantação (09/10/2026): as tabelas da parcial são atualizadas por upsert com carimbo (refreshed_at/built_at);
-- rgv.front_rows(true) e rgv.crm_snapshot_rows(null) consideram só o carimbo mais recente e os dias depois do corte publicado.
-- Estado da última parcial em rgv.front_parcial_meta. Cron: rgv-meta-parcial-hoje (15,45 * * * *) e rgv-front-parcial (20,50 * * * *).
-- rgv.read_front(p_de,p_ate) devolve periodo.parcial e qualidade.parcial/parcial_atualizado_em/parcial_meta_coletado_em/parcial_hubspot_em.
