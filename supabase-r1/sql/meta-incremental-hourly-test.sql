begin;
do $test$
declare result jsonb;
begin
update rgv.sync_config set checkpoint=coalesce(checkpoint,'{}'::jsonb)||jsonb_build_object('lease_until',now()+interval '5 minutes') where tool='meta';
result:=rgv.prepare_meta_hourly_refresh();
if result->>'status'<>'busy' then raise exception 'hourly lease guard failed'; end if;
update rgv.sync_config set enabled=false where tool='meta';
if rgv.prepare_meta_hourly_refresh()->>'status'<>'disabled' or rgv.resume_meta_priority_refresh()->>'status'<>'disabled' then raise exception 'disabled guard failed'; end if;
if has_function_privilege('anon','rgv.prepare_meta_hourly_refresh()','EXECUTE') or has_function_privilege('authenticated','rgv.resume_meta_priority_refresh()','EXECUTE') then raise exception 'internal dispatcher exposed'; end if;
end $test$;
rollback;
