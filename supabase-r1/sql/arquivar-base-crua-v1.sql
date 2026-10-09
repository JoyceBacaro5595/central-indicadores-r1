-- Arquivamento da base crua no Storage (decisão da Joyce em 09/10/2026: "Arquivar e compactar").
-- Aplicado em produção em 09/10/2026. Nada é apagado do banco sem antes estar gravado e
-- conferido (sha256) no bucket privado "arquivo"; cada arquivo fica em rgv.arquivo_manifesto.
--
-- O que foi arquivado em 09/10:
--   rgv.raw_record  → 34.408 capturas repetidas do HubSpot (importação CSV de 07/10 + capturas
--                     antigas da API); ficou só a captura mais recente de cada negócio (28.469).
--   rgv.ad_daily    → campo actions (detalhe por ação do Meta) dos meses fechados (jan–set 2026,
--                     50.030 linhas). Os indicadores usam as colunas spend/impressions/link_clicks/
--                     landing_page_views/pixel_leads, que ficam intactas. O mês corrente mantém
--                     o detalhe; a rotina mensal fecha o mês anterior.
-- Resultado: banco de 502 MB para 448 MB. VACUUM FULL em rgv.ad_daily e rgv.raw_record
-- (bloqueado para o agente) libera mais ~30 MB; Joyce roda no SQL Editor:
--   vacuum full rgv.ad_daily;
--   vacuum full rgv.raw_record;

create table if not exists rgv.arquivo_manifesto (
  id bigserial primary key,
  tabela text not null,            -- ex.: rgv.raw_record, rgv.ad_daily.actions
  chave text not null,             -- ex.: batch_id, 'duplicados', 'ate-YYYY-MM-DD'
  caminho text not null unique,    -- caminho do objeto no bucket "arquivo"
  linhas integer not null,
  bytes bigint not null,
  sha256 text not null,
  removido_do_banco boolean not null default false,
  criado_em timestamptz not null default now()
);
revoke all on rgv.arquivo_manifesto from public, anon, authenticated;

insert into storage.buckets (id, name, public)
values ('arquivo', 'arquivo', false)
on conflict (id) do nothing;

-- Chama a Edge Function rgv-arquivar de forma síncrona (mesmo padrão de rgv.dispatch_hubspot).
create or replace function rgv.arquivar_chamar(p_body jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare secret text; response extensions.http_response;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name='rgv_sync_key';
  if secret is null then raise exception 'RGV sync credential missing'; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','110000');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','10000');
  select * into response from extensions.http((
    'POST','https://lgaujmjedphzynhbokob.supabase.co/functions/v1/rgv-arquivar',
    array[('x-rgv-sync-key',secret)::extensions.http_header],
    'application/json', p_body::text)::extensions.http_request);
  return jsonb_build_object('http_status',response.status,'result',
    case when response.content ~ '^\s*[\[{]' then response.content::jsonb else to_jsonb(left(response.content,300)) end);
end $$;
revoke all on function rgv.arquivar_chamar(jsonb) from public, anon, authenticated;

-- Rotina mensal (dia 2, 03:30 UTC): capturas repetidas + detalhe do Meta do mês fechado.
select cron.schedule('rgv-arquivar-mensal', '30 3 2 * *', $$select rgv.arquivar_chamar('{"op":"mensal"}'::jsonb)$$);

-- Execução manual (exemplos):
--   select rgv.arquivar_chamar('{"op":"raw_record_duplicados"}'::jsonb);
--   select rgv.arquivar_chamar('{"op":"ad_daily_actions","ate":"2026-10-01"}'::jsonb);
--   select rgv.arquivar_chamar('{"op":"raw_record_lote","batch_id":"<uuid>"}'::jsonb);
