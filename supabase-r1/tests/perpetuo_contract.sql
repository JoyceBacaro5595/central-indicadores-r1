-- Run against r1-indicadores as database administrator. All fixtures roll back.
begin;
do $$ declare j jsonb; begin
 j:=rgv.aggregate_front('2099-01-01','2099-01-02','creative','__contract_test__');
 if j->'investimento'<>'null'::jsonb or j->'mql'<>'null'::jsonb then raise exception 'Missing data must be null'; end if;
 if has_table_privilege('authenticated','rgv.raw_record','SELECT') or has_table_privilege('anon','rgv.deal','SELECT') then
   raise exception 'Raw tables exposed'; end if;
 if has_function_privilege('authenticated','public.perpetuo_ingest_v2(text,jsonb)','EXECUTE')
 or has_function_privilege('anon','public.perpetuo_funil_v2(date,date)','EXECUTE') then raise exception 'Unsafe RPC grants'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='rgv' and c.relkind='r' and not c.relrowsecurity) then
   raise exception 'RLS missing'; end if;
 begin
   perform set_config('request.jwt.claim.sub','',true);
   perform set_config('request.jwt.claims','{}',true);
   perform public.perpetuo_funil_v2('2026-01-01','2026-01-02');
   raise exception 'Anonymous user allowed';
 exception when sqlstate '28000' then null; end;
end $$;
select public.perpetuo_ingest_v2('front_daily','[
 {"grain":"creative","entity_id":"__contract_test__","day":"2099-01-01","media_complete":true,"crm_complete":true,"history_complete":true,"attribution_complete":true,"spend":100,"impressions":1000,"link_clicks":100,"crm_leads":10,"mql":5,"sales":1,"revenue":1000},
 {"grain":"creative","entity_id":"__contract_test__","day":"2099-01-02","media_complete":false,"crm_complete":true,"history_complete":true,"attribution_complete":true,"crm_leads":10,"mql":5,"sales":1,"revenue":1000}
]');
do $$ declare j jsonb; begin
 j:=rgv.aggregate_front('2099-01-01','2099-01-02','creative','__contract_test__');
 if j->'cac'<>'null'::jsonb or j->'roas'<>'null'::jsonb or j->'investimento'<>'null'::jsonb then raise exception 'Partial media costs exposed'; end if;
 if (j->>'mql')::integer<>10 then raise exception 'CRM aggregate incorrect'; end if;
 j:=rgv.aggregate_front('2099-01-01','2099-01-01','creative','__contract_test__');
 if (j->>'cac')::numeric<>100 or (j->>'roas')::numeric<>10 or (j->>'cpmql')::numeric<>20 then raise exception 'Complete costs incorrect'; end if;
 if j->'alcance'<>'null'::jsonb then raise exception 'Reach must not be estimated'; end if;
end $$;
select public.perpetuo_ingest_v2('deal','[{"deal_id":"__contract_test__"}]');
select public.perpetuo_ingest_v2('stage_event','[
 {"deal_id":"__contract_test__","stage_id":"scheduled","entered_at":"2099-01-01T10:00:00Z","source":"test"},
 {"deal_id":"__contract_test__","stage_id":"scheduled","entered_at":"2099-01-02T10:00:00Z","source":"test"}
]');
select public.perpetuo_ingest_v2('stage_event','[{"deal_id":"__contract_test__","stage_id":"scheduled","entered_at":"2099-01-02T10:00:00Z","source":"test"}]');
do $$ begin
 if (select count(*) from rgv.stage_event where deal_id='__contract_test__')<>2 then raise exception 'Reentries/idempotency incorrect'; end if;
end $$;
rollback;
