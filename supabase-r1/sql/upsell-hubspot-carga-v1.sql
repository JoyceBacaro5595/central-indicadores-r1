-- Upsell: carga automática das vendas ganhas de Clube R1 e Trator direto do HubSpot (pedido da Joyce, 19/10).
-- Autorizada por ela em decision card. Não apaga nada: negócio que deixou de ser ganho vira etapa 'Reaberto'.
alter table rgv.vendas_clube_trator
  add column if not exists pipeline text,
  add column if not exists hs_tag_ids text,
  add column if not exists sincronizado_em timestamptz;

-- tag do HubSpot (id) -> tag de ciclo (ex.: 28587504 = "RGV 44"); aprendida a partir das vendas já tagueadas
-- e ajustável à mão para ciclos novos.
create table if not exists rgv.hubspot_tag_ciclo (
  tag_id text primary key,
  evento_tag text not null,
  n int not null default 0,
  manual boolean not null default false,
  atualizado_em timestamptz not null default now()
);
alter table rgv.hubspot_tag_ciclo enable row level security;

create or replace function raw.upsell_hubspot_chamar() returns bigint language sql security definer set search_path to '' as $$
  select net.http_get(
    url := 'https://lgaujmjedphzynhbokob.supabase.co/functions/v1/upsell-hubspot-sync',
    headers := jsonb_build_object('x-guru-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'guru_sync_key')),
    timeout_milliseconds := 120000);
$$;
revoke all on function raw.upsell_hubspot_chamar() from public, anon, authenticated;
