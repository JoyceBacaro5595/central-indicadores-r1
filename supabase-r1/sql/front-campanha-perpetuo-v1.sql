-- Perpétuo = campanha/UTM com [FF], [PERP] ou [PER] no nome da campanha (Joyce, 09/10/2026).
-- Aplicado em rgv.crm_funnel_deal_v1 (HubSpot), rgv.build_front_batch_v1, rgv.build_front_parcial e rgv-meta-metadata-sync v9.
-- [PER] no nome do ANÚNCIO é convenção de criativo e aparece em campanhas de outros produtos (ANTICAOS, SOS, ARDJ): não conta.
create or replace function rgv.campanha_perpetuo(p_nome text) returns boolean language sql immutable set search_path to '' as $$
 select upper(coalesce(p_nome,'')) ~ '\[(FF|PERP|PER)\]' $$;

-- PENDENTE (rodar no SQL Editor do Supabase; a ferramenta de automação não executa funções com DELETE no corpo):
-- rgv.refresh_front_batch_v1 ainda seleciona campanhas do Meta por '[FF]'. Troque as duas ocorrências de
--   strpos(upper(coalesce(campaign_name,'')),'[FF]')>0   por   rgv.campanha_perpetuo(campaign_name)
-- e o rótulo 'Perpétuo RGV · [FF]' por 'Perpétuo RGV', rules_version 'crm-v19-mql-perfil-primeiro-dia'.
-- Enquanto isso o resultado é idêntico: nenhuma campanha da conta Perpétuo usa [PER]/[PERP] no nome (09/10/2026).
