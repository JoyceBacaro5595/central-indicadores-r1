alter table rgv.ad add column if not exists campaign_status text,add column if not exists ad_status text,add column if not exists destination_type text;
create table if not exists rgv.meta_ad_record(account_id text not null,ad_id text not null,payload jsonb not null,collected_at timestamptz not null default now(),primary key(account_id,ad_id));
alter table rgv.meta_ad_record enable row level security;
revoke all on rgv.meta_ad_record from public,anon,authenticated;
