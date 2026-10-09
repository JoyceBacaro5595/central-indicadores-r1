-- Peças criativas no painel Perpétuo (front-pecas-criativas-v1).
-- Regra (Joyce, 08/10): a peça é a arte identificada pelo AD no nome do anúncio
-- ([RGV][VD][FEED][AD11][data] = VD AD11), somando todas as datas, campanhas e anúncios.
-- VD = vídeo, IMG = imagem; marcações extras (CORTES, PABLO, FLUXODECAIXA…) separam a peça.
-- Lido em tempo de consulta a partir do lote publicado (rgv.front_daily grain creative + rgv.ad):
-- não gera lote novo nem consome capacidade.
-- Ordem: depois de front-daily-batch-v1.sql.

create or replace function rgv.peca_chave(p_ad_name text) returns text language sql immutable set search_path='' as $fn$
select nullif(
  regexp_replace(
  regexp_replace(
  regexp_replace(
    upper(regexp_replace(trim(coalesce(p_ad_name,'')), '\s+', ' ', 'g')),
    '\s*([—–-]\s*)?(CÓPIA|COPIA|COPY)\s*$', '', 'g'),
    '\s*\.?MP4\s*$', '', 'g'),
    '(\]|\))\s*[_-]?\s*[0-9]?\s*[_-]*$', '\1', 'g'),
  '');
$fn$;

create or replace function rgv.peca_info(p_chave text) returns jsonb language sql immutable set search_path='' as $fn$
with tags as (
  select m[1] tag, ord from regexp_matches(p_chave, '\[([^\]\[]+)\]', 'g') with ordinality as t(m, ord)
), cls as (
  select tag, ord,
    case when tag ~ '^(AD|CAR)\s?0*[0-9]+$' then 'ad'
         when tag ~ '^[0-9]{7,8}$' then 'data'
         when tag in ('VD','VIDEO','VÍDEO') then 'tipo_vd'
         when tag ~ '^IMG' then 'tipo_img'
         when tag in ('RGV','PER','PERP','RGVPERP','FEED','LD','DFCR','DCFR') then 'fixo'
         else 'extra' end k
  from tags
), ad as (select substring(tag from '^(AD|CAR)') || lpad(regexp_replace(tag, '^(AD|CAR)\s?0*', ''), 2, '0') tag from cls where k='ad' order by ord limit 1),
 dt as (select tag from cls where k='data' order by ord desc limit 1),
 tipo as (select case when exists(select 1 from cls where k='tipo_vd') then 'VD' when exists(select 1 from cls where k='tipo_img') then 'IMG' end t),
 extras as (select string_agg(case tag
     when 'FLUXODECAIXA' then 'FLUXO DE CAIXA' when 'PROBLEMAESOLUCAO' then 'PROBLEMA E SOLUÇÃO' when 'ECOSSISTEMAR1' then 'ECOSSISTEMA R1'
     when 'FIMDEANO' then 'FIM DE ANO' when 'STORYS' then 'STORY' else tag end, ' ' order by ord) e from cls where k='extra'),
 arte as (select case when length(tag)=8 and tag ~ '^[0-3][0-9][01][0-9]20[2-3][0-9]$' then to_date(tag,'DDMMYYYY') end d from dt)
select jsonb_build_object(
  'peca', case when (select tag from ad) is not null
               then concat_ws(' - ', concat_ws(' ', (select t from tipo), (select tag from ad)), (select e from extras))
               else p_chave end,
  'tipo', (select t from tipo),
  'arte', (select d from arte),
  'codigo', p_chave,
  'padrao', (select tag from ad) is not null);
$fn$;

create or replace function rgv.aggregate_pecas_media(p_de date, p_ate date) returns jsonb language sql stable set search_path='' as $fn$
with ads as (
  select a.account_id, a.ad_id, a.creative_id, a.campaign_id, a.ad_status, a.campaign_status, a.preview_url, a.destination_url,
         rgv.peca_chave(a.ad_name) codigo, rgv.peca_info(rgv.peca_chave(a.ad_name)) info
  from rgv.ad a where a.account_id='696363384474339' and a.creative_id is not null
), cr as (
  select creative_id, (array_agg(info->>'peca' order by n desc))[1] peca
  from (select creative_id, info, count(*) n from ads group by 1,2) q group by 1
), fd as (
  select cr.peca, f.entity_id, f.day, f.media_complete, f.spend, f.impressions, f.link_clicks, f.landing_page_views, f.pixel_leads
  from rgv.front_daily f join cr on cr.creative_id=f.entity_id
  where f.grain='creative' and f.day between p_de and p_ate
), tot_ok as (
  select count(*)=p_ate-p_de+1 and coalesce(bool_and(media_complete),false) ok from rgv.front_daily where grain='total' and entity_id='all' and day between p_de and p_ate
), x as (
  select peca, bool_and(media_complete) and (select ok from tot_ok) media_ok, count(distinct day) days,
   sum(spend) spend, sum(impressions) impressions, sum(link_clicks) clicks, sum(landing_page_views) views, sum(pixel_leads) pixel,
   count(distinct entity_id) n_creatives
  from fd group by peca
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
$fn$;

-- rgv.read_front: 'por_criativo' passa a ser rgv.aggregate_pecas_media(de,ate); o restante segue igual
-- (versão completa aplicada no banco em 08/10; só o trecho alterado é reproduzido aqui):
--   'por_criativo', rgv.aggregate_pecas_media(de,ate),
--   qualidade.motivo: 'Peças e LPs mostram mídia real. Funil por item aguarda atribuição comprovada; nomes repetidos permanecem ambíguos.'

-- Validação 08/10 (08/09 a 07/10): 120 peças somam R$ 693.513,95 = resumo = rgv.ad_daily [FF]; antes eram 555 creatives.

-- 09/10/2026 — imagem em alta resolução (pedido da Joyce: "A imagem precisa estar mais nítida").
-- A Edge Function rgv-meta-metadata-sync (v8) passou a pedir ao Meta
--   creative.thumbnail_width(1080).thumbnail_height(1080){thumbnail_url,image_url,...}
-- e a gravar rgv.ad.preview_url = image_url (arte original) ou, para vídeos, a miniatura de 1080px.
-- Antes todas as 722 peças vinham com a miniatura padrão de 64x64 (stp=..._p64x64_q75), por isso borradas.
-- Recoleta única: rgv.meta_ad_record.collected_at recuado em 25h para as peças [FF] e rgv.queue_meta_metadata_refresh(ontem) em lotes de 50.

-- 09/10/2026 — painel de detalhes da peça (pedido da Joyce): rgv.aggregate_pecas_media passou a devolver
-- 'diario' (mídia do Meta por dia: investimento, impressões, cliques, visualizacoes_lp, leads_pixel, midia_completa)
-- e 'anuncio_ids' (IDs dos anúncios somados, para abrir o Gerenciador já filtrado). Leads do CRM por dia por peça ainda não existem.
