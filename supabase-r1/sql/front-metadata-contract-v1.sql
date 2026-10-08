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
 'por_campanha',(select jsonb_agg(jsonb_build_object('id',entity_id,'campanha',label,'status',(select case when bool_or(a.campaign_status='ACTIVE') then 'no_ar' when bool_or(a.campaign_status is not null) then 'pausado' end from rgv.ad a where a.account_id='696363384474339' and a.campaign_id=q.entity_id))||(rgv.aggregate_media_front(de,ate,'campaign',entity_id) || case when complete_crm then coalesce(crm->('campaign:'||entity_id),jsonb_build_object('leads_crm',0,'mql',0,'contato_efetivo',0,'sql',0,'reunioes_agendadas',0,'reunioes_realizadas',0,'noshow',0,'vendas',0,'faturamento',0,'taxa_mql',null,'taxa_contato',null,'taxa_sql',null,'taxa_agendamento',null,'taxa_comparecimento',null,'taxa_fechamento',null)) else '{}'::jsonb end) order by entity_id) from (select entity_id,max(label) label from rgv.front_daily where grain='campaign' and day between de and ate group by entity_id) q),
 'por_criativo',(select jsonb_agg(jsonb_build_object('id',entity_id,'criativo',label,'preview_url',(select max(a.preview_url) from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),'imagem_url',(select max(a.preview_url) from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),'thumb',(select max(a.preview_url) from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),'thumbnail_url',(select max(a.preview_url) from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),'status',(select case when bool_or(a.ad_status='ACTIVE') then 'no_ar' when bool_or(a.ad_status is not null) then 'pausado' else null end from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),'anuncio_status',(select case when bool_or(a.ad_status='ACTIVE') then 'no_ar' when bool_or(a.ad_status is not null) then 'pausado' else null end from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),'campanha_status',(select case when bool_or(a.campaign_status='ACTIVE') then 'no_ar' when bool_or(a.campaign_status is not null) then 'pausado' end from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),
'destino_url',(select case when count(distinct a.destination_url)=1 then max(a.destination_url) end from rgv.ad a where a.account_id='696363384474339' and a.creative_id=q.entity_id),
'atribuicao_completa',false,'motivo_indisponivel','Funil CRM por criativo aguarda atribuição completa; a mídia e imagem são reais.')||rgv.aggregate_dimension_media(de,ate,'creative',entity_id) order by entity_id) from (select entity_id,max(label) label from rgv.front_daily where grain='creative' and day between de and ate group by entity_id) q),
 'por_lp',(select jsonb_agg(jsonb_build_object('id',entity_id,'pagina',label,'destino_url',(select max(a.destination_url) from rgv.ad a where a.account_id='696363384474339' and a.lp_id=q.entity_id),'status',(select case when bool_or(a.ad_status='ACTIVE') then 'no_ar' when bool_or(a.ad_status is not null) then 'pausado' else null end from rgv.ad a where a.account_id='696363384474339' and a.lp_id=q.entity_id),'atribuicao_completa',false,'motivo_indisponivel','LP de destino da Meta; página de conversão no Hub ainda não comprovada.')||rgv.aggregate_dimension_media(de,ate,'lp',entity_id) order by entity_id) from (select entity_id,max(label) label from rgv.front_daily where grain='lp' and day between de and ate group by entity_id) q)
 ) into result;
 result:=result||jsonb_build_object('qualidade',jsonb_build_object(
'atribuicao_completa',false,'motivo','Criativos e LPs mostram mídia real. Funil por item aguarda atribuição comprovada; nomes repetidos permanecem ambíguos.',
'periodo_completo_inicio',(select min(day) from rgv.front_daily where grain='total'),
'periodo_completo_fim',(select max(day) from rgv.front_daily where grain='total')));
return result || jsonb_build_object('publicacao',rgv.publication_status());
end $function$
;
;
CREATE OR REPLACE FUNCTION rgv.publication_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object('status',coalesce((select status from rgv.front_batch order by created_at desc limit 1),'waiting_first_batch'),
'corte_publicado',(select max(end_day) from rgv.front_batch where status='published'),
'publicado_em',(select max(published_at) from rgv.front_batch where status='published'),
'motivo',case when not exists(select 1 from rgv.front_batch) then 'Aguardando ETL dos indicadores e cobertura conjunta HubSpot/Meta' else (select reason from rgv.front_batch order by created_at desc limit 1) end,
'solucao',(select solution from rgv.front_batch order by created_at desc limit 1));
$function$
;
