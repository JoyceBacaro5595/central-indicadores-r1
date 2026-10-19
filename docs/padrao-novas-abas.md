# Padrão para toda aba nova (regra da Joyce, 19/10/2026)

Sempre que uma aba ou tela nova for criada, ela nasce com as regras e os filtros abaixo. Refinamos com a Joyce depois. Referência pronta: `src/pages/Upsell.tsx`.

## Layout
- `PageHeader` com título, subtítulo e `acoes` no canto superior direito: **Última atualização** (data e hora de Brasília da última carga) e o filtro de período. A última atualização nunca vai dentro de card.
- Abas em `toggle-group` / `toggle-item` (iguais às do Perpétuo); no celular o período repete abaixo das abas.
- Bloco de título: `eyebrow`, `h2` e, à direita, o número principal do período (ex.: faturamento).
- Cartões `surface`, tabelas com títulos em caixa alta pequena, gráficos recharts com a quantidade no topo da barra.

## Regras de dados
- Valores em reais sempre com 2 decimais ("R$ 77.505,00"). Valor calculável é número; `-` só para dado que sumiu.
- Cada produto aparece só na sua aba (Clube R1 só em Clube, Trator só em Trator).
- Onde houver nome de negócio, mostrar o ID do HubSpot com link que abre o negócio (`https://app.hubspot.com/contacts/23586399/record/0-3/{id}`).
- Quem cria algo na tela precisa de editar, desativar e excluir conforme o nível de acesso.
- Dados carregados automaticamente do HubSpot (cron de hora em hora) sempre que a fonte for o HubSpot.

## Filtros pré-prontos
1. **Período** padrão (`PeriodoPadrao` / `usePeriodoPadrao`, ver `padrao-filtro-periodo.md`).
2. **Ciclo** (RGV 38, 39...), com "Todos os ciclos".
3. **Ordenação** crescente e decrescente clicando no título de qualquer coluna (`Th`, `useOrdem`, `ordena` em `Upsell.tsx`).

## Filtros sugeridos (a refinar)
- Origem do negócio e campanha (UTM), com "Sem origem" / "Sem campanha" visíveis.
- Situação/etapa (ganho, negociação, aprovação, perdida, cancelada).
- Faixa de valor e busca por ID do negócio.
- Comparação com o período anterior (variação em % nos cartões).
- Exportar a tabela filtrada em CSV.
