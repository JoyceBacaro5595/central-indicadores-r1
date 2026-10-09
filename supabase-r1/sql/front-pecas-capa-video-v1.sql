-- Capa do vídeo nos cards de peça (Joyce, 09/10/2026: "Pode pedir").
-- Antes: o card usava a miniatura automática do Meta (primeiro quadro), preta em vídeos que abrem em tela preta.
-- Agora: usa a capa escolhida no anúncio, já guardada no payload bruto (rgv.meta_ad_record):
--   object_story_spec.video_data.image_url (anúncio de vídeo simples) ou
--   asset_feed_spec.videos[0].thumbnail_url (anúncio dinâmico); sem capa, mantém a miniatura anterior.
-- Só muda o campo de imagem; números não mudam.
CREATE OR REPLACE FUNCTION rgv.aggregate_pecas_media(p_de date, p_ate date, p_parcial boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with ads as (
  select a.account_id, a.ad_id, a.creative_id, a.campaign_id, a.ad_status, a.campaign_status,
         coalesce(
           case when r.payload->'creative'->'object_story_spec'->'video_data'->>'image_url' like 'https://%'
                then r.payload->'creative'->'object_story_spec'->'video_data'->>'image_url' end,
           case when r.payload->'creative'->'asset_feed_spec'->'videos'->0->>'thumbnail_url' like 'https://%'
                then r.payload->'creative'->'asset_feed_spec'->'videos'->0->>'thumbnail_url' end,
           a.preview_url) preview_url,
         a.destination_url,
         rgv.peca_chave(a.ad_name) codigo, rgv.peca_info(rgv.peca_chave(a.ad_name)) info
  from rgv.ad a
  left join rgv.meta_ad_record r on r.account_id=a.account_id and r.ad_id=a.ad_id
  where a.account_id='696363384474339' and a.creative_id is not null
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
