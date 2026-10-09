-- Parcial de hoje de hora em hora (Joyce, 09/10/2026: "carregar o incremental a cada 00 minuto, de 1 em 1 hora").
-- Grade: minuto 00 = recarga horária do Meta (até ontem) + HubSpot; 04/07/10/13 = coleta do Meta de hoje (só uma por hora,
-- guarda de 25 min); 01–20 = rgv.build_front_parcial_if_new() recalcula a parcial assim que chega coleta nova.
-- Aplicado no banco em 09/10/2026 (registro; já está em produção).

create or replace function rgv.prepare_meta_today_refresh() returns jsonb language plpgsql set search_path to '' as $function$
declare c rgv.sync_config; hoje date := (now() at time zone 'America/Sao_Paulo')::date; secret_key text; request_id bigint;
begin
select * into c from rgv.sync_config where tool='meta' for update;
if not c.enabled then return jsonb_build_object('status','disabled'); end if;
if (c.checkpoint->>'lease_until')::timestamptz>now() then return jsonb_build_object('status','busy'); end if;
if c.checkpoint->>'priority_period' in ('incremental_hourly','revisao_semanal_7_dias','parcial_hoje') then return jsonb_build_object('status','pending_resume'); end if;
if exists (select 1 from rgv.sync_run where tool='meta' and status='success' and checkpoint->>'end_day'=hoje::text and finished_at>now()-interval '25 minutes') then return jsonb_build_object('status','recent'); end if;
update rgv.sync_config set checkpoint=jsonb_build_object('day',hoje::text,'start_day',hoje::text,'end_day',hoje::text,'account_index',0,'historical_done',false,'priority_period','parcial_hoje','resume_checkpoint',coalesce(c.checkpoint,'{}'::jsonb)),updated_at=now() where tool='meta';
select decrypted_secret into secret_key from vault.decrypted_secrets where name='rgv_sync_key';
if secret_key is null then raise exception 'internal_sync_key_missing'; end if;
request_id:=net.http_post(url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-meta-sync',body:='{"source":"cron"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',secret_key),timeout_milliseconds:=110000);
return jsonb_build_object('status','queued','dia',hoje,'request_id',request_id);
end $function$;

create or replace function rgv.build_front_parcial_if_new() returns jsonb language plpgsql set search_path to '' as $function$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; built timestamptz;
begin
select (checkpoint->>'built_at')::timestamptz into built from rgv.front_parcial_meta where id=1;
if exists (select 1 from rgv.sync_run where status='success' and finished_at>coalesce(built,'-infinity'::timestamptz)
           and (tool='hubspot' or (tool='meta' and checkpoint->>'end_day'=hoje::text)))
then return rgv.build_front_parcial();
else return jsonb_build_object('status','sem_novidade','built_at',built); end if;
end $function$;

select cron.alter_job(32, schedule:='4,7,10,13 * * * *');                                   -- rgv-meta-parcial-hoje
select cron.alter_job(33, schedule:='1-20 * * * *', command:='select rgv.build_front_parcial_if_new();'); -- rgv-front-parcial
