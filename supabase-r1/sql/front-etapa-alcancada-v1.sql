-- Perpétuo · regra "etapa alcançada" no funil do CRM (Como ler, Joyce 08/10/2026)
-- Cada etapa conta quem chegou nela ou além, na ordem do pipeline Vendas Principal:
-- MQL → Ligar Agora → 1º..4º Dia de Contato → Em Qualificação → Em Agendamento → DIAG. Agendado
-- → NoShow → DIAG. Reagendado → DIAG. Realizado → Follow Up 20/50/70% → 2ª Reunião → Sinal
-- → Dinheiro Em Casa → Finalizando → Ganho. Perdido/Cancelamentos são terminais (não contam etapa).
-- Mudança em relação à v1: sql, scheduled e realized passam de "etapa exata" para "etapa ou além".
-- contact (Em Qualificação+ e "Fora do ICP"), noshow (exato) e sales permanecem iguais.

create or replace function rgv.crm_funnel_snapshot_at_v2(p_cutoff date)
returns table(deal_id text, campaign_id text, attribution_status text, missing_principal_history boolean,
              history_complete boolean, revenue numeric, movement_days jsonb, actual_mql_days jsonb,
              source_modified_at timestamptz)
language sql stable set search_path to '' as $$
with d as materialized (select * from rgv.crm_funnel_deal_v1 where campaign_ff and created_day<=p_cutoff),
h as (
 select deal_id,pipeline_id,stage_id,entered_at from rgv.stage_event
  where entered_at < ((p_cutoff+1)::timestamp at time zone 'America/Sao_Paulo') and pipeline_id in ('749390743','746355509')
 union all select deal_id,pipeline_id,current_stage_id,current_stage_entered_at from rgv.deal where current_stage_entered_at is not null
 union all select p.deal_id, dd.pipeline_id,
   case when p.property_name='motivo_de_loss__sdr_' then 'reason_contact' else 'reason_sql' end, p.occurred_at
  from rgv.property_event p join rgv.deal dd using(deal_id)
  where dd.pipeline_id in ('749390743','746355509')
    and ((p.property_name='motivo_de_loss__sdr_' and p.value='Fora do ICP (Ideal Customer Persona)')
      or (p.property_name='motivo_de_perda__closer_' and p.value='Comprou da concorrência'))),
ordem(stage_id,pos) as (values
 ('1089131932',1),('1386314639',2),('1089131933',3),('1089131934',4),('1089131935',5),('1089131936',6),
 ('1089186215',7),('1320560225',8),('1089186216',9),('1089186217',10),('1089186218',11),('1089131958',12),
 ('1089131959',13),('1089131960',14),('1089131961',15),('1089132032',16),('1089132033',17),('1121488310',18),
 ('1089132034',19),('1089131937',20)),
evidence as (
 select d.deal_id,x.step,(h.entered_at at time zone 'America/Sao_Paulo')::date as movement_day
 from d join h using(deal_id)
 left join ordem o on o.stage_id=h.stage_id and h.pipeline_id='749390743'
 cross join lateral(values
  ('mql', o.pos>=1),
  ('contact', o.pos>=7 or h.stage_id in ('reason_contact','reason_sql')),
  ('sql', o.pos>=8 or h.stage_id='reason_sql'),
  ('scheduled', o.pos>=9),
  ('realized', o.pos>=12),
  ('noshow', o.pos=10),
  ('sales', d.sale_at is not null and (o.pos in (18,19,20) or (h.pipeline_id='746355509' and h.stage_id='1086562155')))
 ) x(step,qualifies)
 where x.qualifies and h.entered_at is not null and (h.entered_at at time zone 'America/Sao_Paulo')::date<=p_cutoff
 union all select deal_id,'crm_leads',created_day from d
),
days as (select deal_id,step,jsonb_agg(distinct movement_day order by movement_day) days from evidence group by deal_id,step),
movements as (select deal_id,jsonb_object_agg(step,days) movement_days from days group by deal_id)
select d.deal_id,d.campaign_id,d.attribution_status,d.missing_principal_history,d.history_complete,d.revenue,
 (coalesce(m.movement_days,'{}'::jsonb)-'mql') || case when m.movement_days ? 'mql' then jsonb_build_object('mql',jsonb_build_array(d.created_day)) else '{}'::jsonb end,
 coalesce(m.movement_days->'mql','[]'::jsonb), d.source_modified_at
from d left join movements m using(deal_id);
$$;

revoke all on function rgv.crm_funnel_snapshot_at_v2(date) from public, anon, authenticated;

-- Aplicado em 09/10/2026 após decisão de Joyce ("Aplicar"):
-- 1) rgv.build_front_batch_v1 passou a chamar rgv.crm_funnel_snapshot_at_v2(p_end)
--    e grava rules_version = 'crm-v18-etapa-alcancada' (create or replace; corpo inalterado no restante).
-- 2) Lote 01/09 a 08/10 refeito e publicado (batch c060a8a9, 11.085 linhas).
--    29/09 a 07/10: SQL 9 → 75, Ag. marcado 49 → 69, Ag. realizado 26 → 42; Lead, Contato e Venda iguais.
-- 3) rgv.read_front: fim do período no futuro (ou hoje) passa a ser lido até ontem (último dia fechado),
--    em vez de devolver resumo/CAC nulos por cobertura incompleta. 'periodo.fim_solicitado' guarda o pedido.
--    Trecho alterado no cabeçalho da função:
--      ontem date := (now() at time zone 'America/Sao_Paulo')::date - 1;
--      ate   date := least(coalesce(p_ate, ontem), ontem);
--      if de > ontem then de := ontem; end if;
--      'periodo', jsonb_build_object('inicio', de, 'fim', ate, 'fim_solicitado', p_ate)
