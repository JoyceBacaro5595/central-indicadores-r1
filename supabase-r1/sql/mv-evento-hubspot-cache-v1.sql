-- hubspot_eventos lia marts.vw_evento_hubspot direto (~26 s, estourava o limite de 8 s do authenticated e os cards
-- ficavam sem CAC qualificado / Qualificação). Agora lê a materialized view, atualizada a cada 30 min pelo pg_cron.
create materialized view if not exists marts.mv_evento_hubspot as select * from marts.vw_evento_hubspot;
-- índice único: permite REFRESH CONCURRENTLY, que não bloqueia a leitura durante a atualização
create unique index if not exists mv_evento_hubspot_uk on marts.mv_evento_hubspot (cidade, mes_evento);
create or replace function marts.refresh_evento_hubspot() returns void language plpgsql security definer set search_path = '' as $$
begin set local statement_timeout = '180s'; refresh materialized view concurrently marts.mv_evento_hubspot; end $$;
create or replace function public.hubspot_eventos(p_inicio date default null, p_fim date default null)
 returns table(cidade text, mes_evento date, compradores bigint, compradores_hubspot bigint, compradores_qualificados bigint, leads bigint, leads_qualificados bigint, cortesias_geradas bigint, presencas_confirmadas bigint, ganhos bigint)
 language sql security definer set search_path to ''
as $function$
  select identity.exigir('painel');
  select v.cidade, v.mes_evento, v.compradores, v.compradores_hubspot, v.compradores_qualificados, v.leads, v.leads_qualificados, v.cortesias_geradas, v.presencas_confirmadas, v.ganhos
  from marts.mv_evento_hubspot v
  where v.cidade is not null -- compradores sem evento ligado vêm com cidade nula e derrubavam a tela
    and (p_inicio is null or v.mes_evento >= date_trunc('month', p_inicio)::date) and (p_fim is null or v.mes_evento <= p_fim)
  order by v.mes_evento, v.cidade;
$function$;
select cron.schedule('evento-hubspot-cache', '*/30 * * * *', $c$select marts.refresh_evento_hubspot()$c$);
