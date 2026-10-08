
create table if not exists rgv.meta_complete_window(
 account_id text not null,start_day date not null,end_day date not null,completed_at timestamptz not null default now(),
 primary key(account_id,start_day,end_day),check(end_day>=start_day));
alter table rgv.meta_complete_window enable row level security;
revoke all on rgv.meta_complete_window from public,anon,authenticated;
create table if not exists rgv.front_batch(
 id uuid primary key default gen_random_uuid(),start_day date not null,end_day date not null,
 rules_version text not null,validated boolean not null default false,
 status text not null default 'staging' check(status in('staging','waiting','published')),
 reason text,solution text,created_at timestamptz not null default now(),published_at timestamptz,
 check(end_day>=start_day));
alter table rgv.front_batch enable row level security;
revoke all on rgv.front_batch from public,anon,authenticated;
create table if not exists rgv.front_pending(like rgv.front_daily including defaults including constraints);
alter table rgv.front_pending add column if not exists batch_id uuid references rgv.front_batch(id);
create unique index if not exists front_pending_batch_key on rgv.front_pending(batch_id,grain,entity_id,day);
alter table rgv.front_pending enable row level security;
revoke all on rgv.front_pending from public,anon,authenticated;
create or replace function rgv.try_publish_front(p_batch uuid) returns jsonb language plpgsql set search_path='' as $fn$
declare b rgv.front_batch; why text; n bigint; published_time timestamptz:=now();
begin
perform pg_advisory_xact_lock(hashtextextended('rgv.front_publication',0));
select * into b from rgv.front_batch where id=p_batch for update;
if not found then raise exception 'Lote não encontrado' using errcode='22023'; end if;
if b.status='published' then return jsonb_build_object('status','already_published','batch_id',b.id);end if;
lock table rgv.front_pending in share mode;
if not b.validated then why:='Indicadores ainda não validados pelo ETL';
elsif b.end_day >= (now() at time zone 'America/Sao_Paulo')::date then why:='O corte inclui um dia ainda aberto';
elsif not exists(select 1 from rgv.sync_config where tool='hubspot' and coalesce((checkpoint->>'bootstrap_done')::boolean,false) and watermark >= ((b.end_day+1)::timestamp at time zone 'America/Sao_Paulo')) then why:='HubSpot ainda não completou o corte solicitado';
elsif exists(select 1 from rgv.deal where created_at >= '2026-01-01 00:00:00-03' and created_at < ((b.end_day+1)::timestamp at time zone 'America/Sao_Paulo') and pipeline_id in('749390743','746355509') and not coalesce(history_complete,false)) then why:='HubSpot com histórico pendente';
elsif exists(select 1 from generate_series(b.start_day::timestamp,b.end_day::timestamp,interval '1 day') d cross join (values('696363384474339'),('171474008015977')) a(account_id) where not exists(select 1 from rgv.meta_complete_window w where w.account_id=a.account_id and d::date between w.start_day and w.end_day)) then why:='Meta ainda não completou as duas contas no corte solicitado';
elsif exists(select 1 from generate_series(b.start_day::timestamp,b.end_day::timestamp,interval '1 day') d where not exists(select 1 from rgv.front_pending f where f.batch_id=b.id and f.grain='total' and f.entity_id='all' and f.day=d::date)) then why:='Indicadores diários incompletos no lote';
elsif exists(select 1 from rgv.front_pending where batch_id=b.id and (day not between b.start_day and b.end_day or not media_complete or not crm_complete or not history_complete)) then why:='Lote com cobertura parcial ou datas fora do corte';
end if;
if why is not null then
update rgv.front_batch set status='waiting',reason=why,solution='Concluir ou corrigir a fonte indicada e reconstruir o lote validado. Manter a última publicação completa.' where id=b.id;
return jsonb_build_object('status','waiting','reason',why,'batch_id',b.id);
end if;
delete from rgv.front_daily where day between b.start_day and b.end_day;
insert into rgv.front_daily(grain,entity_id,day,label,media_complete,crm_complete,history_complete,attribution_complete,spend,impressions,link_clicks,landing_page_views,pixel_leads,crm_leads,mql,contact,sql,scheduled,realized,noshow,sales,revenue,refreshed_at)
select grain,entity_id,day,label,media_complete,crm_complete,history_complete,attribution_complete,spend,impressions,link_clicks,landing_page_views,pixel_leads,crm_leads,mql,contact,sql,scheduled,realized,noshow,sales,revenue,published_time from rgv.front_pending where batch_id=b.id;
get diagnostics n=row_count;
update rgv.front_batch set status='published',published_at=published_time,reason=null,solution=null where id=b.id;
delete from rgv.front_pending where batch_id=b.id;
return jsonb_build_object('status','published','batch_id',b.id,'rows',n,'cutoff',b.end_day);
end $fn$;
revoke all on function rgv.try_publish_front(uuid) from public,anon,authenticated;
create or replace function rgv.publication_status() returns jsonb language sql stable set search_path='' as $fn$
select jsonb_build_object('status',coalesce((select status from rgv.front_batch order by created_at desc limit 1),'waiting_first_batch'),
'corte_publicado',(select max(end_day) from rgv.front_batch where status='published'),
'publicado_em',(select max(published_at) from rgv.front_batch where status='published'),
'motivo',coalesce((select reason from rgv.front_batch order by created_at desc limit 1),'Aguardando ETL dos indicadores e cobertura conjunta HubSpot/Meta'),
'solucao',(select solution from rgv.front_batch order by created_at desc limit 1));
$fn$;
revoke all on function rgv.publication_status() from public,anon,authenticated;
create or replace function rgv.dispatch_front_publication() returns jsonb language plpgsql set search_path='' as $fn$
declare id uuid;begin select b.id into id from rgv.front_batch b where status in('staging','waiting') order by created_at desc limit 1;
if id is null then return rgv.publication_status();end if;return rgv.try_publish_front(id);end $fn$;
revoke all on function rgv.dispatch_front_publication() from public,anon,authenticated;
select cron.schedule('rgv-publicacao-conjunta','5 * * * *','select rgv.dispatch_front_publication();');

do $do$ declare d text; begin d:=pg_get_functiondef('rgv.read_front(date,date)'::regprocedure); if position('jsonb_build_object(''publicacao''' in d)=0 then d:=replace(d,'return result;','return result || jsonb_build_object(''publicacao'',rgv.publication_status());'); execute d;end if;end $do$;