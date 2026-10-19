-- Máquina de Vendas: vendas de RGV, Clube R1 e Trator por cidade/mês do evento, pela cidade e data que a UTM da campanha traz
-- (ex.: "[80KM][GOIANIA][19/08]"). Só entram vendas cuja campanha cita a cidade; as demais não têm praça no banco.
-- Regra da Joyce (19/10): só contam as vendas fechadas a partir do dia do evento (config.evento.data_evento; sem data cadastrada, vale a data da UTM).
-- Só leitura. Para desfazer: drop function public.mdv_vendas_cidade(date, date);
create or replace function public.mdv_vendas_cidade(p_de date default null, p_ate date default null)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select identity.exigir('eventos');
  with v as (
    select 'rgv' prod, utm_campaign u, revenue val, (sale_at at time zone 'America/Sao_Paulo')::date dia from rgv.crm_funnel_deal_v1 where sale_at is not null and product_rgv
    union all
    select case grupo when 'clube_r1' then 'clube_r1' when 'trator' then 'trator' else null end, utm_campanha, valor, data_fechamento::date
    from rgv.vendas_clube_trator where etapa = 'Ganho'
  ), t as (
    select prod, val, dia,
      (regexp_match(u, '\[80KM\]\[([^\]]+)\]\[(\d{2})/(\d{2})\]'))[2]::int as dia_tag,
      regexp_replace(upper(translate((regexp_match(u, '\[80KM\]\[([^\]]+)\]\[(\d{2})/(\d{2})\]'))[1], 'áãâéêíóõôúçÁÃÂÉÊÍÓÕÔÚÇ', 'aaaeeiooucAAAEEIOOUC')), '[^A-Z]', '', 'g') as tok,
      (regexp_match(u, '\[80KM\]\[([^\]]+)\]\[(\d{2})/(\d{2})\]'))[3]::int as mes
    from v where prod is not null and u ~ '\[80KM\]\['
  ), ev as (
    select cidade, mes_evento, min(data_evento) as data_evento,
      regexp_replace(upper(translate(cidade, 'áãâéêíóõôúçÁÃÂÉÊÍÓÕÔÚÇ', 'aaaeeiooucAAAEEIOOUC')), '[^A-Z]', '', 'g') as chave
    from config.evento
    where ativo and (p_de is null or mes_evento >= date_trunc('month', p_de)::date) and (p_ate is null or mes_evento <= p_ate)
    group by cidade, mes_evento
  ), j as (
    select ev.cidade, ev.mes_evento, t.prod, t.val
    from t join ev on extract(month from ev.mes_evento) = t.mes and (ev.chave = t.tok or ev.chave like t.tok || '%')
    where t.dia >= coalesce(ev.data_evento, make_date(extract(year from ev.mes_evento)::int, t.mes, t.dia_tag))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cidade', cidade, 'mes_evento', mes_evento,
    'rgv', n_rgv, 'clube_r1', n_clube, 'trator', n_trator,
    'fat_rgv', f_rgv, 'fat_clube_r1', f_clube, 'fat_trator', f_trator
  ) order by mes_evento, cidade), '[]'::jsonb)
  from (
    select cidade, mes_evento,
      count(*) filter (where prod = 'rgv') n_rgv, count(*) filter (where prod = 'clube_r1') n_clube, count(*) filter (where prod = 'trator') n_trator,
      coalesce(sum(val) filter (where prod = 'rgv'), 0) f_rgv, coalesce(sum(val) filter (where prod = 'clube_r1'), 0) f_clube, coalesce(sum(val) filter (where prod = 'trator'), 0) f_trator
    from j group by cidade, mes_evento
  ) x;
$$;
revoke all on function public.mdv_vendas_cidade(date, date) from public, anon;
grant execute on function public.mdv_vendas_cidade(date, date) to authenticated;
