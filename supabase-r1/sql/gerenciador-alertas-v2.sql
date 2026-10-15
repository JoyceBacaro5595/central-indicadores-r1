-- Acrescenta o alerta "Base de pedidos da Central sem atualizar" (rotina que refaz marts.mv_ingresso_transacao desligada ou sem sucesso há mais de 1 h).
-- Resto da função inalterado. Aplicado em 15/10/2026 a pedido da Joyce (aviso no sino do topo).
create or replace function public.gerenciador_alertas()
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select identity.exigir('gerenciador');
  with prazo(fonte, entidade, horas, rotulo, acao) as (values
    ('guru',   'transaction', 3,  'Guru · vendas',   'Verifique o agendamento do Guru em Integrações e logs e o limite de chamadas (erro 429).'),
    ('guru',   'eticket',     3,  'Guru · e-tickets','Verifique o agendamento de e-tickets e o limite de chamadas (erro 429).'),
    ('hubspot','deals',       3,  'HubSpot · negócios','Verifique o agendamento do HubSpot e o token de acesso.'),
    ('hubspot','contacts',    3,  'HubSpot · contatos','Verifique o agendamento do HubSpot e o token de acesso.'),
    ('meta',   'ads',         30, 'Meta · anúncios', 'Gere um novo token do Meta e guarde no segredo META_ADS_TOKEN das Edge Functions do Supabase.')),
  ult as (
    select p.*, 
      (select max(l.finalizado_em) from raw.log_ingestao l where l.fonte = p.fonte and l.entidade = p.entidade and l.status = 'sucesso') as ultimo_ok,
      (select l.status from raw.log_ingestao l where l.fonte = p.fonte and l.entidade = p.entidade order by l.iniciado_em desc limit 1) as ultimo_status,
      (select left(l.mensagem_erro, 200) from raw.log_ingestao l where l.fonte = p.fonte and l.entidade = p.entidade and l.status = 'erro' order by l.iniciado_em desc limit 1) as ultimo_erro
    from prazo p),
  a1 as (
    select 'fonte:' || fonte || ':' || entidade as id,
      case when ultimo_ok is null or now() - ultimo_ok > make_interval(hours => horas * 2) or (ultimo_status = 'erro' and now() - ultimo_ok > make_interval(hours => horas)) then 'critico' else 'atencao' end as gravidade,
      fonte, rotulo || ' sem atualizar' as titulo,
      coalesce(ultimo_erro, 'Sem carga com sucesso dentro do prazo de ' || horas || 'h.') as detalhe,
      ultimo_ok as desde, acao
    from ult where ultimo_ok is null or now() - ultimo_ok > make_interval(hours => horas)),
  a2 as (
    select 'agenda:' || a.jobname as id, 'atencao' as gravidade, a.fonte,
      a.rotulo || case when j.jobid is null then ' não existe' else ' está desligado' end as titulo,
      'O agendamento não está rodando, então os dados desta rotina não atualizam sozinhos.' as detalhe,
      null::timestamptz as desde, 'Ligue o agendamento em Integrações e logs, se a pausa não for proposital.' as acao
    from config.agendamento a left join cron.job j on j.jobname = a.jobname
    where a.exibir and a.jobname not like '%backfill%' and (j.jobid is null or j.active is not true)),
  base as (
    select j.jobid, j.active,
      (select max(d.end_time) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'succeeded') as ultimo_ok
    from cron.job j where j.command ilike '%refresh materialized view%mv_ingresso_transacao%' order by j.jobid limit 1),
  a3 as (
    select 'base:pedidos' as id, 'critico' as gravidade, 'central' as fonte,
      'Base de pedidos da Central sem atualizar' as titulo,
      case when b.active is not true then 'A rotina que atualiza a base (a cada 15 min) está desligada, então Recuperação e indicadores de ingressos não recebem pedidos novos.'
           else 'A rotina que atualiza a base (a cada 15 min) está sem sucesso há mais de 1 hora.' end as detalhe,
      b.ultimo_ok as desde,
      'Ligue a rotina de atualização da base de pedidos (pg_cron) ou peça ao suporte técnico para verificar.' as acao
    from base b where b.active is not true or b.ultimo_ok is null or now() - b.ultimo_ok > interval '1 hour')
  select jsonb_build_object('agora', now(), 'alertas', coalesce((select jsonb_agg(to_jsonb(x) order by (x.gravidade = 'critico') desc, x.id) from (select * from a1 union all select * from a2 union all select * from a3) x), '[]'));
$function$;
notify pgrst, 'reload schema';
