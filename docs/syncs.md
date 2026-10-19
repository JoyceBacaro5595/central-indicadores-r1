# Syncs da Central: o que cada um faz

Revisado em 19/10/2026 (cron conferido em `cron.job`; 28 rotinas ativas, todas sem falha nas últimas 24 h).

Levantamento de 19/10/2026 feito no projeto Supabase `lgaujmjedphzynhbokob` (Edge Functions publicadas e `cron.job`). Marcação: **[repo]** = código versionado em `supabase-r1/functions`; **[só no Supabase]** = publicado mas sem fonte no repositório (descrição tirada do cabeçalho do código publicado ou, quando dito, do nome).

Regras comuns: funções com `verify_jwt=false` se autenticam pelo header `x-guru-sync-key` (Vault `guru_sync_key`) ou `x-rgv-sync-key` (Vault `rgv_sync_key`). Segredos dos provedores ficam nos Secrets da função (`GURU_API_TOKEN`, `HUBSPOT_TOKEN`, tokens do Meta). Guru é somente leitura. Horários do cron em UTC.

## 1. Guru (vendas e ingressos)

| Sync | O que faz | Grava em | Agendamento |
| --- | --- | --- | --- |
| `guru-sync` [só no Supabase] | Carga geral da Guru. Operações: `diag` (testa a API), `produtos` (catálogo), `backfill` (histórico desde 01/01/2026 em janelas de 7 dias, retomando do cursor), `incremental` (revarre os últimos N dias por data do pedido), `abandonadas` (tentativas abandonadas, pedido de 16/10). Guarda o payload original; mesma versão não duplica, versão nova vira snapshot. Máximo de 3 tentativas por chamada. | `raw.guru_transaction`, `raw.guru_product`, `raw.log_ingestao`, `raw.sync_estado` | `guru-incremental-hourly` (min 5, 00-02h e 08-23h), `guru-abandonadas-hourly` (min 20), `guru-backfill-2026` (a cada 3 min, 480 execuções por dia; só trabalha enquanto o backfill não concluir), `guru-produtos-daily` (09:15) |
| `guru-revarredura` [repo] | Revarre os últimos 90 dias em janelas de 7 dias para pegar reembolso, chargeback e cancelamento de pedido antigo, que o incremental (10 dias) não alcança. Uma volta por dia, retomando de onde parou. | `raw.guru_transaction` (estado em `raw.sync_estado`, escopo `revarredura`) | `guru-revarredura-diaria` (03:12 a 05:52, a cada 8 min) |
| `guru-etickets` [só no Supabase] | E-tickets da Guru (presença por evento). Modo varredura: percorre a lista inteira (~44 mil) em voltas, com 10 min de pausa entre voltas. Modo evento (`?product_id=`): lê só o produto do evento, sem estado. | `raw.guru_eticket` | `guru-etickets` (hora cheia, 09-23h) e `guru-modo-evento` (hora cheia, 15h a 22h UTC, só quando há produto de evento ativo) |
| `guru-explorar`, `guru-token-check` [só no Supabase] | Diagnóstico: explorar a API da Guru e checar se o token vale. Não gravam dados de negócio (descrição pelo nome). | nenhum | manual |
| `audit-guru-grazi`, `audit-guru-grazi-range` [só no Supabase] | Auditoria da marcação de vendas da Grazi (Social Selling) contra a Guru (descrição pelo nome). | leitura | manual |
| `black10x-guru` [só no Supabase] | Vendas do Black Friday 10X vindas da Guru. | tabelas do Black 10X | `black10x-guru-hourly` (min 0) |

Rotinas SQL ligadas à Guru (sem Edge Function própria): `guru-atualizacao-pedidos` (a cada 2 min, só enquanto houver atualização de pedido em andamento) e `guru-carga-2026-mensal` (carga mensal de 2026, de hora em hora enquanto houver mês pendente).

## 2. HubSpot

| Sync | O que faz | Grava em | Agendamento |
| --- | --- | --- | --- |
| `rgv-hubspot-sync` [repo] | Perpétuo RGV. Negócios dos pipelines 749390743 (Vendas Principal), 746355509 (Boleto) e 763255146 (RGV Processos), com histórico de etapas. Início autorizado em 08/10/2026. Busca incremental em janelas de 15 min, cursor persistido junto com os registros, lease de 3 min contra execução dupla. Alimenta o funil do Perpétuo (`front_daily`) pela regra de venda RGV. | `rgv.raw_record`, `rgv.deal`, `rgv.stage_event`, `rgv.sync_run` | `rgv-hubspot-auto` (hora cheia) |
| `rgv-sync-check` [repo] | Diagnóstico do sync do RGV (chave `x-rgv-sync-key`). | leitura | manual |
| `hubspot-sync` [só no Supabase] | Contatos que declararam faixa de faturamento e negócios da Turnê Máquina de Vendas e do pipeline 844150329 (Máquina de Vendas); guarda a associação negócio a contato. Incremental por data de modificação, volta 5 min a cada rodada. Nome e telefone não são gravados. | `raw.hubspot_*`, `raw.sync_estado` | `hubspot-sync` (min 25 e 55, 00-02h e 08-23h) |
| `upsell-hubspot-sync` [repo] | Upsell. Vendas ganhas de Clube R1 e Operação Trator desde 01/01/2026 em qualquer funil. Aprende o id de tag para ciclo (`rgv.hubspot_tag_ciclo`; ≥2 ocorrências e ≥90%). Preenche a campanha pelo contato quando o negócio não tem UTM. Venda que deixou de ser ganha vira "Reaberto" (nada é apagado). | `rgv.vendas_clube_trator` | `upsell-hubspot-carga` (min 35) |
| `upsell-aplicacoes-sync` [repo] | Upsell. Aplicações do Clube R1: negócios criados no funil [OFICIAL] Clube R1 (135241872) desde 01/09/2025, com etapa, valor, produto e tag do ciclo. | `rgv.clube_aplicacao` | `upsell-aplicacoes-carga` (min 40) |
| `sync-hubspot-deals`, `sync-hubspot-contacts`, `sync-hubspot-associacoes` [só no Supabase] | Primeira geração do sync do HubSpot, exigem login (JWT). Hoje substituídos por `hubspot-sync` e `rgv-hubspot-sync`; confirmar antes de remover (descrição pelo nome). | | sem cron |
| `rgv-hubspot-property-diagnostic` [só no Supabase] | Diagnóstico de propriedades do HubSpot para mapear campos do RGV. | leitura | manual |
| `upsell-etapas-leitura`, `upsell-sondagem-campanha`, `upsell-sondagem-tags`, `hubspot-sondagem-disparos` [só no Supabase] | Sondagens somente leitura feitas na construção do Upsell (etapas do funil, campanha dos contatos, ids de tag, disparos de ligação, WhatsApp e SMS). Não gravam; podem ser removidas quando o Upsell estiver fechado. | nenhum | manual |

Rotinas SQL do HubSpot: `evento-hubspot-cache` (a cada 30 min, atualiza `marts.refresh_evento_hubspot()`; cerca de 38 min de banco por dia).

## 3. Meta Ads

| Sync | O que faz | Grava em | Agendamento |
| --- | --- | --- | --- |
| `rgv-meta-sync` [repo] | Mídia do Perpétuo RGV nas contas 696363384474339 e 171474008015977, desde 01/01/2026, por anúncio e dia. Trabalha em janelas e só marca a janela como completa depois de conferida (`rgv.meta_complete_window`); o funil só publica dias com as duas contas completas. | `rgv.ad_daily`, `rgv.ad`, `rgv.meta_ad_record` | `rgv-meta-historico-2026` (hora cheia), `rgv-meta-parcial-hoje` (min 4, 7, 10, 13), `rgv-meta-retomar-lote` (cada minuto), `rgv-meta-revisao-semanal-7d` (segunda 08:30) |
| `rgv-meta-metadata-sync` [repo] | Metadados dos anúncios do Perpétuo: criativo, página de destino (URL sem UTM) e status da campanha. | `rgv.ad` e dimensões | junto das rotinas do Meta |
| `meta-ads-sync` [repo] | Máquina de Vendas. Insights por campanha, mês a mês (últimos 2 meses por padrão), ligados ao evento pela cidade e data no nome da campanha. Usa o token do cofre `token_meta_ads`, depois `META_ADS_TOKEN`, depois `META_TOKEN_API`. | `raw.meta_ads_insight` | `meta-ads-diaria` (09:40) |
| `sync-meta-ads` [só no Supabase] | Versão antiga do sync do Meta, exige login. Provável legado (descrição pelo nome). | | sem cron |
| `black10x-meta` [só no Supabase] | Investimento do Black Friday 10X no Meta. | tabelas do Black 10X | `black10x-meta-hourly` (min 5) |
| `integracoes-token` [repo] | Não é carga: troca de token pela tela Integrações e logs. Valida o formato, testa no provedor, só então grava no Vault e roda a carga para confirmar. O token nunca volta nem entra em log. Exige a permissão `gerenciador`. | Vault, log da troca | acionado pelo app |

## 4. Funil e publicação (SQL puro, sem Edge Function)

| Rotina | O que faz | Agendamento |
| --- | --- | --- |
| `rgv.build_front_parcial_if_new()` | Monta o funil parcial de hoje (tempo real) a partir da API; só reconstrói quando há dado novo. | `rgv-front-parcial` (min 1 a 20, toda hora) |
| `rgv.dispatch_front_daily()` | Gera o lote diário do funil (corte = ontem) quando HubSpot e Meta fecharam o corte. Começa em `sync_config` tool `etl`, `start_day` (hoje 01/09/2026). | `rgv-lote-diario` (min 10) |
| `rgv.dispatch_front_publication()` | Publica o lote que estiver esperando, depois de validar HubSpot, Meta e cobertura. | `rgv-publicacao-conjunta` (min 5) |
| `central-ingressos-refresh` | Atualiza `marts.mv_ingresso_transacao` e `marts.mv_guru_vendas` (refresh concurrently) e sincroniza eventos. É a rotina de maior custo de banco (cerca de 108 min por dia). | a cada 15 min |

## 5. Manutenção e outros

| Sync | O que faz | Agendamento |
| --- | --- | --- |
| `rgv-arquivar` [repo] | Move base crua antiga do Postgres para o Storage (bucket `arquivo`) em `.ndjson.gz` conferidos por sha256 e só então remove do banco; registra em `rgv.arquivo_manifesto`. | `rgv-arquivar-mensal` (dia 2, 03:30) |
| `usuarios` [repo] | Gestão de usuários (convidar, criar, editar e-mail, senha, excluir). Exige a permissão `usuarios` (administrador). Não é carga. | acionado pelo app |
| `painel`, `black10x-refresh`, `black10x-trk` [só no Supabase] | Painel público da Visão Geral e Black Friday 10X (atualização e rastreio). Descrição pelo nome. | `black10x-refresh` sob demanda |
| `diag-conexoes` [só no Supabase] | Diagnóstico de conexões das integrações (tela Integrações e logs). | acionado pelo app |


## 6. Gerenciador (tela Sync)

- Lista de sincronizações em **cards** ou em **lista** (escolha lembrada no navegador, chave `r1-sync-visao`).
- Cada atualização tem **Detalhes** e o atalho **Recarregar** (executa só aquela rotina; para corrigir uma falha sem esperar o agendamento). A tabela "Últimas cargas" também tem a coluna Ação.
- Salvar qualquer edição mostra "Salvo com sucesso" e fecha a janela de edição.
- Cargas com status **partial** mostram o motivo, o que falhou e como resolver (`DiagnosticoParcial`).
- O estado do Gerenciador e dos alertas fica no cache do navegador (ver `painel-visao-geral.md`, Desempenho).

## 7. Carga do banco e como as rotinas disputam recurso (19/10/2026)

Diagnóstico por `pg_stat_statements` e `cron.job_run_details`: nenhuma falha, mas várias rotinas pesadas começam nos mesmos minutos (0 e 30), disputando o banco.

| Rotina | Custo aproximado por dia |
| --- | --- |
| `central-ingressos-refresh` | 108 min |
| `evento-hubspot-cache` | 38 min |
| `rgv-hubspot-auto` / `rgv.dispatch_hubspot()` | 31 min (76 s por rodada, de hora em hora) |
| `guru-modo-evento`, `rgv-front-parcial`, `rgv-lote-diario` | médio |
| `rgv-meta-retomar-lote` (cada minuto), `guru-backfill-2026` (3 min), `guru-atualizacao-pedidos` (2 min), `rgv-meta-parcial-hoje` | alta frequência, quase sem trabalho |

Maiores tabelas: `rgv.front_crm_snapshot` 151 MB (492 mil linhas), `rgv.raw_record` 122 MB, `raw.guru_transaction` 101 MB, `rgv.ad_daily` 78 MB. Candidatas a retenção/arquivamento (`rgv-arquivar-mensal` já existe).

### Decisão da Joyce: agrupar por módulo
Em vez de rotinas soltas, **uma atualização por módulo, em fila**, com o mesmo "atualizado até" para todos os indicadores do módulo, e um card por módulo no Sync com as etapas dentro (cada etapa mantém status, Detalhes e Recarregar). A atualização parte da última com sucesso e pula quando não há dado novo; as frequências de 15 e 30 min foram mantidas. Modo evento e Recuperação de carrinho ficam fora do grupo.
- Proposta de módulos: **RGV processos** (rgv-*), **Máquina de Vendas** (Guru, HubSpot contatos e negócios, central de ingressos, cache de eventos, Meta Ads diária), **Perpétuo** (black10x-*). Encaixes ainda a confirmar com a Joyce: Upsell e Meta Ads diária.
- **Status: aprovado, ainda não implementado.** Os agendamentos atuais continuam como na seção 1 a 5 até as filas serem validadas por um ciclo completo.

### Candidatos a remoção (a confirmar antes)
`guru-backfill-2026` quando o histórico terminar; `sync-hubspot-*`, `sync-meta-ads`, sondagens do Upsell, `audit-guru-grazi*`, `guru-explorar`, `guru-token-check`.

## Pendências deste levantamento

- Funções **[só no Supabase]** não têm código no repositório; versionar as que ficam (guru-sync, guru-etickets, hubspot-sync, black10x-*, painel).
- Confirmar e remover legados: `sync-hubspot-*`, `sync-meta-ads`, sondagens do Upsell, `audit-guru-grazi*`.
- O funil só tem dados de 01/09/2026 em diante porque a carga histórica do Meta ainda não completou 01/01 a 31/08. Quando completar, mudar `start_day` do `etl` para 2026-01-01.
