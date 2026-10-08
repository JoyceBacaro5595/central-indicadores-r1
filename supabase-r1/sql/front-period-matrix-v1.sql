-- Authenticated full RPC passes statement_timeout=8s after this optimization.
-- Counts distinct deals per step across the period; daily reentries are not summed for period totals.

create or replace function rgv.crm_period_matrix(p_de date,p_ate date)
returns table(grain text,entity text,counts jsonb)
language sql stable set search_path='' as $$
with b as (select id from rgv.front_batch where status='published' and start_day<=p_de and end_day>=p_ate order by published_at desc limit 1),
e as materialized (
select s.deal_id,s.campaign_id,s.revenue,k.key step,v::date as event_day
from rgv.front_crm_snapshot s join b on b.id=s.batch_id
cross join lateral jsonb_each(s.movement_days) k
cross join lateral jsonb_array_elements_text(k.value) v
where v::date between p_de and p_ate
),
period_f as (select deal_id,campaign_id,step,max(revenue) revenue from e group by deal_id,campaign_id,step),
daily_f as (select deal_id,event_day,step,max(revenue) revenue from e group by deal_id,event_day,step),
groups as (
 select case when grouping(campaign_id)=1 then 'total' else 'campaign' end grain,
 case when grouping(campaign_id)=1 then 'all' else campaign_id end entity,step,count(*) n,
 sum(revenue) amount,bool_or(revenue is null) missing_revenue from period_f
 group by grouping sets ((step),(campaign_id,step))
 union all select 'daily',event_day::text,step,count(*),sum(revenue),bool_or(revenue is null) from daily_f group by event_day,step
),
mapped as(select grain,entity,jsonb_object_agg(step,n) obj,
max(amount) filter(where step='sales') amount,
bool_or(missing_revenue) filter(where step='sales') missing_revenue
from groups where entity is not null group by grain,entity)
select grain,entity,jsonb_build_object(
'leads_crm',coalesce((obj->>'crm_leads')::bigint,0),'mql',coalesce((obj->>'mql')::bigint,0),
'contato_efetivo',coalesce((obj->>'contact')::bigint,0),'sql',coalesce((obj->>'sql')::bigint,0),
'reunioes_agendadas',coalesce((obj->>'scheduled')::bigint,0),
'reunioes_realizadas',coalesce((obj->>'realized')::bigint,0),
'noshow',coalesce((obj->>'noshow')::bigint,0),'vendas',coalesce((obj->>'sales')::bigint,0),
'faturamento',case when missing_revenue then null else coalesce(amount,0) end,
'taxa_mql',case when (obj->>'crm_leads')::numeric>0 then round((obj->>'mql')::numeric/(obj->>'crm_leads')::numeric*100,2) end,
'taxa_contato',null,'taxa_sql',null,'taxa_agendamento',null,'taxa_comparecimento',null,'taxa_fechamento',null,
'taxas_observacao','Contagens operacionais por período; taxas entre etapas aguardam coorte comparável.'
) from mapped
$$;
revoke all on function rgv.crm_period_matrix(date,date) from public,anon,authenticated;
create index if not exists ad_creative_lookup_idx on rgv.ad(account_id,creative_id) where creative_id is not null;
create index if not exists ad_lp_lookup_idx on rgv.ad(account_id,lp_id) where lp_id is not null;

CREATE OR REPLACE FUNCTION rgv.read_front(p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; crm jsonb; complete_crm boolean; de date:=coalesce(p_de,date '2026-01-01');
 ate date:=coalesce(p_ate,(now() at time zone 'America/Sao_Paulo')::date-1);
begin
 if auth.uid() is null then raise exception 'Login necessário' using errcode='28000'; end if;
 perform identity.exigir('painel');
 if ate<de or ate-de>1095 then raise exception 'Período inválido (máximo 1096 dias)' using errcode='22023'; end if;
 complete_crm:=exists(select 1 from rgv.front_batch where status='published' and start_day<=de and end_day>=ate);
select coalesce(jsonb_object_agg(grain||':'||entity,counts),'{}'::jsonb) into crm from rgv.crm_period_matrix(de,ate);
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
 'resumo',(rgv.aggregate_media_front(de,ate,'total','all') || case when complete_crm then coalesce(crm->'total:all',jsonb_build_object('leads_crm',0,'mql',0,'contato_efetivo',0,'sql',0,'reunioes_agendadas',0,'reunioes_realizadas',0,'noshow',0,'vendas',0,'faturamento',0,'taxa_mql',null,'taxa_contato',null,'taxa_sql',null,'taxa_agendamento',null,'taxa_comparecimento',null,'taxa_fechamento',null)) else '{}'::jsonb end),
 'diario',coalesce((select jsonb_agg(jsonb_build_object('data',day)||(rgv.aggregate_media_front(day,day,'total','all') || case when complete_crm then coalesce(crm->('daily:'||day::text),jsonb_build_object('leads_crm',0,'mql',0,'contato_efetivo',0,'sql',0,'reunioes_agendadas',0,'reunioes_realizadas',0,'noshow',0,'vendas',0,'faturamento',0,'taxa_mql',null,'taxa_contato',null,'taxa_sql',null,'taxa_agendamento',null,'taxa_comparecimento',null,'taxa_fechamento',null)) else '{}'::jsonb end) order by day) from rgv.front_daily where grain='total' and day between de and ate),'[]'::jsonb),
 'por_campanha',(select jsonb_agg(jsonb_build_object('id',entity_id,'campanha',label,'status',(select case when bool_or(a.campaign_status='ACTIVE') then 'ACTIVE' when bool_or(a.campaign_status is not null) then 'PAUSED' end from rgv.ad a where a.account_id='696363384474339' and a.campaign_id=q.entity_id))||(rgv.aggregate_media_front(de,ate,'campaign',entity_id) || case when complete_crm then coalesce(crm->('campaign:'||entity_id),jsonb_build_object('leads_crm',0,'mql',0,'contato_efetivo',0,'sql',0,'reunioes_agendadas',0,'reunioes_realizadas',0,'noshow',0,'vendas',0,'faturamento',0,'taxa_mql',null,'taxa_contato',null,'taxa_sql',null,'taxa_agendamento',null,'taxa_comparecimento',null,'taxa_fechamento',null)) else '{}'::jsonb end) order by entity_id) from (select entity_id,max(label) label from rgv.front_daily where grain='campaign' and day between de and ate group by entity_id) q),
 'por_criativo',(select jsonb_agg(jsonb_build_object('id',entity_id,'criativo',label,'preview_url',(select max(a.preview_url) from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),'imagem_url',(select max(a.preview_url) from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),'thumbnail_url',(select max(a.preview_url) from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),'status',(select case when bool_or(a.ad_status='ACTIVE') then 'ACTIVE' when bool_or(a.ad_status is not null) then 'PAUSED' else null end from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),'status_anuncio',(select case when bool_or(a.ad_status='ACTIVE') then 'ACTIVE' when bool_or(a.ad_status is not null) then 'PAUSED' else null end from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),'atribuicao_completa',false,'motivo_indisponivel','Funil CRM por criativo aguarda atribuição completa; a mídia e imagem são reais.')||rgv.aggregate_dimension_media(de,ate,'creative',entity_id) order by entity_id) from (select entity_id,max(label) label from rgv.front_daily where grain='creative' and day between de and ate group by entity_id) q),
 'por_lp',(select jsonb_agg(jsonb_build_object('id',entity_id,'pagina',label,'url',(select max(a.destination_url) from rgv.ad a where a.account_id='696363384474339' and a.lp_id=q.entity_id),'status',(select case when bool_or(a.ad_status='ACTIVE') then 'ACTIVE' when bool_or(a.ad_status is not null) then 'PAUSED' else null end from rgv.ad a where a.account_id='696363384474339' and a.lp_id=q.entity_id),'atribuicao_completa',false,'motivo_indisponivel','LP de destino da Meta; página de conversão no Hub ainda não comprovada.')||rgv.aggregate_dimension_media(de,ate,'lp',entity_id) order by entity_id) from (select entity_id,max(label) label from rgv.front_daily where grain='lp' and day between de and ate group by entity_id) q)
 ) into result;
 result:=result||jsonb_build_object('qualidade',jsonb_build_object(
'atribuicao_completa',false,'motivo','Criativos e LPs mostram mídia real. Funil por item aguarda atribuição comprovada; nomes repetidos permanecem ambíguos.',
'periodo_completo_inicio',(select min(day) from rgv.front_daily where grain='total'),
'periodo_completo_fim',(select max(day) from rgv.front_daily where grain='total')));
return result || jsonb_build_object('publicacao',rgv.publication_status());
end $function$
;
