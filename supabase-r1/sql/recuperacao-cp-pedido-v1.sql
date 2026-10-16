-- Aplicada em produção (migration recuperacao_cp_pedido_v1). CP1/CP2/CP3 (tipo de público) = início do nome da oferta no checkout.
create or replace function public.recuperacao_cp_pedido_v1()
returns table(transacao_id text, oferta_nome text, cp text)
language sql security definer set search_path to ''
as $function$
  select identity.exigir('recuperacao');
  select p.transacao_id, b.oferta_nome,
    upper(replace(substring(b.oferta_nome from '(?i)^\s*(CP ?[0-9])'), ' ', ''))
  from marts.vw_recuperacao_carrinho p
  join marts.mv_ingresso_transacao b on b.transacao_id = p.transacao_id;
$function$;
