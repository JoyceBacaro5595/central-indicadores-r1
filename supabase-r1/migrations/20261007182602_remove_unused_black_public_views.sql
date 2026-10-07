-- Authorized removal of public Black10x views. Source tables remain intact.
drop view if exists public.bf_situacao, public.bf_dia, public.bf_campanha,
 public.bf_resumo, public.bf_criativo, public.bf_camp_dia,
 public.bf_pendente, public.bf_recuperacao;
revoke execute on function public.perpetuo_funil(date,date) from public,anon;
grant execute on function public.perpetuo_funil(date,date) to authenticated;
