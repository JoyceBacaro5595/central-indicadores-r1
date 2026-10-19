# Painel Visão geral e regras de negócio (atualizado em 16/10/2026)

## Regras de negócio oficiais
- **Venda RGV:** ver `docs/regra-venda-rgv.md` (pipelines Principal e Boleto; Ganho, Dinheiro Em Casa e finalizando). Vale em qualquer módulo.
- **Perpétuo:** vendas RGV, Clube R1 e Trator separadas, mais Total. CAC de cada card = investimento do Perpétuo / vendas do próprio card.
- **CAC:** valor calculável sempre aparece como número (sem venda, divisor mínimo 1). "—" só para dado ausente.
- **Taxas do funil RGV:** percentuais calculados sobre MQL, não sobre a etapa anterior; a meta de cada etapa é a cadeia das metas até ela.
- **Recuperação de carrinho:** pedido entra na fila só depois de 1 h em `waiting_payment`. Situações: pendente, contatado, em atendimento, sem resposta, aguardando retorno, recuperado, descartado (`descartado`), lead descartado (`lead_descartado`) e já comprou (`ja_comprou`).

## Cards do painel
- **Turnê Máquina de Vendas:** ingressos e receita da Rota 45 por cidade; CAC por ingresso.
- **Método RGV:** leads, investido, CPL, MQL, vendas RGV, receita e CAC do ciclo exibido (`perpetuo_funil_v2`). A meta de leads do ciclo ainda não existe no banco (`rgv.plano_ciclo` só guarda metas de conversão), por isso "da meta" aparece como "—".
- **Black Friday 10X:** lê `public.black10x_painel()` (somente consulta, permissão `painel`): ingressos, receita, reembolsos, investido, CAC e ingressos por dia, a partir de `black10x.vw_resumo`, `vw_venda_diaria` e `meta_dia`. O investimento da Meta no banco vai só até 01/10 (carga parada). Inscritos gratuitos não existem no banco.
- Enquanto carregam, os cards mostram esqueleto (estrutura fixa com blocos cinza).

## Desempenho
- Cache das leituras pesadas no navegador (`src/lib/cachePersistido.ts`): guardado por usuário, só devolvido se o mesmo usuário tem a permissão hoje, validade de 6 h pela data de cada dado, limpo ao sair da conta e na sessão expirada.
- Atualização em segundo plano de 5 min no Perpétuo; o dado anterior fica na tela ao trocar filtro.
- Pendente: pré-cálculo no banco das leituras mais lentas (`perpetuo_funil_v2`, `recuperacao_resumo`).

## Permissões
- O recurso `regras` não tem mais tela na central (regras de segmentação ficam só no banco e nesta documentação) e some da matriz de permissões.

## Pendências conhecidas
- Visitas LP e Checkouts do Meta no funil da Turnê (MDV) vêm da RPC `meta_eventos_v2` (`landing_page_view`, `initiate_checkout`, carga `meta-ads-sync` v8) e ficam "—" até a próxima atualização do Meta (cron 09:40 ou botão Atualizar em Integrações).
- Aba Online da Máquina de Vendas lê outro serviço (Lovable) com datas fixas.
- Meta de leads do Ciclo 45 e critério de origem das vendas RGV por Turnê e Black Friday aguardam definição.
