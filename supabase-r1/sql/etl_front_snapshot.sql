-- Aplicado e validado no Supabase R1. Executar apenas na instalação inicial desta versão.
-- Não é migration inventada: CLI indisponível; SQL versionado para revisão e geração futura.
create table if not exists rgv.front_crm_snapshot (
 batch_id uuid not null references rgv.front_batch(id), deal_id text not null, campaign_id text,
 attribution_status text, missing_principal_history boolean not null, history_complete boolean not null,
 revenue numeric, movement_days jsonb not null, primary key(batch_id,deal_id));
alter table rgv.front_crm_snapshot enable row level security;
revoke all on rgv.front_crm_snapshot from public,anon,authenticated;
create index if not exists front_crm_snapshot_campaign_idx on rgv.front_crm_snapshot(batch_id,campaign_id);
alter table rgv.front_daily drop constraint front_daily_grain_check;
alter table rgv.front_daily add constraint front_daily_grain_check check(grain in('total','campaign','creative','lp'));
alter table rgv.front_pending drop constraint front_daily_grain_check;
alter table rgv.front_pending add constraint front_daily_grain_check check(grain in('total','campaign','creative','lp'));
create or replace function rgv.build_front_batch_v1(p_start date,p_end date) returns jsonb language plpgsql set search_path='' as $$
declare batch uuid;begin
if p_start<date '2026-01-01' or p_end<p_start or p_end>=(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Corte inválido';end if;
perform pg_advisory_xact_lock(hashtextextended('rgv.front_build',0));
insert into rgv.front_batch(start_day,end_day,rules_version,validated) values(p_start,p_end,'crm-frozen-period-v1',false) returning id into batch;
insert into rgv.front_crm_snapshot select batch,deal_id,campaign_id,attribution_status,coalesce(missing_principal_history,false),coalesce(history_complete,false),revenue,movement_days from rgv.crm_funnel_snapshot_at_v1(p_end);
with campaigns as (select campaign_id,max(campaign_name) label from rgv.ad where account_id='696363384474339' and strpos(upper(coalesce(campaign_name,'')),'[FF]')>0 group by campaign_id),
entities as (select 'total'::text grain,'all'::text entity_id,'Perpétuo RGV · [FF]'::text label union all select 'campaign',campaign_id,label from campaigns),
days as (select d::date as day from generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') d),
media as (select a.campaign_id,m.day,sum(m.spend) spend,sum(m.impressions) impressions,sum(m.link_clicks) clicks,
case when bool_and(m.landing_page_views is not null) then sum(m.landing_page_views) end views,
case when bool_and(m.pixel_leads is not null) then sum(m.pixel_leads) end pixel
from rgv.ad_daily m join rgv.ad a using(account_id,ad_id) join campaigns c using(campaign_id)
where m.account_id='696363384474339' and m.day between p_start and p_end group by a.campaign_id,m.day),
aggregated as (select 'campaign'::text grain,campaign_id entity_id,day,spend,impressions,clicks,views,pixel from media
union all select 'total','all',day,sum(spend),sum(impressions),sum(clicks),case when bool_and(views is not null) then sum(views) end,case when bool_and(pixel is not null) then sum(pixel) end from media group by day)
insert into rgv.front_pending(batch_id,grain,entity_id,day,label,media_complete,crm_complete,history_complete,attribution_complete,spend,impressions,link_clicks,landing_page_views,pixel_leads)
select batch,e.grain,e.entity_id,d.day,e.label,
exists(select 1 from rgv.meta_complete_window w where w.account_id='696363384474339' and d.day between w.start_day and w.end_day),
true,not exists(select 1 from rgv.front_crm_snapshot s where s.batch_id=batch and not s.history_complete),
false,coalesce(m.spend,0),coalesce(m.impressions,0),coalesce(m.clicks,0),case when m.entity_id is null then 0 else m.views end,case when m.entity_id is null then 0 else m.pixel end
from entities e cross join days d left join aggregated m on m.grain=e.grain and m.entity_id=e.entity_id and m.day=d.day;
update rgv.front_batch set validated=true where id=batch;
return rgv.try_publish_front(batch);
end $$;
revoke all on function rgv.build_front_batch_v1(date,date) from public,anon,authenticated;
create or replace function rgv.aggregate_crm_frozen(p_de date,p_ate date,p_grain text,p_entity text) returns jsonb language sql stable set search_path='' as $$
with batch as(select id from rgv.front_batch where status='published' and start_day<=p_de and end_day>=p_ate order by published_at desc limit 1),
e as(select s.deal_id,s.revenue,k.key step from rgv.front_crm_snapshot s join batch b on b.id=s.batch_id
cross join lateral jsonb_each(s.movement_days) k where (p_grain='total' or (p_grain='campaign' and s.campaign_id=p_entity))
and exists(select 1 from jsonb_array_elements_text(k.value) v where v::date between p_de and p_ate)),
counts as(select step,count(distinct deal_id) n from e group by step),
revenue as(select sum(amount) n from(select deal_id,max(revenue) amount from e where step='sales' group by deal_id) q)
select case when exists(select 1 from batch) then jsonb_build_object(
'leads_crm',coalesce((select n from counts where step='crm_leads'),0),'mql',coalesce((select n from counts where step='mql'),0),
'contato_efetivo',coalesce((select n from counts where step='contact'),0),'sql',coalesce((select n from counts where step='sql'),0),
'reunioes_agendadas',coalesce((select n from counts where step='scheduled'),0),'reunioes_realizadas',coalesce((select n from counts where step='realized'),0),
'noshow',coalesce((select n from counts where step='noshow'),0),'vendas',coalesce((select n from counts where step='sales'),0),
'faturamento',case when exists(select 1 from e where step='sales' and revenue is null) then null else coalesce((select n from revenue),0) end)
else '{}'::jsonb end $$;
revoke all on function rgv.aggregate_crm_frozen(date,date,text,text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION rgv.aggregate_media_front(p_de date, p_ate date, p_grain text, p_entity text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with x as (
 select count(*) as days, bool_and(media_complete) as media, bool_and(crm_complete) as crm,
 bool_and(history_complete) as history, bool_and(attribution_complete) as attributed,
 sum(spend) spend,sum(impressions) impressions,sum(link_clicks) clicks,sum(landing_page_views) views,
 sum(pixel_leads) pixel,sum(crm_leads) leads,sum(mql) mql,sum(contact) contact,sum(sql) sql,
 sum(scheduled) scheduled,sum(realized) realized,sum(noshow) noshow,sum(sales) sales,sum(revenue) revenue
 from rgv.front_daily where grain=p_grain and entity_id=p_entity and day between p_de and p_ate
), flags as (
 select *, days=p_ate-p_de+1 and coalesce(media,false) media_ok,
 days=p_ate-p_de+1 and coalesce(crm,false) crm_ok,
 days=p_ate-p_de+1 and coalesce(history,false) history_ok,
 days=p_ate-p_de+1 and coalesce(media and crm and history and attributed,false) costs_ok from x
)
select jsonb_build_object(
 'investimento',case when media_ok then spend end,'impressoes',case when media_ok then impressions end,
 'cliques',case when media_ok then clicks end,'visualizacoes_lp',case when media_ok then views end,
 'alcance',(select reach from rgv.period_reach where grain=p_grain and entity_id=p_entity and start_day=p_de and end_day=p_ate and verified),
 'leads_pixel',case when media_ok then pixel end,'leads_crm',case when crm_ok then leads end,
 'mql',case when crm_ok then mql end,'contato_efetivo',case when crm_ok and history_ok then contact end,
 'sql',case when crm_ok and history_ok then sql end,'reunioes_agendadas',case when crm_ok and history_ok then scheduled end,
 'reunioes_realizadas',case when crm_ok and history_ok then realized end,'noshow',case when crm_ok and history_ok then noshow end,
 'vendas',case when crm_ok and history_ok then sales end,'faturamento',case when crm_ok and history_ok then revenue end,
 'cpm',case when media_ok and impressions>0 then round(spend/impressions*1000,2) end,
 'ctr',case when media_ok and impressions>0 then round(clicks::numeric/impressions*100,2) end,
 'cpc',case when media_ok and clicks>0 then round(spend/clicks,2) end,
 'cpl_pixel',case when media_ok and pixel>0 then round(spend/pixel,2) end,
 'cpl',case when costs_ok and leads>0 then round(spend/leads,2) end,
 'cpmql',case when costs_ok and mql>0 then round(spend/mql,2) end,
 'custo_reuniao',case when costs_ok and realized>0 then round(spend/realized,2) end,
 'cac',case when costs_ok and sales>0 then round(spend/sales,2) end,
 'roas',case when costs_ok and spend>0 then round(revenue/spend,2) end,
 'conversao_lp',case when costs_ok and views>0 then round(leads::numeric/views*100,2) end,
 'taxa_mql',case when crm_ok and leads>0 then round(mql::numeric/leads*100,2) end,
 'taxa_contato',case when crm_ok and history_ok and mql>0 then round(contact::numeric/mql*100,2) end,
 'taxa_sql',case when crm_ok and history_ok and contact>0 then round(sql::numeric/contact*100,2) end,
 'taxa_agendamento',case when crm_ok and history_ok and sql>0 then round(scheduled::numeric/sql*100,2) end,
 'taxa_comparecimento',case when crm_ok and history_ok and scheduled>0 then round(realized::numeric/scheduled*100,2) end,
 'taxa_fechamento',case when crm_ok and history_ok and realized>0 then round(sales::numeric/realized*100,2) end,
 'cobertura',jsonb_build_object('dias_esperados',p_ate-p_de+1,'dias_carregados',days,
 'midia_completa',media_ok,'crm_completo',crm_ok,'historico_completo',history_ok,'custos_validos',costs_ok)
) from flags;
$function$;

create or replace function rgv.aggregate_front(p_de date,p_ate date,p_grain text,p_entity text) returns jsonb language plpgsql stable set search_path='' as $$
declare m jsonb;c jsonb;l numeric;q numeric;co numeric;s numeric;ag numeric;r numeric;v numeric;begin
m:=rgv.aggregate_media_front(p_de,p_ate,p_grain,p_entity);
if p_grain not in('total','campaign') then return m;end if;
c:=rgv.aggregate_crm_frozen(p_de,p_ate,p_grain,p_entity);m:=m||c;
l:=(m->>'leads_crm')::numeric;q:=(m->>'mql')::numeric;co:=(m->>'contato_efetivo')::numeric;s:=(m->>'sql')::numeric;
ag:=(m->>'reunioes_agendadas')::numeric;r:=(m->>'reunioes_realizadas')::numeric;v:=(m->>'vendas')::numeric;
return m||jsonb_build_object('taxa_mql',round(q/nullif(l,0)*100,2),'taxa_contato',round(co/nullif(q,0)*100,2),
'taxa_sql',round(s/nullif(co,0)*100,2),'taxa_agendamento',round(ag/nullif(s,0)*100,2),
'taxa_comparecimento',round(r/nullif(ag,0)*100,2),'taxa_fechamento',round(v/nullif(r,0)*100,2));
end $$;
revoke all on function rgv.aggregate_media_front(date,date,text,text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION rgv.read_front(p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; de date:=coalesce(p_de,date '2026-01-01');
 ate date:=coalesce(p_ate,(now() at time zone 'America/Sao_Paulo')::date-1);
begin
 if auth.uid() is null then raise exception 'Login necessário' using errcode='28000'; end if;
 perform identity.exigir('painel');
 if ate<de or ate-de>1095 then raise exception 'Período inválido (máximo 1096 dias)' using errcode='22023'; end if;
 select jsonb_build_object(
 'versao',2,'atualizado_em',(select max(refreshed_at) from rgv.front_daily),
 'periodo',jsonb_build_object('inicio',de,'fim',ate),
 'ciclos',coalesce((select jsonb_agg(jsonb_build_object('ciclo',ciclo,'numero',numero,'inicio',inicio,'fim',fim,'dias',dias) order by numero) from marts.dim_ciclo),'[]'::jsonb),
 'fontes',jsonb_build_object(
   'meta_ate',(select max(day) from rgv.front_daily where grain='total' and media_complete),
   'funil_ate',(select max(day) from rgv.front_daily where grain='total' and crm_complete and history_complete),
   'meta_no_periodo',exists(select 1 from rgv.front_daily where grain='total' and media_complete and day between de and ate),
   'funil_no_periodo',exists(select 1 from rgv.front_daily where grain='total' and crm_complete and history_complete and day between de and ate),
   'criativo',exists(select 1 from rgv.front_daily where grain='creative' and day between de and ate),
   'lp',exists(select 1 from rgv.front_daily where grain='lp' and day between de and ate)),
 'resumo',rgv.aggregate_front(de,ate,'total','all'),
 'diario',coalesce((select jsonb_agg(jsonb_build_object('data',day)||rgv.aggregate_front(day,day,'total','all') order by day) from rgv.front_daily where grain='total' and day between de and ate),'[]'::jsonb),
 'por_campanha',(select jsonb_agg(jsonb_build_object('id',entity_id,'campanha',label)||rgv.aggregate_front(de,ate,'campaign',entity_id) order by entity_id) from (select entity_id,max(label) label from rgv.front_daily where grain='campaign' and day between de and ate group by entity_id) q),
 'por_criativo',(select jsonb_agg(jsonb_build_object('id',entity_id,'criativo',label)||rgv.aggregate_front(de,ate,'creative',entity_id) order by entity_id) from (select entity_id,max(label) label from rgv.front_daily where grain='creative' and day between de and ate group by entity_id) q),
 'por_lp',(select jsonb_agg(jsonb_build_object('id',entity_id,'pagina',label)||rgv.aggregate_front(de,ate,'lp',entity_id) order by entity_id) from (select entity_id,max(label) label from rgv.front_daily where grain='lp' and day between de and ate group by entity_id) q)
 ) into result;
 return result || jsonb_build_object('publicacao',rgv.publication_status());
end $function$
;