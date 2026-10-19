-- Módulo Upsell (Clube R1 e Trator): vendas ganhas por produto, com a tag do ciclo (evento_tag). Só leitura.
-- Pedido da Joyce, 19/10. Autorizada por ela em decision card.
create or replace function public.upsell_vendas()
returns jsonb language plpgsql security definer set search_path to 'rgv','public' as $function$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  perform identity.exigir('perpetuo');
  return jsonb_build_object(
    'atualizado_em', (select max(carregado_em) from rgv.vendas_clube_trator),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'deal_id', deal_id, 'nome', nome, 'grupo', grupo, 'produto', produto,
        'data_fechamento', data_fechamento, 'valor', coalesce(valor,0),
        'tag', nullif(btrim(coalesce(evento_tag,'')),''),
        'origem', nullif(btrim(coalesce(origem_negocios,'')),''),
        'campanha', nullif(btrim(coalesce(utm_campanha,'')),''))
        order by data_fechamento desc nulls last)
      from rgv.vendas_clube_trator where etapa='Ganho' and grupo in ('clube_r1','trator')),'[]'::jsonb));
end $function$;
revoke all on function public.upsell_vendas() from public, anon;
grant execute on function public.upsell_vendas() to authenticated;
