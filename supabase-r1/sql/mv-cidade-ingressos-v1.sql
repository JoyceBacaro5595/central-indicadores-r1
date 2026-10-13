-- Máquina de Vendas (réplica): ingressos por cidade/mês separados por tipo e origem.
-- Lê a materializada marts.mv_ingresso_transacao (a view viva leva mais de 20 s e estoura o tempo da API); ela só fica em dia com o cron central-ingressos-refresh ligado. Só leitura. Para desfazer: drop function public.mv_cidade_ingressos(date, date);
create or replace function public.mv_cidade_ingressos(p_de date default null, p_ate date default null)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select identity.exigir('eventos');
  with t as (
    select cidade_evento, mes_evento, tipo_ingresso, canal, qtd_ingressos, valor_bruto, valor_liquido,
      upper(regexp_replace(coalesce(oferta_nome, '') || ' ' || coalesce(produto_nome, ''), '[\s()]+', '', 'g')) as compacto
    from marts.mv_ingresso_transacao
    where aprovada and cidade_evento is not null and mes_evento is not null
      and (p_de is null or mes_evento >= date_trunc('month', p_de)::date)
      and (p_ate is null or mes_evento <= p_ate)
  ),
  g as (
    select cidade_evento, mes_evento,
      sum(qtd_ingressos) as ingressos,
      coalesce(sum(qtd_ingressos) filter (where tipo_ingresso = 'COMUM' and valor_bruto > 0), 0) as comuns_pagos,
      coalesce(sum(qtd_ingressos) filter (where tipo_ingresso = 'VIP' and valor_bruto > 0), 0) as vip_pagos,
      coalesce(sum(qtd_ingressos) filter (where tipo_ingresso = 'VIP'), 0) as vip_total,
      coalesce(sum(qtd_ingressos) filter (where tipo_ingresso = 'CORTESIA'), 0) as cortesias,
      coalesce(sum(qtd_ingressos) filter (where tipo_ingresso = 'CORTESIA' and canal = 'SOCIAL SELLING'), 0) as cortesia_social_selling,
      coalesce(sum(qtd_ingressos) filter (where tipo_ingresso = 'CORTESIA' and canal = 'SELLER'), 0) as cortesia_seller,
      coalesce(sum(qtd_ingressos) filter (where tipo_ingresso = 'CORTESIA' and coalesce(canal, '') not in ('SOCIAL SELLING', 'SELLER')
        and (compacto like '%TIME-CS%' or compacto like '%TIMECS%' or compacto like '%-CS-%' or compacto like '%-CS')), 0) as cortesia_cs,
      coalesce(sum(qtd_ingressos) filter (where tipo_ingresso = 'CORTESIA' and coalesce(canal, '') not in ('SOCIAL SELLING', 'SELLER')
        and not (compacto like '%TIME-CS%' or compacto like '%TIMECS%' or compacto like '%-CS-%' or compacto like '%-CS')
        and compacto like '%COMERCIAL%'), 0) as cortesia_comercial,
      round(coalesce(sum(valor_bruto), 0), 2) as faturamento
    from t group by cidade_evento, mes_evento
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cidade', cidade_evento, 'mes_evento', mes_evento, 'ingressos', ingressos, 'comuns_pagos', comuns_pagos,
    'vip_pagos', vip_pagos, 'vip_total', vip_total, 'cortesias', cortesias,
    'cortesia_social_selling', cortesia_social_selling, 'cortesia_seller', cortesia_seller,
    'cortesia_cs', cortesia_cs, 'cortesia_comercial', cortesia_comercial, 'faturamento', faturamento
  ) order by mes_evento, cidade_evento), '[]'::jsonb) from g;
$$;
