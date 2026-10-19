# Painel Visão geral e regras de negócio (atualizado em 19/10/2026, noite)

## Regras de negócio oficiais
- **Venda RGV:** ver `docs/regra-venda-rgv.md` (pipelines Principal e Boleto; Ganho, Dinheiro Em Casa e finalizando). Vale em qualquer módulo.
- **Perpétuo:** vendas RGV, Clube R1 e Trator separadas, mais Total. CAC de cada card = investimento do Perpétuo / vendas do próprio card.
- **CAC:** valor calculável sempre aparece como número (sem venda, divisor mínimo 1). "—" só para dado ausente.
- **Taxas do funil RGV:** percentuais calculados sobre MQL, não sobre a etapa anterior; a meta de cada etapa é a cadeia das metas até ela.
- **Recuperação de carrinho:** pedido entra na fila só depois de 1 h em `waiting_payment` (qualquer forma de pagamento expirada ou aguardando; tempo configurável no Gerenciador). Lê `marts.vw_recuperacao_carrinho` (reescrita em 19/10/2026: flags de "já comprou" por e-mail, documento e telefone calculadas em conjunto, de ~10 s para ~0,3 s; resultado idêntico). "Já comprou depois" continua existindo; a Joyce propôs removê-lo e a decisão foi manter, com a revisão diária de fim de dia como garantia. Situações: pendente, contatado, em atendimento, sem resposta, aguardando retorno, recuperado, descartado (`descartado`), lead descartado (`lead_descartado`) e já comprou (`ja_comprou`).

## Cards do painel
- **Turnê Máquina de Vendas:** ingressos e receita da Rota 45 por cidade; CAC por ingresso.
- **Método RGV:** leads, investido, CPL, MQL, vendas RGV, receita e CAC do ciclo exibido (`perpetuo_funil_v2`). A meta de leads do ciclo ainda não existe no banco (`rgv.plano_ciclo` só guarda metas de conversão), por isso "da meta" aparece como "—".
- **Black Friday 10X:** lê `public.black10x_painel()` (somente consulta, permissão `painel`): ingressos, receita, reembolsos, investido, CAC e ingressos por dia, a partir de `black10x.vw_resumo`, `vw_venda_diaria` e `meta_dia`. O investimento da Meta no banco vai só até 01/10 (carga parada). Inscritos gratuitos não existem no banco.
- **Próximos eventos:** painel só na Visão geral (primeira coluna do grid). O Calendário mostra apenas o calendário (decisão da Joyce, 19/10).
- **Tabela da Turnê por praça:** colunas Praça, Data, %, Ocupação, Vend.+cort., Receita, RGV, Clube, Trator, Prazo, cada título sobre a sua coluna. RGV/Clube/Trator vêm de `mdv_vendas_cidade`, que só atribui a praça quando a UTM tem `[80KM][CIDADE][dd/mm]` (cerca de 18 vendas/ano). Atribuição por contato e ingresso (e-mail, CPF/CNPJ, telefone, tabela `rgv.venda_contato`) está em andamento; até lá a tabela mostra menos vendas que o total.
- **Fluxo Marketing MDV, funil:** sem filtro de status/cidade, Vendas RGV/Clube/Trator usam o total do período por data de fechamento (`public.mdv_vendas_periodo`, só leitura). Em 2026 até 19/10: 740 RGV, 106 Clube R1, 33 Trator. Com filtro, valem só as vendas com praça identificada.
- **Black Friday 10X, vendas RGV/Clube/Trator:** hoje repete as vendas do ciclo RGV 45, que não são da Black. Definição pendente: vendas cuja UTM do contato tem `[BLACK26]` (19 RGV, 1 Clube, 0 Trator na checagem de 19/10), aguardando confirmação da Joyce.
- Enquanto carregam, os cards mostram esqueleto (estrutura fixa com blocos cinza).

## Desempenho
- Cache das leituras pesadas no navegador (`src/lib/cachePersistido.ts`, chave `r1-cache-v2`): guardado por usuário, só devolvido se o mesmo usuário tem a permissão hoje, validade de 6 h pela data de cada dado, limpo ao sair da conta e na sessão expirada. O front abre com o último resultado (layout, cards e tabelas) e atualiza por trás. Cobre Perpétuo, Visão geral, Máquina de Vendas, Fluxo MDV, vendas por cidade, metas de ciclo, Planejamento, Check-ins, Gerenciador e alertas, Black 10X e resumo da Recuperação. Listas com dados pessoais (fila da Recuperação etc.) ficam fora de propósito; guardá-las no navegador depende de decisão da Joyce.
- React Query: `staleTime` 60 s, `gcTime` 30 min, dado anterior mantido ao trocar filtro, sem refetch ao focar a janela.
- Atualização em segundo plano de 5 min no Perpétuo; o dado anterior fica na tela ao trocar filtro.
- `recuperacao_resumo` e a fila ficaram rápidos com a view reescrita. Pendente: pré-cálculo de `perpetuo_funil_v2` e otimização de atualizações em segundo plano (ver `syncs.md`, seção 7).
- Toda gravação na interface mostra "Salvo com sucesso" e fecha a janela de edição.

## Planejamento
Ver `planejamento.md` (plano da rota, formato do ingresso, ações e Detalhamento).

## Permissões
- O recurso `regras` não tem mais tela na central (regras de segmentação ficam só no banco e nesta documentação) e some da matriz de permissões.

## Pendências conhecidas
- Valor do Clube R1: R$ 25,5 mi em 106 vendas (~R$ 240 mil cada) parece alto; aguardando confirmação do campo.
- Conversão da página: `rgv.funil_calc` foi alterado em produção (usa `visualizacoes_lp` e `conversao_lp` quando vêm no JSON, senão leads/visualizações); decisão de manter ou reverter pendente.
- Réplica da visão Perpétuo do Lovable: só Visão Perpétuo, Dashboard, Planejamento e Board entram; Gerenciador de Integrações, Raio-X de Criativos e RGV Processos foram removidos do escopo (19/10). Aguarda as planilhas/CSVs históricos.
- Visitas LP e Checkouts do Meta no funil da Turnê (MDV) vêm da RPC `meta_eventos_v2` (`landing_page_view`, `initiate_checkout`, carga `meta-ads-sync` v8) e ficam "—" até a próxima atualização do Meta (cron 09:40 ou botão Atualizar em Integrações).
- Aba Online da Máquina de Vendas lê outro serviço (Lovable) com datas fixas.
- Meta de leads do Ciclo 45 e critério de origem das vendas RGV por Turnê e Black Friday aguardam definição.
