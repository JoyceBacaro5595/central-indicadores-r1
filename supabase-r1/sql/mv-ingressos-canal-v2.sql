-- Ingressos por canal e CP (Joyce, 19/10): versão 2 da leitura usada no card da Turnê MDV.
-- Muda em relação à v1 (que continua no banco): o grupo "geral" passa a se chamar "marketing"; as compras que vieram de
-- recuperação de carrinho viram o grupo "recuperacao" (mesma regra de marts.recuperacao_origem_compra_v2: contato/atendimento
-- registrado antes da compra); e cada linha traz o CP (CP1, CP2, CP3) lido do nome da oferta na Guru, nulo quando a oferta não traz.
-- Só leitura. Para desfazer: drop function public.mv_ingressos_canal_v2(date, date);
create or replace function public.mv_ingressos_canal_v2(p_de date default null, p_ate date default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select identity.exigir('eventos');
  with rec as (
    select distinct b.transacao_id
    from marts.vw_recuperacao_carrinho p
    join lateral (select * from marts.mv_ingresso_transacao b where b.email = p.email and b.produto_nome = p.produto_nome
                  and b.aprovada and b.criado_em > p.criado_em order by b.criado_em limit 1) b on true
    where p.ja_comprou_depois
      and b.canal is distinct from 'SOCIAL SELLING'
      and (exists (select 1 from marts.recuperacao_registro r where r.transacao_id = p.transacao_id
                   and r.situacao in ('contatado','em_atendimento','sem_resposta','aguardando_retorno','recuperado') and r.criado_em < b.criado_em)
        or exists (select 1 from marts.recuperacao_contato c where c.transacao_id = p.transacao_id
                   and c.situacao in ('contatado','em_atendimento','sem_resposta','aguardando_retorno','recuperado') and c.atualizado_em < b.criado_em))
  ), t as (
    select x.transacao_id, x.cidade_evento, x.mes_evento, x.tipo_ingresso, x.canal, x.qtd_ingressos, x.valor_bruto,
      upper(regexp_replace(coalesce(x.oferta_nome, '') || ' ' || coalesce(x.produto_nome, ''), '[\s()]+', '', 'g')) as compacto,
      substring(upper(coalesce(x.oferta_nome, '')) from 'CP ?([123])') as cp
    from marts.mv_ingresso_transacao x
    where x.aprovada and x.cidade_evento is not null and x.mes_evento is not null
      and (p_de is null or x.mes_evento >= date_trunc('month', p_de)::date)
      and (p_ate is null or x.mes_evento <= p_ate)
  ), g as (
    select cidade_evento, mes_evento,
      case tipo_ingresso when 'COMUM' then 'comum' when 'VIP' then 'vip' when 'CORTESIA' then 'cortesia' end as tipo,
      case
        when canal = 'SOCIAL SELLING' then 'social_selling'
        when canal = 'SELLER' then 'seller'
        when compacto like '%TIME-CS%' or compacto like '%TIMECS%' or compacto like '%-CS-%' or compacto like '%-CS' then 'cs'
        when compacto like '%COMERCIAL%' then 'comercial'
        when transacao_id in (select transacao_id from rec) then 'recuperacao'
        else 'marketing'
      end as grupo,
      case when cp is null then null else 'CP' || cp end as cp,
      sum(qtd_ingressos) as ingressos, round(coalesce(sum(valor_bruto), 0), 2) as faturamento
    from t where tipo_ingresso in ('COMUM', 'VIP', 'CORTESIA')
    group by 1, 2, 3, 4, 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cidade', cidade_evento, 'mes_evento', mes_evento, 'tipo', tipo, 'grupo', grupo, 'cp', cp, 'ingressos', ingressos, 'faturamento', faturamento
  ) order by mes_evento, cidade_evento, tipo, grupo, cp), '[]'::jsonb) from g;
$$;
revoke execute on function public.mv_ingressos_canal_v2(date, date) from public, anon;
grant execute on function public.mv_ingressos_canal_v2(date, date) to authenticated, service_role;
