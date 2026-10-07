-- r1-indicadores only; do not apply to the Lovable project.
alter table rgv.deal add column current_stage_name text;
alter table rgv.deal add column current_stage_entered_at timestamptz;
-- The CSV has no timezone. Preserve the original text in raw_record; normalized dates assume Sao Paulo.
alter table rgv.deal add column source_timezone text;
alter table rgv.deal add column source_timezone_verified boolean not null default false;
