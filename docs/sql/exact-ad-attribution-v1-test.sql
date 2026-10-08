begin;
insert into rgv.ad(account_id,ad_id,campaign_id,campaign_name,ad_name,creative_id) values
('696363384474339','__ad_unique__','__campaign_fixture__','[FF] attribution fixture','unique fixture','__creative_unique__'),
('696363384474339','__ad_dup1__','__campaign_fixture__','[FF] attribution fixture','dup fixture','__creative_dup1__'),
('696363384474339','__ad_dup2__','__campaign_fixture__','[FF] attribution fixture','dup fixture','__creative_dup2__');
insert into rgv.deal(deal_id,pipeline_id,current_stage_id,created_at,modified_at,utm_campaign,utm_content) values
('__attr_unique__','749390743','1089131932','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','[FF] attribution fixture','unique fixture'),
('__attr_ambiguous__','749390743','1089131932','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','[FF] attribution fixture','dup fixture'),
('__attr_manual__','749390743','1089131932','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','[FF] attribution fixture','unique fixture');
insert into rgv.attribution(deal_id,account_id,ad_id,method,status) values('__attr_manual__','696363384474339','__ad_dup1__','manual_pinned','verified');
select rgv.refresh_exact_ad_attribution_v1(array['__attr_unique__','__attr_ambiguous__','__attr_manual__']);
do $$ begin
 if not(select status='verified' and ad_id='__ad_unique__' and lp_id is null from rgv.attribution where deal_id='__attr_unique__') then raise exception 'Unique attribution or LP invariant failed'; end if;
 if not(select status='ambiguous' and ad_id is null from rgv.attribution where deal_id='__attr_ambiguous__') then raise exception 'Duplicate names incorrectly assigned'; end if;
 if not(select method='manual_pinned' and ad_id='__ad_dup1__' from rgv.attribution where deal_id='__attr_manual__') then raise exception 'Manual pinned overwritten'; end if;
end $$;
rollback;