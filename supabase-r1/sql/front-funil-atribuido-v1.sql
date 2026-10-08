-- Funil CRM por peça e por página + taxas, metas e custos no resumo (front-funil-atribuido-v1).
-- Regras de Joyce (08/10, "Como ler" e formato do resumo de topo):
--  * Peça criativa: lead do CRM vem pelo nome do anúncio na UTM (utm_content; utm_term quando o content
--    traz o conjunto), casado com um anúncio da mesma campanha. Lead sem nome de anúncio fica fora da visão
--    por peça e vai para a página principal da campanha (LP dos anúncios de maior gasto).
--  * Taxas: cada etapa sobre a anterior; metas do plano do ciclo (rgv.plano_ciclo; ciclo 45 cadastrado).
--  * Custos por etapa: investimento do período / quantidade da etapa, quando mídia e CRM estão publicados.
-- Tudo lido em tempo de consulta do lote publicado; não gera lote novo.
-- Ordem: depois de front-pecas-criativas-v1.sql.

create table if not exists rgv.plano_ciclo (
  numero int primary key, conexao numeric, qualificacao numeric, agendamento numeric, comparecimento numeric, fechamento numeric,
  qualificacao_mql numeric, fonte text, updated_at timestamptz default now());
insert into rgv.plano_ciclo(numero, conexao, qualificacao, agendamento, comparecimento, fechamento, fonte)
values (45, 33, 45, 76, 72, 32, 'Joyce, 08/10/2026 (Como ler · Taxas, plano do ciclo 45)')
on conflict (numero) do update set conexao=excluded.conexao, qualificacao=excluded.qualificacao, agendamento=excluded.agendamento,
  comparecimento=excluded.comparecimento, fechamento=excluded.fechamento, fonte=excluded.fonte, updated_at=now();

create or replace function rgv.deal_ad_resolution(p_batch uuid) returns table(deal_id text, campaign_id text, ad_id text, peca text, lp_id text)
language sql stable set search_path='' as $fn$
with ads as materialized (
  select a.campaign_id, a.ad_id, rgv.peca_chave(a.ad_name) cod, rgv.peca_info(rgv.peca_chave(a.ad_name))->>'peca' peca, a.lp_id
  from rgv.ad a where a.account_id='696363384474339'
), ad_by_cod as (select campaign_id, cod, min(ad_id) ad_id from ads where cod is not null group by 1,2),
camp_lp as (
  select campaign_id, (array_agg(lp_id order by spend desc))[1] lp_id from (
    select a.campaign_id, a.lp_id, sum(d.spend) spend from rgv.ad a join rgv.ad_daily d using(account_id, ad_id)
    where a.account_id='696363384474339' and a.lp_id is not null group by 1,2) q group by 1
), dl as materialized (
  select s.deal_id, s.campaign_id, rgv.peca_chave(d.utm_content) cod_c, rgv.peca_chave(d.utm_term) cod_t
  from rgv.front_crm_snapshot s join rgv.deal d using(deal_id)
  where s.batch_id=p_batch and s.attribution_status='campaign_exact'
), r as (
  select dl.deal_id, dl.campaign_id, coalesce(c.ad_id, t.ad_id) ad_id
  from dl left join ad_by_cod c on c.campaign_id=dl.campaign_id and c.cod=dl.cod_c
          left join ad_by_cod t on t.campaign_id=dl.campaign_id and t.cod=dl.cod_t
)
select r.deal_id, r.campaign_id, r.ad_id, a.peca, coalesce(a.lp_id, cl.lp_id) lp_id
from r left join ads a on a.ad_id=r.ad_id left join camp_lp cl on cl.campaign_id=r.campaign_id;
$fn$;

create or replace function rgv.crm_matrix_v2(p_de date, p_ate date) returns table(grain text, entity text, counts jsonb)
language sql stable set search_path='' as $fn$
with b as (select id from rgv.front_batch where status='published' and start_day<=p_de and end_day>=p_ate order by published_at desc limit 1),
res as materialized (select * from rgv.deal_ad_resolution((select id from b))),
e as materialized (
 select s.deal_id, s.campaign_id, res.peca, res.lp_id, s.revenue, k.key step, v::date event_day
 from rgv.front_crm_snapshot s join b on b.id=s.batch_id
 left join res on res.deal_id=s.deal_id
 cross join lateral jsonb_each(s.movement_days) k
 cross join lateral jsonb_array_elements_text(k.value) v
 where v::date between p_de and p_ate
),
period_f as (select deal_id, campaign_id, peca, lp_id, step, max(revenue) revenue from e group by 1,2,3,4,5),
daily_f as (select deal_id, event_day, step, max(revenue) revenue from e group by 1,2,3),
groups as (
 select 'total' grain, 'all' entity, step, count(*) n, sum(revenue) amount, bool_or(revenue is null) missing from period_f group by step
 union all select 'campaign', campaign_id, step, count(*), sum(revenue), bool_or(revenue is null) from period_f where campaign_id is not null group by campaign_id, step
 union all select 'peca', peca, step, count(*), sum(revenue), bool_or(revenue is null) from period_f where peca is not null group by peca, step
 union all select 'lp', lp_id, step, count(*), sum(revenue), bool_or(revenue is null) from period_f where lp_id is not null group by lp_id, step
 union all select 'daily', event_day::text, step, count(*), sum(revenue), bool_or(revenue is null) from daily_f group by event_day, step
),
mapped as (select grain, entity, jsonb_object_agg(step, n) obj, max(amount) filter (where step='sales') amount, bool_or(missing) filter (where step='sales') missing from groups group by grain, entity)
select grain, entity, jsonb_build_object(
 'leads_crm', coalesce((obj->>'crm_leads')::bigint,0), 'mql', coalesce((obj->>'mql')::bigint,0),
 'contato_efetivo', coalesce((obj->>'contact')::bigint,0), 'sql', coalesce((obj->>'sql')::bigint,0),
 'reunioes_agendadas', coalesce((obj->>'scheduled')::bigint,0), 'reunioes_realizadas', coalesce((obj->>'realized')::bigint,0),
 'noshow', coalesce((obj->>'noshow')::bigint,0), 'vendas', coalesce((obj->>'sales')::bigint,0),
 'faturamento', case when missing then null else coalesce(amount,0) end) from mapped
union all
select 'atribuicao', 'all', jsonb_build_object(
  'leads_com_campanha', (select count(*) from period_f where step='crm_leads'),
  'leads_com_anuncio', (select count(*) from period_f where step='crm_leads' and peca is not null),
  'leads_sem_anuncio', (select count(*) from period_f where step='crm_leads' and peca is null));
$fn$;

create or replace function rgv.funil_calc(j jsonb) returns jsonb language sql immutable set search_path='' as $fn$
with v as (select (j->>'investimento')::numeric inv, (j->>'leads_crm')::numeric leads, (j->>'mql')::numeric mql, (j->>'contato_efetivo')::numeric contato,
  (j->>'sql')::numeric sql, (j->>'reunioes_agendadas')::numeric ag, (j->>'reunioes_realizadas')::numeric re, (j->>'vendas')::numeric vendas,
  (j->>'faturamento')::numeric fat, (j->>'leads_pixel')::numeric pixel)
select j || jsonb_build_object(
 'taxa_mql', case when leads>0 then round(mql/leads*100,2) end,
 'taxa_contato', case when mql>0 then round(contato/mql*100,2) end,
 'taxa_sql', case when contato>0 then round(sql/contato*100,2) end,
 'taxa_agendamento', case when sql>0 then round(ag/sql*100,2) end,
 'taxa_comparecimento', case when ag>0 then round(re/ag*100,2) end,
 'taxa_fechamento', case when re>0 then round(vendas/re*100,2) end,
 'taxa_mql_venda', case when mql>0 then round(vendas/mql*100,2) end,
 'cpl_pixel', case when inv is not null and pixel>0 then round(inv/pixel,2) end,
 'cpl', case when inv is not null and leads>0 then round(inv/leads,2) end,
 'cpmql', case when inv is not null and mql>0 then round(inv/mql,2) end,
 'custo_contato', case when inv is not null and contato>0 then round(inv/contato,2) end,
 'custo_sql', case when inv is not null and sql>0 then round(inv/sql,2) end,
 'custo_agendado', case when inv is not null and ag>0 then round(inv/ag,2) end,
 'custo_reuniao', case when inv is not null and re>0 then round(inv/re,2) end,
 'cac', case when inv is not null and vendas>0 then round(inv/vendas,2) end,
 'roas', case when inv>0 and fat is not null then round(fat/inv,2) end,
 'taxas_observacao', null,
 'cobertura', coalesce(j->'cobertura','{}'::jsonb) || jsonb_build_object('custos_validos', inv is not null and leads is not null)) from v;
$fn$;

-- rgv.read_front (versão 3, aplicada no banco em 08/10): usa rgv.crm_matrix_v2 e rgv.funil_calc em resumo, diário,
-- por_campanha, por_criativo (rgv.aggregate_pecas_media) e por_lp; devolve 'metas' (plano do ciclo que contém o fim
-- do período), 'atribuicao' (leads com/sem nome de anúncio) e qualidade.atribuicao_completa = lote publicado cobre o período.
-- Validação 08/10 (29/09 a 07/10): resumo 811 leads / 134 contatos / 9 SQL / 49 agendados / 26 realizados / 1 venda,
-- iguais à matriz anterior; 721 de 811 leads atribuídos a 53 peças; 8 páginas; metas RGV 45.
