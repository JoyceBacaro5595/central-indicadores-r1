-- Meta de leads do ciclo (Joyce, 19/10): coluna nova em config.meta_ciclo; meta_ciclo_salvar passa a gravar `leads`.
-- Ciclo 45 cadastrado com o plano da Lovable do RGV (3.200 leads, R$ 1.050.000, 80 vendas). Aplicada como migration meta_ciclo_leads_v1.
-- Para desfazer: alter table config.meta_ciclo drop column leads; (e restaurar meta_ciclo_salvar de meta-ciclo-rgv-v1.sql)
alter table config.meta_ciclo add column if not exists leads integer;
