begin;
insert into rgv.deal(deal_id,pipeline_id,current_stage_id,current_stage_entered_at,created_at,modified_at,product,utm_campaign,amount) values
('__reason_icp__','749390743','1089131938','2026-09-03T12:00:00Z','2026-09-01T12:00:00Z','2026-09-03T12:00:00Z',null,'[FF] fixture',null),
('__reason_competitor__','749390743','1089131938','2026-09-03T12:00:00Z','2026-09-01T12:00:00Z','2026-09-03T12:00:00Z',null,'[FF] fixture',null),
('__sale_final__','749390743','1089132034','2026-09-03T12:00:00Z','2026-09-01T12:00:00Z','2026-09-03T12:00:00Z','RGV 45','[FF] fixture',100),
('__boleto_final__','746355509','1100570524','2026-09-03T12:00:00Z','2026-09-01T12:00:00Z','2026-09-03T12:00:00Z','RGV 45','[FF] fixture',100);
insert into rgv.property_event(deal_id,property_name,value,occurred_at) values
('__reason_icp__','motivo_de_loss__sdr_','Fora do ICP (Ideal Customer Persona)','2026-09-03T12:00:00Z'),
('__reason_competitor__','motivo_de_perda__closer_','Comprou da concorrência','2026-09-03T12:00:00Z');
do $$ begin
 if not (select contact_at is not null and sql_at is null and scheduled_at is null from rgv.crm_funnel_deal_v1 where deal_id='__reason_icp__') then raise exception 'ICP incorrectly mapped'; end if;
 if not (select sql_at is not null and scheduled_at is null from rgv.crm_funnel_deal_v1 where deal_id='__reason_competitor__') then raise exception 'Competitor reason incorrectly mapped'; end if;
 if not (select sale_at is not null from rgv.crm_funnel_deal_v1 where deal_id='__sale_final__') then raise exception 'Principal Finalizando sale omitted'; end if;
 if (select sale_at is not null from rgv.crm_funnel_deal_v1 where deal_id='__boleto_final__') then raise exception 'Boleto Finalizando counted sale'; end if;
 if not (select movement_days ? 'contact' and not movement_days ? 'sql' from rgv.crm_funnel_snapshot_at_v1('2026-10-07') where deal_id='__reason_icp__') then raise exception 'Snapshot ICP mapping failed'; end if;
 if not (select movement_days ? 'sql' and not movement_days ? 'scheduled' from rgv.crm_funnel_snapshot_at_v1('2026-10-07') where deal_id='__reason_competitor__') then raise exception 'Snapshot competitor mapping failed'; end if;
end $$;
rollback;