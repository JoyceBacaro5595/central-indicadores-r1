# Perpétuo RGV — contrato de backend v2

Destino: Supabase **r1-indicadores**, ref `lgaujmjedphzynhbokob`.
Não executar esta migração no banco Lovable indicado pelo `supabase/config.toml` da raiz.

## Estado entregue

Estrutura `rgv` e RPCs v2 criadas e verificadas no r1-indicadores.
As tabelas novas começam vazias; os dados existentes não foram copiados, substituídos ou certificados.
A migração foi criada com o CLI e aplicada diretamente por SQL; antes de um futuro `db push`,
reconciliar o histórico de migrações com o ambiente. Não reaplicar este arquivo no banco já preparado.
A função `perpetuo_funil` do frontend do Claude permanece intacta.
O worker de ETL e os coletores de APIs ainda precisam ser implementados; nenhum Cron novo foi ativado.

## Fluxo previsto

CSV/API → `import_batch` + `raw_record` → `deal` + `stage_event` →
segmentação e atribuição → `front_daily` → `perpetuo_funil_v2`.

Meta API → `ad` + `ad_daily` + `landing_page` → atribuição → `front_daily`.

| Estrutura | Responsabilidade |
| --- | --- |
| `import_batch`, `raw_record` | Preservar todas as colunas originais, checksum e contagem da carga |
| `deal` | Negócio por ID, pipeline, datas, UTMs, origem, produto e faixas de segmentação |
| `stage_mapping`, `stage_event` | IDs oficiais das etapas e cada entrada/saída, inclusive reentradas |
| `ad`, `ad_daily` | Conta/campanha/conjunto/anúncio/criativo, destino, gasto e métricas diárias |
| `landing_page`, `attribution` | URL canônica e correspondência verificada; ambígua e sem vínculo explícitas |
| `segment_rule` | Regras versionadas; ativar apenas após validar critérios de negócio |
| `sync_config`, `sync_run` | Configurações por ferramenta, períodos, fila, checkpoint, timeout e erro |
| `front_daily` | Resultado diário do ETL nos grãos `total`, `creative` e `lp` |
| `period_reach` | Alcance único obtido do Meta para um intervalo exato; nunca somar alcance diário |

## Consulta do frontend

Usar `r1Rpc('perpetuo_funil_v2', { p_de: '2026-01-01', p_ate: '2026-10-06' })`.
A sessão do usuário e a permissão existente `painel` são obrigatórias.
A função retorna somente agregados, sem nome de pessoa, telefone, e-mail, CPF ou payload bruto.
O intervalo é inclusivo, com máximo de 1096 dias.

Retorno: `versao`, `atualizado_em`, `periodo`, `ciclos`, `fontes`, `resumo`, `diario`,
`por_criativo` e `por_lp`.

Campos de métricas em todos os grãos:

| Grupo | Campos |
| --- | --- |
| Mídia | `investimento`, `impressoes`, `alcance`, `cliques`, `visualizacoes_lp`, `cpm`, `ctr`, `cpc` |
| Leads | `leads_pixel`, `leads_crm`, `mql` |
| Jornada | `contato_efetivo`, `sql`, `reunioes_agendadas`, `reunioes_realizadas`, `noshow`, `vendas`, `faturamento` |
| Custos | `cpl_pixel`, `cpl`, `cpmql`, `custo_reuniao`, `cac`, `roas` |
| Conversões (%) | `conversao_lp`, `taxa_mql`, `taxa_contato`, `taxa_sql`, `taxa_agendamento`, `taxa_comparecimento`, `taxa_fechamento` |
| Qualidade | `cobertura`: dias esperados/carregados e estados de mídia, CRM, histórico e custos |

`por_criativo`: cada registro tem `id`, `criativo` e as métricas.
`por_lp`: cada registro tem `id`, `pagina` e as métricas.
`null` significa não disponível. Zero só representa uma coleta concluída sem atividade.
`atualizado_em` é a atualização real do mart; fica nulo até a primeira carga.

### Adaptação da branch do Claude

- Alterar explicitamente a consulta de `perpetuo_funil` para `perpetuo_funil_v2` quando integrado.
- O cartão “CPL (MQL)” deve consumir `cpmql`. `cpl` é custo por negócio/lead CRM.
- A tabela por criativo usa `leads_crm` para Leads; manter Leads pixel separados.
- A tabela por LP usa `visualizacoes_lp` e `conversao_lp`.
- Não mapear `utm_content` automaticamente como criativo: no CSV ele frequentemente identifica o público/conjunto.
  `utm_term` frequentemente contém o nome do anúncio. Resolver por ID ou combinação inequívoca de conta/campanha/anúncio.
- Não usar taxa geral de MQL para estimar MQL de um anúncio.
- O formato v2 exige ajuste de tipos; não basta trocar o nome da RPC.
- Os ciclos vêm de `marts.dim_ciclo`, mas as datas ainda precisam de validação contra o planejamento oficial.

## API de ingestão preparada

`POST /rest/v1/rpc/perpetuo_ingest_v2` (somente worker no servidor com `service_role`).
Nunca colocar essa chave no navegador, GitHub, CSV, prompt ou logs.

Corpo:

```json
{
  "p_resource": "stage_event",
  "p_rows": [{
    "deal_id": "ID_REAL",
    "pipeline_id": "PIPELINE_REAL",
    "stage_id": "ETAPA_REAL",
    "entered_at": "2026-10-07T17:00:00Z",
    "source": "hubspot"
  }]
}
```

Recursos: `deal`, `stage_event`, `ad`, `ad_daily`, `landing_page`, `attribution`, `front_daily`, `period_reach`.
Máximo 500 registros; cada lote é atômico e retorna a quantidade gravada.
Reenvio faz upsert pela chave primária. Enviar registros completos: não é uma API de PATCH parcial.
O worker deve rejeitar snapshots mais antigos que o `source_modified_at` já salvo antes do upsert.
Escrita de lotes, dados brutos e estado operacional pode usar a conexão Postgres do servidor.
As tabelas `rgv` não são liberadas ao browser nem adicionadas aos schemas expostos do REST.

## Regras obrigatórias para os futuros coletores/ETL

1. CSV: 28.320 IDs únicos esperados; 28.080 no pipeline principal e 240 em boletos.
   Preservar as 46 colunas no payload; reconciliar por ID, sem substituir dados de API mais recentes.
   Interpretar datas sem fuso como America/Sao_Paulo apenas após confirmar o fuso da exportação.
2. HubSpot: buscar `propertiesWithHistory=dealstage` e histórico de `pipeline`; carregar IDs oficiais.
   A data da fase atual do CSV não comprova etapas anteriores.
   `(deal_id,stage_id,entered_at)` preserva reentradas. Usar a próxima transição como saída somente quando conhecida.
3. Incremental HubSpot: buscar última modificação, incluindo negócios antigos alterados.
   Só avançar watermark após lote completo; checkpoint permite retomar sem perder páginas.
4. Meta: selecionar campanha Perpétuo verificada por ID, não a conta inteira nem só a tag `[FF]`.
   Upsert por conta/anúncio/dia; salvar configuração de atribuição do Meta.
   Destinos dinâmicos ou vários destinos ficam ambíguos até conseguir separar gasto/visitas corretamente.
5. Segmentar mantendo faixa original. Não transformar “100 a 500 mil” em uma faixa mais estreita;
   casos que atravessam um limite ficam ambíguos. MQL pendente permanece nulo.
6. Jornada conta negócios distintos que efetivamente alcançaram cada etapa, inclusive se terminaram perdidos.
   Reentrada não duplica o negócio no mesmo indicador. Não presumir que um negócio passou por etapas que pulou.
7. Definir no ETL as datas de cada métrica: leads por criação, etapas por entrada, vendas por data real de venda.
   ROAS de período é indicador operacional; não afirmar atribuição causal ou ROAS de safra sem construir esse modelo.
8. Materializar dias concluídos com zeros conhecidos; dias sem coleta ficam incompletos.
   `media_complete`, `crm_complete`, `history_complete`, `attribution_complete` são certificações do worker,
   não podem ser marcadas só porque a requisição retornou HTTP 200.
9. Calcular TOTAL diretamente das fontes verificadas; não somar criativos/LPs para achar o total.
   Contagem de sem atribuição deve ser auditada antes de certificar os custos do total.
10. Não dividir orçamento por visitas nem repetir o mesmo gasto em várias LPs.
11. `sync_config` inicia desativado. Para Meta: janela móvel inicial de 7 dias, 05h São Paulo;
    configurar o agendador real e conectar ao gerenciador existente somente após validar o worker.
    Timeout, erro de API, erro de processamento e resultado parcial são estados distintos.
    Logs não devem guardar tokens, dados pessoais ou respostas completas das APIs.

## Verificação

`supabase-r1/tests/perpetuo_contract.sql`: transação com rollback verifica dados ausentes,
períodos parciais, razões completas, alcance não estimado, reentradas/idempotência e privilégios.
Não grava dados de exemplo na produção. Ainda faltam testes ponta a ponta com CSV e APIs reais.
