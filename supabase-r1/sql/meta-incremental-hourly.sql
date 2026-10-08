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
request_id:=net.http_post(url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-meta-sync',body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',secret_key),timeout_milliseconds:=110000);
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
request_id:=net.http_post(url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-meta-sync',body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',secret_key),timeout_milliseconds:=110000);
return jsonb_build_object('status','queued','request_id',request_id);
end $fn$;
revoke all on function rgv.resume_meta_priority_refresh() from public,anon,authenticated;
-- Existing hourly job name retained to preserve manager integration.
select cron.alter_job(18,command:='select rgv.prepare_meta_hourly_refresh();');
select cron.schedule('rgv-meta-retomar-lote','* * * * *','select rgv.resume_meta_priority_refresh();');
