begin;
insert into rgv.deal(deal_id,pipeline_id,current_stage_id,created_at,modified_at,current_stage_entered_at,product,utm_campaign,amount) values
('__test_transfer__','746355509','1086562153','2026-09-01T12:00:00Z','2026-09-03T12:00:00Z','2026-09-03T12:00:00Z','RGV 45','[FF] fixture',100),
('__test_won__','746355509','1086562155','2026-09-01T12:00:00Z','2026-09-03T12:00:00Z','2026-09-03T12:00:00Z','Método RGV 46','[FF] fixture',200),
('__test_processos__','746355509','1086562155','2026-09-01T12:00:00Z','2026-09-03T12:00:00Z','2026-09-03T12:00:00Z','RGV Processos 46','[FF] fixture',300);
insert into rgv.stage_event(deal_id,pipeline_id,stage_id,entered_at,source) values
('__test_transfer__','749390743','1089186216','2026-09-02T12:00:00Z','test'),
('__test_won__','749390743','1089186216','2026-09-02T12:00:00Z','test'),
('__test_won__','746355509','1086562155','2026-09-03T12:00:00Z','test');
do $$ begin
 if (select count(*) from rgv.crm_funnel_deal_v1 where deal_id='__test_transfer__')<>1 then raise exception 'Transfer duplicated'; end if;
 if (select sale_at is not null from rgv.crm_funnel_deal_v1 where deal_id='__test_transfer__') then raise exception 'Pending boleto counted as sale'; end if;
 if not (select scheduled_at is not null and mql_at is not null and contact_at is not null and sql_at is null from rgv.crm_funnel_deal_v1 where deal_id='__test_transfer__') then raise exception 'Stage evidence or downstream MQL/contact wrong'; end if;
 if not (select sale_at is not null and revenue=200 from rgv.crm_funnel_deal_v1 where deal_id='__test_won__') then raise exception 'Valid boleto won omitted'; end if;
 if exists(select 1 from rgv.crm_funnel_deal_v1 where deal_id='__test_processos__') then raise exception 'RGV Processos included'; end if;
end $$;
update rgv.deal set current_stage_id='1086973557' where deal_id='__test_won__';
do $$ begin
 if not (select sale_at is null and historical_won_at is not null from rgv.crm_funnel_deal_v1 where deal_id='__test_won__') then raise exception 'Cancellation did not preserve historical won/remove current sale'; end if;
end $$;
rollback;