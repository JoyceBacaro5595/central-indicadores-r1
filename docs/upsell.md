# Upsell (Clube R1 e Operação Trator)

Módulo `/upsell/clube-r1` e `/upsell/trator` (recurso `perpetuo`). Pedido da Joyce em 19/10/2026. Código: `src/pages/Upsell.tsx`.

## O que a tela mostra
- Layout padrão da plataforma: filtro de período no topo (`PeriodoPadrao`, regra em `padrao-filtro-periodo.md`), abas `toggle-group`, título com faturamento e ticket médio do período.
- O filtro de período vale para a **data de fechamento** das vendas. Seletor de tag do ciclo (ex.: "RGV 44").
- Cards: vendas e última venda. Gráficos: vendas e faturamento por tag; vendas (barras, quantidade acima) e faturamento (linha) por mês de fechamento.
- Tabelas por tag, origem (`origem_dos_negocios`) e campanha (`utm_camp`), mais a lista de negócios ganhos. Valores em reais sempre com 2 decimais.
- Só na aba Clube R1: tabela **Aplicações por ciclo** (quantidade, % e faturamento por situação).

## Definições
- **Venda**: negócio ganho (`hs_is_closed_won`) com `produto` = "Clube R1" ou "Operação Trator", fechado desde 01/01/2026, em qualquer funil. Vendas fechadas antes ou depois do ciclo não têm tag e aparecem como "Sem tag".
- **Aplicação** (Joyce): todo negócio do funil `[OFICIAL] Clube R1` (id 135241872) que tem a tag do ciclo, em qualquer etapa. Atenção: esse funil contém também negócios de Operação Trator; hoje a contagem soma os dois (a coluna `produto` permite separar). Decisão pendente com a Joyce.
- **Situação da aplicação** (por etapa atual): Ganho (232902155); Perdidas (232902156); Canceladas (Cancelado 268514208 e Cancelamento Aprovado 1141304948); Cancel. solicitado (1141258527); Em aprovação (951844676, 232902152, 232902153, 938184202); Em negociação (todas as demais, incluindo Finalizando 1100514897, a validar com a Joyce).
- **Cancel. sobre vendas** = canceladas / (ganho + canceladas).

## Dados e carga automática
| Item | Onde | Frequência |
|---|---|---|
| Vendas ganhas | Edge Function `upsell-hubspot-sync` grava em `rgv.vendas_clube_trator`; RPC `public.upsell_vendas()` | cron `upsell-hubspot-carga`, minuto 35 de toda hora |
| Aplicações | Edge Function `upsell-aplicacoes-sync` grava em `rgv.clube_aplicacao`; RPC `public.upsell_aplicacoes()` | cron `upsell-aplicacoes-carga`, minuto 40 de toda hora |
| Tag do HubSpot → ciclo | `rgv.hubspot_tag_ciclo` | aprendida das vendas já tagueadas; ciclo novo exige linha manual (`manual=true`) |

- Nada é apagado: venda que deixou de ser ganha vira etapa `Reaberto`; aplicações são atualizadas por `deal_id`.
- Autenticação das funções: header `x-guru-sync-key` (segredo `guru_sync_key` no Vault); `HUBSPOT_TOKEN` é segredo da função. Disparo manual: `select raw.upsell_hubspot_chamar()` / `select raw.upsell_aplicacoes_chamar()` e leitura em `net._http_response`.
- Tags mapeadas: 22606637=RGV 38, 23739133=39, 24586381=40, 25657230=41, 26739372=42, 27623526=43, 28587504=44. **RGV 45 ainda sem id mapeado.**
- Sem mapeamento, o negócio fica sem ciclo (202 negócios na última carga). Datas do evento vêm de `config.agenda_evento`.

- **Campanha (UTM)**: vale o `utm_camp` do negócio; se vazio, a carga usa a campanha do contato associado (utm_campaign do contato ou o do link da primeira página), gravada em `campanha_contato`. É a campanha do primeiro contato do lead, não necessariamente a que gerou a compra. Recuperou 34 dos 88 negócios sem campanha; o resto segue como "Sem campanha".
- Na lista de negócios, o nome foi trocado pelo ID do HubSpot, com link para o negócio (portal 23586399).

## Tela Ciclos RGV (Relatório Ricardo)
- Série fechada RGV 29 a 43: planilha "R1 Histórico Dados" (dados fixos, `src/pages/historico/dados.ts`), mantida.
- RGV 44 (fechado) e RGV 45 (em curso, projetado pelo ritmo): funil do Perpétuo, automático do HubSpot.

## Pendências
Definir se a aba Clube conta só `produto = Clube R1`; mapear a tag do RGV 45; validar "Finalizando"; leitura de disparos (ligações, WhatsApp, SMS) ainda em exploração, sem tela.
