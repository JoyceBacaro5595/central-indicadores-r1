-- Run server-side after raw import validation. Does not populate funnel history or attribution.
-- CSV timestamps lack timezone: normalization assumes Sao Paulo, retained as unverified metadata.
insert into rgv.deal (
 deal_id,pipeline_name,current_stage_name,current_stage_entered_at,
 created_at,modified_at,sale_at,amount,utm_source,utm_medium,utm_campaign,utm_content,utm_term,
 origin,product,monthly_revenue_raw,employee_count_raw,source_modified_at,source_timezone,source_timezone_verified
)
select record_id,nullif(payload->>'Pipeline',''),nullif(payload->>'Etapa do negócio',''),
 nullif(payload->>'Data que entrou na fase atual','')::timestamp at time zone 'America/Sao_Paulo',
 nullif(payload->>'Data de criação','')::timestamp at time zone 'America/Sao_Paulo',
 nullif(payload->>'Data da última modificação','')::timestamp at time zone 'America/Sao_Paulo',
 nullif(payload->>'Data da venda','')::timestamp at time zone 'America/Sao_Paulo',
 nullif(payload->>'Valor na moeda da empresa','')::numeric,
 nullif(payload->>'UTM SOURCE',''),nullif(payload->>'UTM MEDIUM',''),nullif(payload->>'UTM CAMPAIGN',''),
 nullif(payload->>'UTM CONTENT',''),nullif(payload->>'UTM TERM',''),
 nullif(payload->>'Origem dos Negócios',''),nullif(payload->>'Produto',''),
 coalesce(nullif(payload->>'Faturamento mensal',''),nullif(payload->>'Faturamento (CLOSER)',''),nullif(payload->>'Faturamento  (SDR)','')),
 coalesce(nullif(payload->>'Número de funcionários',''),nullif(payload->>'N° de Funcionários (CLOSER)',''),nullif(payload->>'Número de Funcionários(SDR)','')),
 nullif(payload->>'Data da última modificação','')::timestamp at time zone 'America/Sao_Paulo',
 'America/Sao_Paulo',false
from (
 select distinct on (r.record_id) r.record_id,r.payload
 from rgv.raw_record r join rgv.import_batch b on b.id=r.batch_id
 where b.source='csv' and b.status='success'
 order by r.record_id,nullif(r.payload->>'Data da última modificação','')::timestamp desc nulls last,r.captured_at desc
) s
on conflict(deal_id) do update set
 pipeline_name=excluded.pipeline_name,current_stage_name=excluded.current_stage_name,
 current_stage_entered_at=excluded.current_stage_entered_at,created_at=excluded.created_at,
 modified_at=excluded.modified_at,sale_at=excluded.sale_at,amount=excluded.amount,
 utm_source=excluded.utm_source,utm_medium=excluded.utm_medium,utm_campaign=excluded.utm_campaign,
 utm_content=excluded.utm_content,utm_term=excluded.utm_term,origin=excluded.origin,product=excluded.product,
 monthly_revenue_raw=excluded.monthly_revenue_raw,employee_count_raw=excluded.employee_count_raw,
 source_modified_at=excluded.source_modified_at,source_timezone=excluded.source_timezone,
 source_timezone_verified=excluded.source_timezone_verified,processed_at=now()
where rgv.deal.source_modified_at is null or (not rgv.deal.source_timezone_verified and excluded.source_modified_at>=rgv.deal.source_modified_at);
