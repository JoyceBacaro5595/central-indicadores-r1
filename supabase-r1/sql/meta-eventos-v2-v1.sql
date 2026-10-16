-- LPV (landing_page_view) e checkouts (initiate_checkout) do Meta por evento, usados pelos funis da Máquina de Vendas e do Fluxo Marketing MDV.
-- Os campos vêm de marts.vw_meta_evento (alimentada pela função meta-ads-sync). meta_eventos (v1) continua como está.
-- Para desfazer: drop function public.meta_eventos_v2(date, date);
create or replace function public.meta_eventos_v2(p_de date default null, p_ate date default null)
 returns table(cidade text, mes_evento date, lpv bigint, checkouts bigint)
 language sql security definer set search_path to ''
as $function$
  select identity.exigir('eventos');
  select m.cidade, m.mes_evento, m.lpv::bigint, m.checkouts::bigint
  from marts.vw_meta_evento m
  where (p_de is null or m.mes_evento >= date_trunc('month', p_de)::date) and (p_ate is null or m.mes_evento <= p_ate)
  order by m.mes_evento desc, m.cidade;
$function$;
