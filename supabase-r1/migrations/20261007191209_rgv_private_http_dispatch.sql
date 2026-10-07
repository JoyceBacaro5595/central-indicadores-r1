create extension if not exists http with schema extensions;
create function rgv.dispatch_hubspot() returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg rgv.sync_config; secret text; response extensions.http_response; phase text;
begin
 select * into cfg from rgv.sync_config where tool='hubspot';
 if not cfg.enabled or now()<(cfg.checkpoint->>'start_at')::timestamptz then return jsonb_build_object('status','scheduled'); end if;
 if cfg.checkpoint->>'lease_until' is not null and (cfg.checkpoint->>'lease_until')::timestamptz>now() then return jsonb_build_object('status','busy'); end if;
 if coalesce((cfg.checkpoint->>'bootstrap_done')::boolean,false)
 and mod(extract(minute from now())::integer,coalesce((cfg.checkpoint->>'incremental_cadence_minutes')::integer,30))<>0 then return jsonb_build_object('status','not_due'); end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='rgv_sync_key';
 if secret is null then raise exception 'RGV sync credential missing'; end if;
 phase:=case when not coalesce((cfg.checkpoint->>'bootstrap_done')::boolean,false) and mod(extract(minute from now())::integer,10)=0 then 'bootstrap' else 'incremental' end;
 perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','120000');
 perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','10000');
 select * into response from extensions.http((
 'POST','https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-hubspot-sync',
 array[('x-rgv-sync-key',secret)::extensions.http_header],
 'application/json',jsonb_build_object('phase',phase)::text)::extensions.http_request);
 return jsonb_build_object('http_status',response.status,'result',response.content::jsonb);
exception when others then
 insert into rgv.sync_run(tool,source,status,started_at,finished_at,error_type,error_detail)
 values('hubspot','cron','error',now(),now(),'dispatch_failure','Internal HTTP dispatcher failed; retry next tick');
 return jsonb_build_object('status','dispatch_error');
end $$;
revoke all on function rgv.dispatch_hubspot() from public,anon,authenticated;
grant execute on function rgv.dispatch_hubspot() to service_role;
select cron.schedule('rgv-hubspot-auto','*/5 * * * *','select rgv.dispatch_hubspot();');
