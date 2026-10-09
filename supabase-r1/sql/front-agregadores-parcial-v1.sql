-- Agregadores do front lendo o lote publicado (rgv.front_daily) e, quando p_parcial=true, também a parcial em tempo real
-- (rgv.front_daily_parcial: dias depois do corte publicado até hoje). As assinaturas antigas continuam valendo (p_parcial=false).
create or replace function rgv.front_rows(p_parcial boolean) returns setof rgv.front_daily language sql stable set search_path to '' as $$
 select * from rgv.front_daily union all select * from rgv.front_daily_parcial where p_parcial $$;

create or replace function rgv.aggregate_media_front(p_de date, p_ate date, p_grain text, p_entity text, p_parcial boolean)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' AS $function$
with x as (
 select count(*) as days, bool_and(media_complete) as media, bool_and(crm_complete) as crm,
 bool_and(history_complete) as history, bool_and(attribution_complete) as attributed,
 sum(spend) spend,sum(impressions) impressions,sum(link_clicks) clicks,sum(landing_page_views) views,
 sum(pixel_leads) pixel,sum(crm_leads) leads,sum(mql) mql,sum(contact) contact,sum(sql) sql,
 sum(scheduled) scheduled,sum(realized) realized,sum(noshow) noshow,sum(sales) sales,sum(revenue) revenue
 from rgv.front_rows(p_parcial) where grain=p_grain and entity_id=p_entity and day between p_de and p_ate
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
create or replace function rgv.aggregate_media_front(p_de date, p_ate date, p_grain text, p_entity text)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' AS $$ select rgv.aggregate_media_front(p_de,p_ate,p_grain,p_entity,false) $$;

create or replace function rgv.aggregate_dimension_media(p_de date, p_ate date, p_grain text, p_entity text, p_parcial boolean)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' AS $function$
with x as (
 select count(*) as days, bool_and(media_complete) as media, bool_and(crm_complete) as crm,
 bool_and(history_complete) as history, bool_and(attribution_complete) as attributed,
 sum(spend) spend,sum(impressions) impressions,sum(link_clicks) clicks,sum(landing_page_views) views,
 sum(pixel_leads) pixel,sum(crm_leads) leads,sum(mql) mql,sum(contact) contact,sum(sql) sql,
 sum(scheduled) scheduled,sum(realized) realized,sum(noshow) noshow,sum(sales) sales,sum(revenue) revenue
 from rgv.front_rows(p_parcial) where grain=p_grain and entity_id=p_entity and day between p_de and p_ate
), flags as (
 select *, ((select count(*)=p_ate-p_de+1 and coalesce(bool_and(media_complete),false) from rgv.front_rows(p_parcial) where grain='total' and entity_id='all' and day between p_de and p_ate)) and coalesce(media,false) media_ok,
 false crm_ok, false history_ok, false costs_ok from x
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
 'taxa_mql',null,'taxa_contato',null,'taxa_sql',null,'taxa_agendamento',null,'taxa_comparecimento',null,'taxa_fechamento',null,
 'cobertura',jsonb_build_object('dias_esperados',p_ate-p_de+1,'dias_carregados',days,
 'midia_completa',media_ok,'crm_completo',crm_ok,'historico_completo',history_ok,'custos_validos',costs_ok)
) from flags;
$function$;
create or replace function rgv.aggregate_dimension_media(p_de date, p_ate date, p_grain text, p_entity text)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' AS $$ select rgv.aggregate_dimension_media(p_de,p_ate,p_grain,p_entity,false) $$;

create or replace function rgv.aggregate_pecas_media(p_de date, p_ate date, p_parcial boolean)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' AS $function$
with ads as (
  select a.account_id, a.ad_id, a.creative_id, a.campaign_id, a.ad_status, a.campaign_status, a.preview_url, a.destination_url,
         rgv.peca_chave(a.ad_name) codigo, rgv.peca_info(rgv.peca_chave(a.ad_name)) info
  from rgv.ad a where a.account_id='696363384474339' and a.creative_id is not null
), cr as (
  select creative_id, (array_agg(info->>'peca' order by n desc))[1] peca
  from (select creative_id, info, count(*) n from ads group by 1,2) q group by 1
), fd as (
  select cr.peca, f.entity_id, f.day, f.media_complete, f.spend, f.impressions, f.link_clicks, f.landing_page_views, f.pixel_leads
  from rgv.front_rows(p_parcial) f join cr on cr.creative_id=f.entity_id
  where f.grain='creative' and f.day between p_de and p_ate
), tot_ok as (
  select count(*)=p_ate-p_de+1 and coalesce(bool_and(media_complete),false) ok from rgv.front_rows(p_parcial) where grain='total' and entity_id='all' and day between p_de and p_ate
), x as (
  select peca, bool_and(media_complete) and (select ok from tot_ok) media_ok, count(distinct day) days,
   sum(spend) spend, sum(impressions) impressions, sum(link_clicks) clicks, sum(landing_page_views) views, sum(pixel_leads) pixel,
   count(distinct entity_id) n_creatives
  from fd group by peca
  -- Só peças com veiculação no período filtrado (Joyce, 09/10/2026): impressões ou investimento > 0.
  having coalesce(sum(impressions),0)>0 or coalesce(sum(spend),0)>0
), meta as (
  select a.info->>'peca' peca, min((a.info->>'arte')::date) arte, max(a.info->>'tipo') tipo, bool_or(a.info->>'padrao'='true') padrao,
   count(distinct a.ad_id) n_ads, count(distinct a.campaign_id) n_camp, count(distinct a.codigo) n_codigos,
   (array_agg(a.codigo order by (a.info->>'arte')::date desc nulls last, a.codigo))[1] codigo,
   jsonb_agg(distinct a.codigo) codigos,
   case when bool_or(a.ad_status='ACTIVE') then 'no_ar' when bool_or(a.ad_status is not null) then 'pausado' end anuncio_status,
   case when bool_or(a.campaign_status='ACTIVE') then 'no_ar' when bool_or(a.campaign_status is not null) then 'pausado' end campanha_status,
   (array_agg(a.preview_url order by (a.ad_status='ACTIVE') desc, (a.info->>'arte')::date desc nulls last) filter (where a.preview_url is not null))[1] preview_url,
   case when count(distinct a.destination_url)=1 then max(a.destination_url) end destino_url
  from ads a join (select distinct creative_id from fd join cr using(peca)) u on u.creative_id=a.creative_id
  group by 1
)
select coalesce(jsonb_agg((jsonb_build_object(
  'id', x.peca, 'criativo', x.peca, 'nome', x.peca, 'codigo', m.codigo, 'codigos', m.codigos, 'arte_em', m.arte,
  'tipo', case m.tipo when 'VD' then 'video' when 'IMG' then 'imagem' end, 'padrao', m.padrao,
  'campanhas', m.n_camp, 'anuncios', m.n_ads, 'variacoes', m.n_codigos,
  'preview_url', m.preview_url, 'imagem_url', m.preview_url, 'thumb', m.preview_url, 'thumbnail_url', m.preview_url,
  'status', m.anuncio_status, 'anuncio_status', m.anuncio_status, 'campanha_status', m.campanha_status, 'destino_url', m.destino_url,
  'atribuicao_completa', false, 'motivo_indisponivel', 'Funil CRM por peça aguarda atribuição completa; a mídia e imagem são reais.')
 || jsonb_build_object(
  'investimento', case when media_ok then spend end, 'impressoes', case when media_ok then impressions end,
  'cliques', case when media_ok then clicks end, 'visualizacoes_lp', case when media_ok then views end,
  'alcance', case when x.n_creatives=1 then (select reach from rgv.period_reach r join cr on cr.creative_id=r.entity_id where cr.peca=x.peca and r.grain='creative' and r.start_day=p_de and r.end_day=p_ate and r.verified limit 1) end,
  'leads_pixel', case when media_ok then pixel end, 'leads_crm', null, 'mql', null, 'contato_efetivo', null, 'sql', null,
  'reunioes_agendadas', null, 'reunioes_realizadas', null, 'noshow', null, 'vendas', null, 'faturamento', null,
  'cpm', case when media_ok and impressions>0 then round(spend/impressions*1000,2) end,
  'ctr', case when media_ok and impressions>0 then round(clicks::numeric/impressions*100,2) end,
  'cpc', case when media_ok and clicks>0 then round(spend/clicks,2) end,
  'cpl_pixel', case when media_ok and pixel>0 then round(spend/pixel,2) end)
 || jsonb_build_object(
  'cpl', null, 'cpmql', null, 'custo_reuniao', null, 'cac', null, 'roas', null, 'conversao_lp', null,
  'taxa_mql', null, 'taxa_contato', null, 'taxa_sql', null, 'taxa_agendamento', null, 'taxa_comparecimento', null, 'taxa_fechamento', null,
  'cobertura', jsonb_build_object('dias_esperados', p_ate-p_de+1, 'dias_carregados', x.days, 'midia_completa', media_ok, 'crm_completo', false, 'historico_completo', false, 'custos_validos', false))
) order by x.peca), '[]'::jsonb)
from x join meta m on m.peca=x.peca;
$function$;
create or replace function rgv.aggregate_pecas_media(p_de date, p_ate date)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' AS $$ select rgv.aggregate_pecas_media(p_de,p_ate,false) $$;
