-- hubspot_eventos lia marts.vw_evento_hubspot direto (~26 s, estourava o limite de 8 s do authenticated e os cards
-- ficavam sem CAC qualificado / Qualificação). Agora lê a materialized view, atualizada a cada 30 min pelo pg_cron.
create materialized view if not exists marts.mv_evento_hubspot as select * from marts.vw_evento_hubspot;
create or replace function marts.refresh_evento_hubspot() returns void language plpgsql security definer set search_path = '' as $$
begin set local statement_timeout = '180s'; refresh materialized view marts.mv_evento_hubspot; end $$;
-- public.hubspot_eventos(p_inicio, p_fim): mesma assinatura, "from marts.mv_evento_hubspot" no lugar da view.
select cron.schedule('evento-hubspot-cache', '*/30 * * * *', $c$select marts.refresh_evento_hubspot()$c$);
