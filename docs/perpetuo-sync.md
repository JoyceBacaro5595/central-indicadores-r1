# Atualização automática — Perpétuo RGV

## Produção

Projeto Supabase: r1-indicadores (`lgaujmjedphzynhbokob`).
Início autorizado: 08/10/2026 00:00 America/Sao_Paulo (03:00 UTC).
Cron `rgv-hubspot-auto` ativo, com guarda de data no SQL e na Edge Function.

Pipelines: `749390743` Vendas Principal (RGV), `746355509` Pipeline de Vendas (Boleto).
Sem filtro por etapa ou produto. Negócios já conhecidos continuam sendo acompanhados se mudarem de pipeline.
Busca incremental considera negócios criados desde 01/01/2026; a carga histórica está restrita à base recebida.

A primeira fase busca os IDs históricos em lotes de 100, com `propertiesWithHistory` de dealstage e pipeline.
Durante essa fase, o Cron verifica a cada cinco minutos: alterna recuperação de histórico e busca incremental, para que um erro no histórico não interrompa a entrada de novos dados.
Depois do bootstrap, a busca incremental roda a cada 30 minutos.
Janelas de 15 minutos, paginação por `after` e subdivisão se atingir 10 mil resultados; nunca pular resultados com o mesmo timestamp.
Sobreposição de cinco minutos e margem de indexação. A primeira janela volta um dia em relação ao CSV para cobrir a transição e o fuso ainda não confirmado do export.

Cursor é persistido na mesma transação que os registros. Lease de três minutos evita duas execuções concorrentes.
Orçamento de 90 segundos ajustável em `rgv.sync_config.timeout_ms` (respeita o orçamento do worker).
Execução parcial retoma do checkpoint. Lotes incompletos da API não avançam o cursor: ficam registrados como erro para diagnóstico.
Atualizações mais antigas que um snapshot verificado da API não o substituem. Datas do CSV eram inferidas: API tem precedência.
Script de normalização do CSV também preserva snapshots já verificados da API.

## Segurança

Edge Functions `rgv-hubspot-sync` e `rgv-sync-check` exigem o header interno x-rgv-sync-key.
Chave aleatória armazenada em Vault como rgv_sync_key; nunca inserida no código ou entregue ao navegador.
O Cron usa rgv.dispatch_hubspot com HTTP direto, privado, sem guardar credenciais na fila pg_net. A chave de diagnóstico foi rotacionada após a verificação.
As tabelas internas pg_net são gerenciadas por supabase_admin; a tentativa de revogar suas permissões via postgres não alterou os grants. Não assumir que tabelas de extensões tenham os mesmos controles das tabelas RGV. A rotina nova não usa essa fila.
verify_jwt=false é intencional porque a autenticação interna é feita por chave, verificável antes de consultas de negócio.
Tokens dos provedores continuam nos Secrets das Edge Functions, sem migração nem exposição.
Vault não pode ser lido diretamente por anon ou authenticated. O painel usa a sessão da plataforma; nenhum segundo login no gerenciador.

## Verificação realizada

- HubSpot: pipelines, propriedades e um negócio consultados com sucesso; histórico de etapas disponível.
- Produto, data de venda, origem, UTMs, faturamento e funcionários encontrados no catálogo por correspondência única.
- Chamada sem chave: HTTP 403.
- Chamada autenticada antes do início: scheduled, sem lotes HubSpot e sem alterar os 28.320 negócios.
- Testes de contrato SQL em transação revertida: RLS, privilégios, valores ausentes, custos, reentradas e idempotência.
- Sintaxe TypeScript validada; Edge Function publicada.

Os logs ficam em rgv.sync_run; cursor, início e frequência em rgv.sync_config. Não registrar respostas do provedor com dados pessoais ou tokens em erros.

## Meta e ETL

Preflight do Meta retornou HTTP 401, código OAuth 190. META_ADS_TOKEN precisa ser substituído.
Coletor RGV Meta não foi ativado; configuração continua disabled e erro foi registrado.
A mídia da campanha Perpétuo deverá reler sete dias; confirmar o ID da campanha com token válido.

Esta rotina atualiza raw_record, deal, stage_mapping e stage_event.
Não preenche front_daily: ainda são necessárias as regras de segmentação, atribuição, funil e recorte do Perpétuo.
Não estimar etapas anteriores pela etapa atual; não transformar data de fechamento em data de venda.

## Organização do frontend

Fluxo de Tráfego dentro de Perpétuo RGV: Campanhas, Peças criativas e Páginas.
Branch feat/fluxo-trafego revisada sem merge. A RPC atual cobre total/criativo/LP; campanhas e metas ainda precisam de extensão de contrato.
Design systems independentes: RGV, Máquina de Vendas, RGV Processos, Clube R1, Black Friday, Grupo R1.
Componentes podem ser compartilhados, mas temas e tokens visuais devem ser delimitados por produto.
