CREATE OR REPLACE FUNCTION public.perpetuo_ingest_v2(p_resource text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
   when 'deal' then jsonb_build_object('processed_at',now(),'segmentation_status','pending','history_complete',false, 'source_timezone_verified',false)
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
end $function$;

revoke all on vault.secrets,vault.decrypted_secrets from public,anon,authenticated;
update rgv.sync_config set enabled=true,cron_expression='*/5 * * * *',timeout_ms=90000,
 watermark=(select max(source_modified_at)-interval '1 day' from rgv.raw_record r join rgv.import_batch b on b.id=r.batch_id where b.source='csv'),
 checkpoint=jsonb_build_object('start_at','2026-10-08T00:00:00-03:00','bootstrap_done',false,
 'pipeline_ids',jsonb_build_array('749390743','746355509'),'incremental_cadence_minutes',30,
 'history_batch_size',100), updated_at=now() where tool='hubspot';
select cron.schedule('rgv-hubspot-auto','*/5 * * * *',$job$
select net.http_post(
 url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-hubspot-sync',
 headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',(select decrypted_secret from vault.decrypted_secrets where name='rgv_sync_key')),
 body:=jsonb_build_object('phase',case when coalesce((c.checkpoint->>'bootstrap_done')::boolean,false)=false and mod(extract(minute from now())::integer,10)=0 then 'bootstrap' else 'incremental' end),timeout_milliseconds:=120000)
from rgv.sync_config c
where c.tool='hubspot' and c.enabled
 and now() >= (c.checkpoint->>'start_at')::timestamptz
 and (coalesce((c.checkpoint->>'bootstrap_done')::boolean,false)=false
 or mod(extract(minute from now())::integer,coalesce((c.checkpoint->>'incremental_cadence_minutes')::integer,30))=0)
 and (c.checkpoint->>'lease_until' is null or (c.checkpoint->>'lease_until')::timestamptz<now());
$job$);