# Planejamento da Máquina de Vendas (rotas, mix de ingressos e ações)

Tela `/planejamento` (`src/pages/Planejamento.tsx`, formulário `src/pages/maquina-vendas/PlanoRotaForm.tsx`, contrato em `plano.ts`). Atualizado em 19/10/2026.

## Plano da rota (`config.plano_rota`)
Uma linha por rota. Metas e premissas: investimento, vendas, cortesias, total de participantes, capacidade, ticket, CAC, CAC qualificado, qualificação, CPM, CTR, connect rate, conversão de página e de checkout, dias de captação e de produção, e `cidades` (jsonb). Gravação por `public.planejamento_salvar(p_rota, p_metas)`, leitura por `planejamento_rotas()` e `planejamento_historico(p_rota)`.

### Formato do ingresso vendido (19/10/2026)
- Colunas `pct_unico`, `pct_duplo`, `pct_triplo` (% das vendas; **soma 100**, validada antes de salvar).
- Cálculos automáticos do funil: média de ingressos por venda = (1·único + 2·duplo + 3·triplo); vendas (pedidos) necessárias = ingressos ÷ média; **cadeiras ocupadas** versus capacidade; CAC por venda = investimento ÷ pedidos.
- Números aceitam vírgula ou ponto decimal (`numero()`); antes disso a receita da cidade aparecia como NaN.
- Pendente: ligar o mix aos dados reais da Guru (dividir as vendas por único/duplo/triplo por pedido) depois de confirmar o campo de quantidade no pedido.

## Ações da rota (`config.plano_rota_acao`)
Pedido da Joyce: quando uma ação não anda conforme o planejado, troca-se por outra **sem apagar o investimento já gerado**; o histórico mostra "no meio do caminho foi trocado disso para isso".

| Coluna | Significado |
| --- | --- |
| `rota`, `nome` | Rota e nome da ação |
| `investimento_planejado`, `inicio`, `fim` | Orçamento e período |
| `status` | `ativa` ou `encerrada` (a ação trocada é encerrada, nunca apagada) |
| `ativo` | liga/desliga sem perder histórico |
| `campanhas text[]` | ids das campanhas Meta ligadas à ação |
| `motivo`, `acao_anterior_id` | motivo da troca e a ação que ela substituiu (corrente de trocas) |
| `criado_*`, `atualizado_*` | autoria |

Funções (`public`, `SECURITY DEFINER`, exigem sessão; execução só para `authenticated`):
- `planejamento_acoes(p_rota)`, `planejamento_campanhas()` (campanhas Meta disponíveis para ligar), `planejamento_acao_salvar(...)`, `planejamento_acao_trocar(p_id_antiga, p_nome, p_investimento, p_campanhas, p_motivo, p_data)`.
- `planejamento_acao_excluir(p_id)` (permissão `gerenciador`; recusa excluir ação que foi trocada) e `planejamento_acao_detalhe(p_id)` (**Detalhamento**: gasto, impressões, cliques, LPV, checkouts, compras e lista de campanhas, somando as campanhas ligadas nos meses que a ação cobre; o Meta chega por campanha e mês em `raw.meta_ads_insight`, usando a última captura por objeto e data).
- **Estado no banco em 19/10/2026:** tabela e as funções `acoes`, `campanhas`, `salvar` e `trocar` aplicadas, com `anon`/`PUBLIC` revogados. `excluir` e `detalhe` estão no arquivo `supabase-r1/migrations/20261019190700_planejamento_acoes.sql` mas **ainda não foram criadas no banco** (o conector expirou ao criar função; reaplicar em pedaços pequenos).
- **Frontend das ações ainda não construído**: lista por rota, criar/editar/desativar/excluir por nível de acesso, fluxo "trocar" com motivo e data, botão Detalhamento com os indicadores de cada ação.
