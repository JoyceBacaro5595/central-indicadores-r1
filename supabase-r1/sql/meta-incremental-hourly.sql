-- Meta incremental hourly; continuation resumes the same job, never starts an independent refresh.
create or replace function rgv.prepare_meta_hourly_refresh() returns jsonb
language plpgsql set search_path='' as $fn$
declare c rgv.sync_config; end_date date; secret_key text; request_id bigint;
begin
select * into c from rgv.sync_config where tool='meta' for update;
if not c.enabled then return jsonb_build_object('status','disabled'); end if;
if (c.checkpoint->>'lease_until')::timestamptz>now() then return jsonb_build_object('status','busy'); end if;
if c.checkpoint->>'priority_period' in ('incremental_hourly','revisao_semanal_7_dias') then return jsonb_build_object('status','pending_resume'); end if;
end_date:=(now() at time zone 'America/Sao_Paulo')::date-1;
update rgv.sync_config set checkpoint=jsonb_build_object('day',end_date::text,'start_day',end_date::text,'end_day',end_date::text,'account_index',0,'historical_done',false,'priority_period','incremental_hourly','resume_checkpoint',coalesce(c.checkpoint,'{}'::jsonb)),updated_at=now() where tool='meta';
select decrypted_secret into secret_key from vault.decrypted_secrets where name='rgv_sync_key';
if secret_key is null then raise exception 'internal_sync_key_missing'; end if;
request_id:=net.http_post(url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-meta-sync',body:='{"source":"cron"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',secret_key),timeout_milliseconds:=110000);
return jsonb_build_object('status','queued','inicio',end_date,'fim',end_date,'request_id',request_id);
end $fn$;
revoke all on function rgv.prepare_meta_hourly_refresh() from public,anon,authenticated;
create or replace function rgv.resume_meta_priority_refresh() returns jsonb
language plpgsql set search_path='' as $fn$
declare c rgv.sync_config; secret_key text; request_id bigint;
begin
select * into c from rgv.sync_config where tool='meta' for update;
if not c.enabled then return jsonb_build_object('status','disabled'); end if;
if c.checkpoint->>'priority_period' not in ('incremental_hourly','revisao_semanal_7_dias') or c.checkpoint->>'priority_period' is null then return jsonb_build_object('status','not_due'); end if;
if (c.checkpoint->>'lease_until')::timestamptz>now() then return jsonb_build_object('status','busy'); end if;
select decrypted_secret into secret_key from vault.decrypted_secrets where name='rgv_sync_key';
if secret_key is null then raise exception 'internal_sync_key_missing'; end if;
request_id:=net.http_post(url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-meta-sync',body:='{"source":"cron"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',secret_key),timeout_milliseconds:=110000);
return jsonb_build_object('status','queued','request_id',request_id);
end $fn$;
revoke all on function rgv.resume_meta_priority_refresh() from public,anon,authenticated;
-- Existing hourly job name retained to preserve manager integration.
select cron.alter_job(18,command:='select rgv.prepare_meta_hourly_refresh();');
select cron.schedule('rgv-meta-retomar-lote','* * * * *','select rgv.resume_meta_priority_refresh();');

create or replace function rgv.prepare_meta_weekly_refresh() returns jsonb language plpgsql set search_path='' as $fn$
declare c rgv.sync_config; end_date date; start_date date; secret_key text; request_id bigint;
begin
select * into c from rgv.sync_config where tool='meta' for update;
if not c.enabled then return jsonb_build_object('status','disabled'); end if;
if (c.checkpoint->>'lease_until')::timestamptz>now() then
insert into rgv.sync_run(tool,source,status,started_at,finished_at,error_type,error_detail) values('meta','cron','error',now(),now(),'weekly_refresh_busy','Revisão semanal não iniciada: coleta em andamento. Solução: repetir a revisão de 7 dias após liberar a execução; ponto salvo preservado.');
return jsonb_build_object('status','busy'); end if;
end_date:=(now() at time zone 'America/Sao_Paulo')::date-1;start_date:=end_date-6;
update rgv.sync_config set checkpoint=jsonb_build_object('day',start_date::text,'start_day',start_date::text,'end_day',end_date::text,'account_index',0,'account_ids',jsonb_build_array('696363384474339','171474008015977'),'historical_done',false,'priority_period','revisao_semanal_7_dias','resume_checkpoint',coalesce(c.checkpoint,'{}'::jsonb)),updated_at=now() where tool='meta';
select decrypted_secret into secret_key from vault.decrypted_secrets where name='rgv_sync_key';
request_id:=net.http_post(url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-meta-sync',body:='{"source":"cron"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',secret_key),timeout_milliseconds:=110000);
return jsonb_build_object('status','queued','inicio',start_date,'fim',end_date,'request_id',request_id);
end $fn$;
revoke all on function rgv.prepare_meta_weekly_refresh() from public,anon,authenticated;

create or replace function rgv.queue_meta_metadata_refresh(p_end date) returns bigint language plpgsql set search_path='' as $fn$
declare secret_key text; request_id bigint;
begin
if p_end is null or p_end>=(now() at time zone 'America/Sao_Paulo')::date then raise exception 'closed_cut_required'; end if;
select decrypted_secret into secret_key from vault.decrypted_secrets where name='rgv_sync_key';
if secret_key is null then raise exception 'internal_sync_key_missing'; end if;
request_id:=net.http_post(url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-meta-metadata-sync',body:=jsonb_build_object('date_from','2026-09-01','date_to',p_end,'source','cron'),headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',secret_key),timeout_milliseconds:=110000);
return request_id;
exception when others then
insert into rgv.sync_run(tool,source,status,started_at,finished_at,error_type,error_detail) values('meta','cron','error',now(),now(),'metadata_dispatch_failure','Falha ao iniciar atualização dos metadados. Solução: conferir a função de metadados e repetir após liberar a execução; mídia coletada preservada.');
return null;
end $fn$;
revoke all on function rgv.queue_meta_metadata_refresh(date) from public,anon,authenticated;
