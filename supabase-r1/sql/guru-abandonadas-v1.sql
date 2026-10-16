-- Abandonadas da Guru na Central (pedido da Joyce, 16/10). Aplicado em produção.
-- 1) Edge function guru-sync (versão 13) ganhou a op "abandonadas": mesma varredura do incremental, mas com o filtro
--    transaction_status[]=abandoned, porque a listagem padrão de /transactions não traz esse status.
--    Uso: .../functions/v1/guru-sync?op=abandonadas&dias=7  (header x-guru-sync-key). As outras ops não mudaram.
-- 2) Primeira carga de 30 dias: 172 transações abandonadas gravadas em raw.guru_transaction.
-- 3) Rotina horária (jobid 34), nos mesmos horários da carga incremental, 20 minutos depois:
select cron.schedule('guru-abandonadas-hourly', '20 0,1,2,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *',
  $$ select raw.guru_sync_chamar('op=abandonadas&dias=7') where exists (select 1 from raw.sync_estado where fonte = 'guru' and escopo = 'transaction:2026-01-01' and status = 'concluido') $$);
-- A view marts.vw_recuperacao_carrinho já aceitava o status abandoned; não houve mudança nela.
