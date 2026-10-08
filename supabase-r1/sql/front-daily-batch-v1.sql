-- Aplicado no Supabase r1-indicadores em 08/10/2026 (sessão Claude). Versionado para revisão; não reaplicar versões antigas.
-- Lote diário automático dos indicadores + proteção de capacidade + horas das fontes na RPC.
-- Sequência: ponte PR #10 → front-media-dimensions-v1 → front-period-matrix-v1 → front-metadata-contract-v1 → este arquivo.

-- Proteção de capacidade: limite em rgv.sync_config (tool='etl').checkpoint.capacity_limit_bytes (padrão 500 MiB, plano Free).
create or replace function rgv.capacity_status() returns jsonb language sql stable set search_path='' as $fn$
select jsonb_build_object(
  'db_bytes', pg_database_size(current_database()),
  'limit_bytes', coalesce((select (checkpoint->>'capacity_limit_bytes')::bigint from rgv.sync_config where tool='etl'), 524288000),
  'ok', pg_database_size(current_database()) < coalesce((select (checkpoint->>'capacity_limit_bytes')::bigint from rgv.sync_config where tool='etl'), 524288000));
$fn$;
revoke all on function rgv.capacity_status() from public,anon,authenticated;

-- Lote diário: espera HubSpot e Meta fecharem o mesmo corte (ontem em Brasília), um lote por corte, publicação pela trava conjunta.
create or replace function rgv.dispatch_front_daily(p_dry boolean default false) returns jsonb language plpgsql set search_path='' as $fn$
declare corte date := (now() at time zone 'America/Sao_Paulo')::date - 1;
        inicio date := coalesce((select (checkpoint->>'start_day')::date from rgv.sync_config where tool='etl'), date '2026-09-01');
        cap jsonb := rgv.capacity_status(); why text; outcome jsonb; run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('rgv.front_daily_dispatch',0));
  if not coalesce((select enabled from rgv.sync_config where tool='etl'), false) then why := 'ETL desativado em rgv.sync_config';
  elsif exists (select 1 from rgv.front_batch where status='published' and end_day >= corte) then why := 'Lote do corte '||corte||' já publicado';
  elsif exists (select 1 from rgv.front_batch where status in ('staging','waiting') and end_day >= corte) then why := 'Lote do corte '||corte||' ainda aguardando publicação';
  elsif not (cap->>'ok')::boolean then why := 'Capacidade: banco com '||pg_size_pretty((cap->>'db_bytes')::bigint)||', limite '||pg_size_pretty((cap->>'limit_bytes')::bigint)||'. Novo lote bloqueado até decisão (limpar snapshots ou ampliar plano).';
  elsif not exists (select 1 from rgv.sync_config where tool='hubspot' and enabled and coalesce((checkpoint->>'bootstrap_done')::boolean,false) and watermark >= ((corte+1)::timestamp at time zone 'America/Sao_Paulo')) then why := 'HubSpot ainda não fechou o corte '||corte;
  elsif exists (select 1 from rgv.deal where created_at >= '2026-01-01 00:00:00-03' and created_at < ((corte+1)::timestamp at time zone 'America/Sao_Paulo') and pipeline_id in ('749390743','746355509') and not coalesce(history_complete,false)) then why := 'HubSpot com histórico pendente';
  elsif exists (select 1 from generate_series(inicio::timestamp, corte::timestamp, interval '1 day') d cross join (values('696363384474339'),('171474008015977')) a(account_id)
                where not exists (select 1 from rgv.meta_complete_window w where w.account_id=a.account_id and d::date between w.start_day and w.end_day)) then why := 'Meta ainda não fechou o corte '||corte||' nas duas contas';
  end if;
  if why is not null then
    if not p_dry then insert into rgv.sync_run(tool,source,status,start_at,end_at,started_at,finished_at,error_type,error_detail) values('etl','cron','skipped',inicio,corte,now(),now(),'aguardando',why); end if;
    return jsonb_build_object('status','skipped','corte',corte,'motivo',why,'capacidade',cap,'dry',p_dry);
  end if;
  if p_dry then return jsonb_build_object('status','ready','corte',corte,'inicio',inicio,'capacidade',cap,'dry',true); end if;
  insert into rgv.sync_run(tool,source,status,start_at,end_at,started_at) values('etl','cron','running',inicio,corte,now()) returning id into run_id;
  begin
    outcome := rgv.build_front_batch_v1(inicio, corte);
    update rgv.sync_run set status = case when outcome->>'status'='published' then 'success' else 'partial' end, finished_at=now(), rows_processed=coalesce((outcome->>'rows')::bigint,0), checkpoint=outcome, error_detail=outcome->>'reason' where id=run_id;
  exception when others then
    update rgv.sync_run set status='error', finished_at=now(), error_type=sqlstate, error_detail=left(sqlerrm,500) where id=run_id;
    raise;
  end;
  return outcome || jsonb_build_object('corte',corte,'capacidade',cap);
end $fn$;
revoke all on function rgv.dispatch_front_daily(boolean) from public,anon,authenticated;

update rgv.sync_config set enabled=true, cron_expression='0 * * * *', daily_time='00:00:00', timezone='America/Sao_Paulo',
  checkpoint = coalesce(checkpoint,'{}'::jsonb) || jsonb_build_object('capacity_limit_bytes', 524288000, 'start_day', '2026-09-01', 'descricao', 'Lote dos indicadores: verifica a cada hora cheia (minuto 00) e gera um lote por corte (ontem) assim que HubSpot e Meta fecham o corte.'),
  updated_at=now()
where tool='etl';

select cron.schedule('rgv-lote-diario', '0 * * * *', 'select rgv.dispatch_front_daily();');

-- Horas das fontes e do último lote, para o painel (recurso painel).
create or replace function rgv.fontes_atualizacao() returns jsonb language sql stable security definer set search_path='' as $fn$
select identity.exigir('painel');
select jsonb_build_object(
  'hubspot_atualizado_em', (select watermark from rgv.sync_config where tool='hubspot'),
  'hubspot_ultima_execucao', (select max(finished_at) from rgv.sync_run where tool='hubspot' and status in ('success','partial')),
  'meta_coletado_em', (select max(collected_at) from rgv.ad_daily),
  'meta_ultimo_dia', (select max(day) from rgv.ad_daily),
  'lote_publicado_em', (select max(published_at) from rgv.front_batch where status='published'),
  'lote_corte', (select max(end_day) from rgv.front_batch where status='published'),
  'lote_proximo', (select jsonb_build_object('status', status, 'quando', finished_at, 'motivo', error_detail) from rgv.sync_run where tool='etl' order by coalesce(finished_at, started_at, run_after) desc limit 1),
  'verificacao_ultima', (select max(coalesce(finished_at, started_at)) from rgv.sync_run where tool='etl'),
  'verificacao_proxima', date_trunc('hour', now()) + interval '1 hour',
  'verificacao_cron', (select cron_expression from rgv.sync_config where tool='etl'),
  'capacidade', rgv.capacity_status());
$fn$;
revoke all on function rgv.fontes_atualizacao() from public,anon;
grant execute on function rgv.fontes_atualizacao() to authenticated, service_role;

create or replace function public.perpetuo_funil_v2(p_de date default null, p_ate date default null) returns jsonb language sql stable set search_path='' as $fn$
select rgv.read_front(p_de,p_ate) || jsonb_build_object('fontes_atualizacao', rgv.fontes_atualizacao());
$fn$;

-- Ensaio sem gravar: select rgv.dispatch_front_daily(true);
