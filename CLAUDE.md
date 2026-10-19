# Central de Indicadores R1

- Toda aba ou tela nova segue `docs/padrao-novas-abas.md` (layout, regras de dados, filtros de período e ciclo, ordenação). Referência: `src/pages/Upsell.tsx`.
- Filtro de período: `docs/padrao-filtro-periodo.md`. Regra de venda RGV: `docs/regra-venda-rgv.md`.
- Valores em reais com 2 decimais. Nunca fazer merge em `main` sem ok da Joyce.
- A Joyce pediu postura crítica: se um pedido não fizer sentido (dado inconsistente, definição ambígua, métrica enganosa), discordar com o motivo e propor alternativa antes de implementar.
