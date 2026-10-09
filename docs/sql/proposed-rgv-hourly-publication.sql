-- APLICADA em 09/10/2026 após aprovação explícita. Migração rgv_hourly_publication_and_manager.
-- Verificação: duas publicações reutilizaram o mesmo batch_id e não aumentaram a quantidade de lotes.
CREATE OR REPLACE FUNCTION rgv.refresh_front_batch_v1(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare batch uuid; outcome jsonb;begin
if p_start<date '2026-01-01' or p_end<p_start or p_end>=(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Corte inválido';end if;
perform pg_advisory_xact_lock(hashtextextended('rgv.front_build',0));
select id into batch from rgv.front_batch where start_day=p_start and end_day=p_end and status='published' order by published_at desc limit 1 for update;
if batch is null then
insert into rgv.front_batch(start_day,end_day,rules_version,validated) values(p_start,p_end,'crm-v18-etapa-alcancada',false) returning id into batch;
else
delete from rgv.front_crm_snapshot where batch_id=batch;
delete from rgv.front_pending where batch_id=batch;
update rgv.front_batch set status='staging', validated=false, rules_version='crm-v18-etapa-alcancada', reason=null, solution=null where id=batch;
end if;
insert into rgv.front_crm_snapshot select batch,deal_id,campaign_id,attribution_status,coalesce(missing_principal_history,false),coalesce(history_complete,false),revenue,movement_days from rgv.crm_funnel_snapshot_at_v2(p_end);
with campaigns as (select campaign_id,max(campaign_name) label from rgv.ad where account_id='696363384474339' and strpos(upper(coalesce(campaign_name,'')),'[FF]')>0 group by campaign_id),
entities as (select 'total'::text grain,'all'::text entity_id,'Perpétuo RGV · [FF]'::text label union all select 'campaign',campaign_id,label from campaigns),
days as (select d::date as day from generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') d),
media as (select a.campaign_id,m.day,sum(m.spend) spend,sum(m.impressions) impressions,sum(m.link_clicks) clicks,
case when bool_and(m.landing_page_views is not null) then sum(m.landing_page_views) end views,
case when bool_and(m.pixel_leads is not null) then sum(m.pixel_leads) end pixel
from rgv.ad_daily m join rgv.ad a using(account_id,ad_id) join campaigns c using(campaign_id)
where m.account_id='696363384474339' and m.day between p_start and p_end group by a.campaign_id,m.day),
aggregated as (select 'campaign'::text grain,campaign_id entity_id,day,spend,impressions,clicks,views,pixel from media
union all select 'total','all',day,sum(spend),sum(impressions),sum(clicks),case when bool_and(views is not null) then sum(views) end,case when bool_and(pixel is not null) then sum(pixel) end from media group by day)
insert into rgv.front_pending(batch_id,grain,entity_id,day,label,media_complete,crm_complete,history_complete,attribution_complete,spend,impressions,link_clicks,landing_page_views,pixel_leads)
select batch,e.grain,e.entity_id,d.day,e.label,
exists(select 1 from rgv.meta_complete_window w where w.account_id='696363384474339' and d.day between w.start_day and w.end_day),
true,not exists(select 1 from rgv.front_crm_snapshot s where s.batch_id=batch and not s.history_complete),
false,coalesce(m.spend,0),coalesce(m.impressions,0),coalesce(m.clicks,0),case when m.entity_id is null then 0 else m.views end,case when m.entity_id is null then 0 else m.pixel end
from entities e cross join days d left join aggregated m on m.grain=e.grain and m.entity_id=e.entity_id and m.day=d.day;

with ads as (
select a.*,d.day,d.spend,d.impressions,d.link_clicks,d.landing_page_views,d.pixel_leads
from rgv.ad_daily d join rgv.ad a using(account_id,ad_id)
where d.account_id='696363384474339' and d.day between p_start and p_end
and strpos(upper(coalesce(a.campaign_name,'')),'[FF]')>0
), dims as (
select 'creative'::text grain,creative_id entity_id,coalesce(creative_name,ad_name) label,day,spend,impressions,link_clicks,landing_page_views,pixel_leads from ads where creative_id is not null
union all
select 'lp',lp_id, destination_url,day,spend,impressions,link_clicks,landing_page_views,pixel_leads from ads where lp_id is not null
)
insert into rgv.front_pending(batch_id,grain,entity_id,day,label,media_complete,crm_complete,history_complete,attribution_complete,spend,impressions,link_clicks,landing_page_views,pixel_leads)
select batch,grain,entity_id,day,max(label),true,true,true,false,sum(spend),sum(impressions),sum(link_clicks),
case when bool_and(landing_page_views is not null) then sum(landing_page_views) end,
case when bool_and(pixel_leads is not null) then sum(pixel_leads) end
from dims group by grain,entity_id,day;

update rgv.front_batch set validated=true where id=batch;
outcome:=rgv.try_publish_front(batch);
if outcome->>'status'<>'published' then raise exception 'Publicação não concluída: %',outcome->>'reason'; end if;
return outcome;
end $function$;

CREATE OR REPLACE FUNCTION rgv.dispatch_front_daily(p_dry boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare corte date := (now() at time zone 'America/Sao_Paulo')::date - 1;
        inicio date := coalesce((select (checkpoint->>'start_day')::date from rgv.sync_config where tool='etl'), date '2026-09-01');
        cap jsonb := rgv.capacity_status(); why text; outcome jsonb; run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('rgv.front_daily_dispatch',0));
  if not coalesce((select enabled from rgv.sync_config where tool='etl'), false) then why := 'ETL desativado em rgv.sync_config';
  
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
    outcome := rgv.refresh_front_batch_v1(inicio, corte);
    update rgv.sync_run set status = case when outcome->>'status'='published' then 'success' else 'partial' end, finished_at=now(), rows_processed=coalesce((outcome->>'rows')::bigint,0), checkpoint=outcome, error_detail=outcome->>'reason' where id=run_id;
  exception when others then
    update rgv.sync_run set status='error', finished_at=now(), error_type=sqlstate, error_detail=left(sqlerrm,500) where id=run_id;
    return jsonb_build_object('status','error','reason',left(sqlerrm,500),'run_id',run_id);
  end;
  return outcome || jsonb_build_object('corte',corte,'capacidade',cap);
end $function$;

CREATE OR REPLACE FUNCTION rgv.prepare_meta_hourly_refresh()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c rgv.sync_config; end_date date; secret_key text; request_id bigint;
begin
select * into c from rgv.sync_config where tool='meta' for update;
if not c.enabled then return jsonb_build_object('status','disabled'); end if;
if (c.checkpoint->>'lease_until')::timestamptz>now() then return jsonb_build_object('status','busy'); end if;
if c.checkpoint->>'priority_period' in ('incremental_hourly','revisao_semanal_7_dias') then return jsonb_build_object('status','pending_resume'); end if;
end_date:=(now() at time zone 'America/Sao_Paulo')::date-1;
update rgv.sync_config set checkpoint=jsonb_build_object('day',(end_date-greatest(1,c.rolling_days)+1)::text,'start_day',(end_date-greatest(1,c.rolling_days)+1)::text,'end_day',end_date::text,'account_index',0,'historical_done',false,'priority_period','incremental_hourly','resume_checkpoint',coalesce(c.checkpoint,'{}'::jsonb)),updated_at=now() where tool='meta';
select decrypted_secret into secret_key from vault.decrypted_secrets where name='rgv_sync_key';
if secret_key is null then raise exception 'internal_sync_key_missing'; end if;
request_id:=net.http_post(url:='https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-meta-sync',body:='{"source":"cron"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-rgv-sync-key',secret_key),timeout_milliseconds:=110000);
return jsonb_build_object('status','queued','inicio',end_date-greatest(1,c.rolling_days)+1,'fim',end_date,'request_id',request_id);
end $function$;

CREATE OR REPLACE FUNCTION public.gerenciador_estado()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select identity.exigir('gerenciador');
  select jsonb_build_object(
    'agora', now(),
    'banco_mb', round(pg_database_size(current_database()) / 1048576.0),
    'ultima_captura', (select max(capturado_em) from raw.guru_transaction),
    'parametros', (select coalesce(jsonb_agg(jsonb_build_object('chave', chave, 'valor', valor, 'rotulo', rotulo, 'descricao', descricao, 'grupo', grupo, 'atualizado_em', atualizado_em) order by grupo, chave), '[]') from config.parametro),
    'agendamentos', (select coalesce(jsonb_agg(jsonb_build_object(
        'jobname', a.jobname, 'rotulo', a.rotulo, 'descricao', a.descricao, 'fonte', a.fonte, 'ordem', a.ordem,
        'schedule', j.schedule, 'active', j.active, 'existe', j.jobid is not null,
        'ultima_execucao', r.start_time, 'ultimo_status', r.status, 'ultima_msg', left(r.return_message, 200), 'duracao_s', extract(epoch from (r.end_time - r.start_time)),
        'execucoes_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'),
        'falhas_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours' and d.status <> 'succeeded')
      ) order by a.ordem), '[]')
      from config.agendamento a left join cron.job j on j.jobname = a.jobname
      left join lateral (select * from cron.job_run_details d where d.jobid = j.jobid order by start_time desc limit 1) r on true
      where a.exibir),
    'fontes', (select coalesce(jsonb_agg(jsonb_build_object('fonte', fonte, 'entidade', entidade, 'escopo', escopo, 'modo', modo, 'status', status, 'registros', registros_processados, 'paginas', paginas_processadas, 'erro', left(ultimo_erro, 200), 'atualizado_em', atualizado_em) order by fonte, escopo), '[]') from raw.sync_estado),
    'rgv_logs', (select coalesce(jsonb_agg(to_jsonb(s) order by s.started_at desc), '[]'::jsonb) from (select id,tool,source,status,start_at,end_at,started_at,finished_at,rows_processed,error_type,error_detail from rgv.sync_run order by coalesce(started_at,run_after) desc limit 60) s),
    'rgv_config', (select coalesce(jsonb_agg(jsonb_build_object('tool',tool,'rolling_days',rolling_days)), '[]'::jsonb) from rgv.sync_config),
    'logs', (select coalesce(jsonb_agg(l order by l.iniciado_em desc), '[]') from (
        select id, fonte, entidade, tipo_carga, status, linhas_lidas, janela_inicio, janela_fim, iniciado_em, finalizado_em, left(mensagem_erro, 200) as mensagem_erro
        from raw.log_ingestao order by iniciado_em desc limit 40) l),
    'cobertura', (select coalesce(jsonb_agg(c order by c.mes), '[]') from (
        with t as (select distinct on (source_key) source_key, payload, capturado_em from raw.guru_transaction order by source_key, source_updated_at desc nulls last, capturado_em desc)
        select to_char(to_timestamp((payload->'dates'->>'ordered_at')::bigint) at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
               count(*) as transacoes, count(*) filter (where payload->>'status' = 'approved') as aprovadas, max(capturado_em) as ultima_captura
        from t where payload->'dates'->>'ordered_at' is not null group by 1) c),
    'carga_mensal', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'status', status, 'chamadas', chamadas, 'lidas', lidas, 'versoes_novas', versoes_novas, 'iniciado_em', iniciado_em, 'finalizado_em', finalizado_em, 'erro', ultimo_erro) order by mes), '[]') from raw.carga_mensal),
    'historico', (select coalesce(jsonb_agg(jsonb_build_object('quando', h.quando, 'quem', p.nome, 'tipo', h.tipo, 'chave', h.chave, 'antes', h.antes, 'depois', h.depois) order by h.quando desc), '[]')
        from (select * from config.historico order by quando desc limit 20) h left join identity.perfil p on p.user_id = h.quem)
  );
$function$;

CREATE OR REPLACE FUNCTION public.gerenciador_agendamento_atualizar(p_jobname text, p_schedule text DEFAULT NULL::text, p_active boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j record;
begin
  perform identity.exigir('gerenciador');
  if not exists (select 1 from config.agendamento where jobname = p_jobname and exibir) then raise exception 'Agendamento desconhecido'; end if;
  select * into j from cron.job where jobname = p_jobname;
  if not found then raise exception 'Agendamento não existe no cron'; end if;
  if p_schedule is not null and p_schedule <> j.schedule then
    perform cron.alter_job(job_id := j.jobid, schedule := p_schedule);
    insert into config.historico (quem, tipo, chave, antes, depois) values (auth.uid(), 'agendamento.schedule', p_jobname, to_jsonb(j.schedule), to_jsonb(p_schedule));
  end if;
  if p_active is not null and p_active <> j.active then
    perform cron.alter_job(job_id := j.jobid, active := p_active);
    insert into config.historico (quem, tipo, chave, antes, depois) values (auth.uid(), 'agendamento.active', p_jobname, to_jsonb(j.active), to_jsonb(p_active));
  end if;
  update rgv.sync_config set cron_expression=coalesce(p_schedule,cron_expression), enabled=coalesce(p_active,enabled), updated_at=now()
  where tool=case p_jobname when 'rgv-hubspot-auto' then 'hubspot' when 'rgv-meta-historico-2026' then 'meta' when 'rgv-lote-diario' then 'etl' else null end;
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function rgv.refresh_front_batch_v1(date,date) from public, anon, authenticated;
update rgv.sync_config set checkpoint=jsonb_set(coalesce(checkpoint,'{}'::jsonb),'{capacity_limit_bytes}','6442450944'::jsonb),cron_expression='10 * * * *',updated_at=now() where tool='etl';
insert into config.agendamento(jobname,rotulo,descricao,fonte,exibir,ordem) values
('rgv-hubspot-auto','HubSpot Perpétuo','Incremental com histórico e ponto de retomada','rgv-hubspot',true,100),
('rgv-meta-historico-2026','Meta Perpétuo','Relê a janela configurada e sobrescreve por anúncio e dia','rgv-meta',true,101),
('rgv-lote-diario','Publicação Perpétuo','Reconstrói o mesmo corte sem acumular snapshots horários','rgv-etl',true,102),
('rgv-meta-revisao-semanal-7d','Revisão Meta semanal','Reprocessamento semanal dos últimos 7 dias','rgv-meta',true,103)
on conflict(jobname) do update set rotulo=excluded.rotulo,descricao=excluded.descricao,fonte=excluded.fonte,exibir=excluded.exibir;
create or replace function public.gerenciador_janela_rgv(p_tool text,p_dias integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin
perform identity.exigir('gerenciador');
if p_tool not in ('meta','hubspot') or p_dias<1 or p_dias>93 then raise exception 'Fonte ou janela inválida (1 a 93 dias)'; end if;
update rgv.sync_config set rolling_days=p_dias,updated_at=now() where tool=p_tool;
insert into config.historico(quem,tipo,chave,depois) values(auth.uid(),'janela',p_tool,to_jsonb(p_dias));
return jsonb_build_object('ok',true);
end $$;
revoke all on function public.gerenciador_janela_rgv(text,integer) from public,anon;
grant execute on function public.gerenciador_janela_rgv(text,integer) to authenticated;

