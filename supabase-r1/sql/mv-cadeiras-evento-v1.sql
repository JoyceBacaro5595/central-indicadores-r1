-- Cadeiras por evento (e-tickets da Guru): total sem cancelados, e a divisão em comuns, VIP, cortesias, mais os cancelados.
-- Para desfazer: drop function public.mv_cadeiras_evento(date, date);
create or replace function public.mv_cadeiras_evento(p_inicio date default null, p_fim date default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select identity.exigir('presenca');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.mes_evento, x.cidade), '[]'::jsonb) from (
    select t.cidade, t.mes_evento,
      count(*) filter (where t.status <> 'canceled') as total,
      count(*) filter (where t.status <> 'canceled' and t.tipo = 'COMUM') as comuns,
      count(*) filter (where t.status <> 'canceled' and t.tipo = 'VIP') as vip,
      count(*) filter (where t.status <> 'canceled' and t.tipo = 'CORTESIA') as cortesias,
      count(*) filter (where t.status = 'canceled') as cancelados
    from marts.vw_eticket_atual t
    where t.cidade is not null and t.mes_evento is not null
      and (p_inicio is null or t.mes_evento >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or t.mes_evento <= p_fim)
    group by t.cidade, t.mes_evento) x;
$$;
revoke all on function public.mv_cadeiras_evento(date, date) from public, anon;
grant execute on function public.mv_cadeiras_evento(date, date) to authenticated;
