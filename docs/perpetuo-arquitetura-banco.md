# Perpétuo RGV — documentação da arquitetura do banco

**Projeto:** R1 Indicadores  
**Banco:** PostgreSQL no Supabase, projeto `r1-indicadores`  
**Schema principal:** `rgv`  
**Revisão:** 09/10/2026, às 14:39, horário de Brasília  
**Escopo:** HubSpot, Meta e indicadores do Perpétuo. Não abrange Guru, check-ins ou Black10x.

## 1. Objetivo

O banco integra os negócios do HubSpot com as métricas do Meta para acompanhar aquisição, evolução comercial e vendas. Ele sustenta as visões por campanha, peça criativa e página de destino da Central.

A arquitetura separa os dados recebidos, o estado atual das entidades, o histórico comercial e os indicadores publicados. Essa separação permite conferir a origem de um resultado, reprocessar cálculos e manter a última publicação disponível durante a preparação de uma atualização.

O banco é relacional, com payloads e estruturas JSON em pontos específicos. É uma arquitetura orientada ao caso de uso do Perpétuo, com tabelas operacionais e uma camada analítica publicada. Não se deve apresentá-la como um data warehouse corporativo completo ou como armazenamento imutável de todas as versões das fontes.

## 2. Organização das camadas

| Camada | Estruturas principais | Responsabilidade |
|---|---|---|
| Recebimento | `raw_record`, `meta_ad_record` | Registrar conteúdo recebido das APIs ou importações. |
| CRM atual | `deal` | Manter o estado atual de cada negócio. |
| Histórico comercial | `stage_event`, `property_event` | Preservar movimentações de etapas e propriedades recebidas. |
| Mídia | `ad`, `ad_daily`, `landing_page` | Organizar anúncios, métricas por dia e destinos. |
| Atribuição | `attribution` e funções SQL de resolução | Relacionar negócios com campanhas, anúncios, peças e páginas. |
| Publicação | `front_batch`, `front_crm_snapshot`, `front_pending`, `front_daily` | Preparar, validar e publicar uma versão dos indicadores. |
| Operação | `sync_config`, `sync_run`, `meta_complete_window` | Controlar execução, retomada, logs e cobertura das cargas. |
| Importação | `import_batch`, `arquivo_manifesto` | Identificar cargas manuais e seus arquivos. |
| Regras e planejamento | `segment_rule`, `stage_mapping`, `plano_ciclo` | Estruturas de regras, referências das etapas e planejamento de ciclos. |

As camadas estão dentro do mesmo schema `rgv`; não correspondem a bancos separados. A interface chama funções no schema `public`, como `public.perpetuo_funil_v2`, que consultam essa estrutura.

## 3. Fluxo de processamento

1. A importação manual ou a API fornece registros do HubSpot. A API do Meta fornece anúncios e métricas.
2. O processamento registra os dados recebidos e atualiza as entidades tratadas.
3. O estado atual dos negócios é mantido em `deal`. As movimentações recebidas são registradas nas tabelas de histórico.
4. Funções SQL aplicam as regras do funil e resolvem a atribuição entre CRM e mídia.
5. O ETL prepara um lote, verifica cobertura e consistência e publica os indicadores.
6. A Central consulta a função `public.perpetuo_funil_v2` para obter os resultados do período escolhido.

O código da aplicação e as alterações SQL ficam no GitHub. A Vercel hospeda a interface; os dados e as rotinas do banco permanecem no Supabase.

## 4. Identificação dos registros e prevenção de duplicidade

As chaves abaixo foram conferidas nas restrições do banco. Elas definem a granularidade de cada registro.

| Tabela | Chave primária | O que representa uma linha |
|---|---|---|
| `deal` | `deal_id` | Um negócio do HubSpot. |
| `raw_record` | `batch_id`, `record_id` | Um registro dentro de uma carga de importação. |
| `stage_event` | `deal_id`, `stage_id`, `entered_at` | A entrada de um negócio em uma etapa, em determinado momento. |
| `property_event` | `deal_id`, `property_name`, `occurred_at`, `value` | Uma evidência de alteração de propriedade. |
| `ad` | `account_id`, `ad_id` | Um anúncio dentro de uma conta Meta. |
| `ad_daily` | `account_id`, `ad_id`, `day` | As métricas de um anúncio em um dia. |
| `front_crm_snapshot` | `batch_id`, `deal_id` | Um negócio dentro da fotografia de um lote. |
| `front_daily` | `grain`, `entity_id`, `day` | Um indicador diário em determinada granularidade e entidade. |
| `sync_config` | `tool` | A configuração de uma ferramenta de atualização. |

As chaves evitam linhas duplicadas com o mesmo identificador. Elas não garantem que uma pessoa tenha apenas um negócio: dois negócios diferentes do HubSpot continuam sendo duas entidades legítimas. Deduplicação de pessoas é uma regra diferente de deduplicação de negócios.

Há relacionamentos físicos, como `ad_daily → ad`, `ad → landing_page`, `stage_event → deal` e `front_crm_snapshot → front_batch`. Nem todo relacionamento lógico do processamento é implementado como chave estrangeira.

## 5. Base manual e incremental do HubSpot

A base manual estabelece uma carga inicial. O incremental continua alimentando a mesma estrutura, usando o identificador do negócio para atualizar o registro existente.

O sincronizador utiliza um **watermark**, que representa até onde a coleta avançou, e um **checkpoint**, que guarda o ponto de retomada de um processamento parcial. Essas informações ficam em `sync_config`.

O código revisado utiliza uma sobreposição de cinco minutos no incremental para reduzir o risco de perder alterações próximas ao limite da consulta. A gravação dos registros e o avanço do ponto de retomada são coordenados pelo processamento. Uma execução parcial não deve ser interpretada como conclusão de toda a janela.

`deal` guarda a etapa atual, as datas, o produto, as UTMs e os campos empresariais tratados. Quando um negócio avança, seu estado atual é atualizado. `stage_event` e `property_event` preservam as evidências históricas recebidas.

**Limite da garantia:** preservar o histórico recebido não significa garantir que toda alteração ocorrida na fonte, de qualquer época e propriedade, tenha sido capturada. Essa cobertura depende dos campos e históricos solicitados à API.

## 6. Atualização e releitura do Meta

As métricas do Meta podem ser corrigidas após a primeira coleta. Por isso, o processamento relê uma janela de dias encerrados e atualiza os registros correspondentes em vez de somar novamente os valores.

A granularidade de `ad_daily` é conta + anúncio + dia. Uma releitura do mesmo anúncio no mesmo dia atualiza essa combinação; não cria uma segunda linha com a mesma chave.

A janela horária passou a utilizar `sync_config.rolling_days`. O gerenciador permite configurar a quantidade de dias de releitura do Meta. Existe também uma rotina semanal de revisão dos últimos sete dias.

`meta_complete_window` registra a cobertura concluída. Cobertura de coleta e qualidade de atribuição são verificações diferentes: coletar todas as métricas não garante que todos os negócios estejam associados a anúncios.

## 7. Segmentação e regras do funil

A segmentação acontece por consultas e funções SQL. Não existe uma tabela separada para cada segmento empresarial, campanha ou etapa do funil.

O escopo atual das funções considera os pipelines configurados e campanhas identificadas com `[FF]`. A seleção de vendas também aplica critérios de produto RGV e estágio comercial. Esses critérios são específicos da implementação atual e precisam permanecer documentados e versionados.

O lote mais recente verificado utiliza a versão **`crm-v18-etapa-alcancada`**. Ela considera a chegada à etapa ou a uma etapa posterior na ordem comercial definida:

| Indicador | Referência da regra atual |
|---|---|
| MQL | Entrada em MQL ou em etapa posterior reconhecida. |
| Contato efetivo | Em Qualificação ou posterior; há evidências específicas por motivo de perda. |
| SQL | Em Agendamento ou posterior; há uma evidência específica por motivo de perda. |
| Agendamento | Diagnóstico Agendado ou posterior. |
| Realização | Diagnóstico Realizado ou posterior. |
| No-show | Evidência da etapa NoShow. |
| Venda | Critérios específicos de produto, pipeline, estágio atual elegível e evidência histórica. Não basta qualquer passagem histórica por Ganho. |

As funções também tratam motivos específicos: “Fora do ICP (Ideal Customer Persona)” como evidência de contato e “Comprou da concorrência” como evidência de contato/SQL. São regras de negócio existentes, que devem ser validadas com os responsáveis comerciais.

As contagens do período deduplicam o negócio por indicador. Um negócio pode contribuir para várias etapas alcançadas. Portanto, o funil não representa apenas a quantidade de negócios atualmente estacionados em cada etapa.

As datas também importam: a implementação ancora MQL na data de criação quando existe evidência de qualificação; as demais etapas usam evidências de movimentação. Comparações de taxas precisam respeitar essas diferenças e distinguir fluxo no período de conversão de uma mesma coorte.

**Situação das regras:** `segment_rule` está vazia. A lógica executada está nas funções SQL, e não em um cadastro editável de regras. `stage_mapping` contém referências de etapas, mas seu preenchimento não deve ser confundido com validação integral do funil.

## 8. Atribuição entre CRM e mídia

A atribuição utiliza UTMs e referências de campanhas e anúncios. A resolução procura identificar a campanha e, quando há evidência suficiente, a peça criativa e a página relacionadas ao negócio.

É necessário distinguir identificadores de anúncio, identificadores de criativo e agrupamentos de peças: uma peça pode reunir anúncios diferentes. O total do CRM e o total atribuído a peças podem divergir por ausência ou ambiguidade de origem.

Um registro sem origem identificada não deve ser artificialmente associado a um anúncio. A cobertura da atribuição deve ser acompanhada separadamente dos totais comerciais.

## 9. Validação e publicação dos indicadores

`front_batch` registra o período, a versão das regras, o status e o horário da publicação. `front_crm_snapshot` armazena a fotografia do funil daquele lote; `front_pending` prepara os indicadores; `front_daily` contém a publicação diária.

A publicação verifica condições como histórico comercial, avanço da coleta HubSpot, cobertura Meta das contas exigidas e integridade dos indicadores diários. Se a preparação falhar, a última publicação permanece disponível.

A rotina corrigida reconstrói o lote publicado do mesmo intervalo, reaproveitando seu identificador. Isso evita criar uma fotografia adicional a cada hora. A atualização é transacional: as alterações ficam visíveis em conjunto após a conclusão.

**Consequência:** o lote reutilizado não guarda todas as versões horárias anteriores. Preservar uma trilha de cada resultado publicado exigiria uma política própria de versionamento ou arquivamento.

O corte continua sendo o último dia encerrado. Um filtro “Hoje” na interface não comprova que exista uma publicação com dados do dia corrente; essa disponibilidade depende da implementação de um corte parcial.

## 10. Cron, logs e atualização da interface

| Etapa | Configuração atual |
|---|---|
| Coleta HubSpot e Meta | Cron horário no minuto 00. |
| Reconstrução do lote | Cron horário no minuto 10. |
| Retomada de cargas Meta | Rotina de acompanhamento a cada minuto, sujeita ao estado da carga. |
| Consulta da tela | A cada minuto enquanto a página está ativa, preservando os dados durante a consulta. |

Esses horários são configurações atuais, não propriedades fixas da arquitetura. A duração das coletas pode ultrapassar o intervalo entre disparos.

O sucesso de um cron que chama uma função HTTP confirma o disparo, não necessariamente a conclusão da coleta. A conclusão, quantidade processada e motivo de falha devem ser conferidos em `sync_run`.

O botão “Sincronizar novamente” executa a configuração atual da rotina. Ele não significa, por si só, repetir exatamente a janela de uma execução antiga.

## 11. Segurança e acesso

Os dados são servidos ao painel por funções SQL. Essas funções verificam autenticação e permissões definidas na estrutura `identity`, compartilhada pela aplicação. Os controles de RLS e privilégios complementam essa proteção.

Algumas funções utilizam `SECURITY DEFINER`, o que exige revisão cuidadosa das permissões e verificações internas. A existência de RLS ou de uma aba escondida não comprova, isoladamente, que o acesso esteja protegido.

Credenciais das fontes devem permanecer no servidor, e não no código entregue ao navegador. Esta documentação não certifica toda a segurança do projeto: a revisão apontou avisos de privilégios de funções e configurações de autenticação que ainda precisam ser avaliados.

## 12. Validação desta revisão e pendências

Na revisão de 09/10/2026:

- O lote publicado utilizava a regra v18 e corte até 08/10/2026.
- A verificação de `history_complete` não apontou negócios pendentes. Isso é um status do processamento, não uma auditoria externa da completude da fonte.
- Duas execuções da publicação reutilizaram o mesmo identificador do lote, sem aumentar a quantidade de lotes daquele intervalo.
- O limite operacional interno foi ajustado para 6 GiB. É uma proteção configurada no processamento, não a declaração de capacidade contratual do plano.
- As quatro rotinas do Perpétuo foram incluídas no gerenciador.

Ainda precisam evoluir ou ser validados: cadastro versionado de regras, cobertura da atribuição, conciliação dos indicadores com o HubSpot, política de retenção/arquivamento, tratamento de dados do dia corrente e revisão completa dos acessos.

## 13. Forma de apresentar a arquitetura

“O Perpétuo integra HubSpot e Meta em um banco PostgreSQL. Separamos dados recebidos, estado atual, histórico comercial e indicadores publicados. O incremental atualiza as entidades pelo identificador de origem. As regras do funil são calculadas em SQL e os resultados passam por um lote validado antes de chegar ao painel. A estrutura já opera, mas gestão de regras, cobertura e segurança continuam sendo itens de validação e evolução.”

Para demonstrar a lógica, o melhor exemplo é acompanhar um negócio: registro recebido → estado atual → histórico de etapas → regra aplicada → lote publicado → indicador exibido. Isso fornece evidência concreta e evita depender apenas da descrição da arquitetura.
