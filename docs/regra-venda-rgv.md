# Regra oficial de venda RGV

Confirmada pela Joyce em 16/10/2026. É a base de cálculo oficial para ganho/venda de RGV em qualquer módulo (painel, Perpétuo, Turnê, Black Friday, Fluxo, relatórios).

- Só negócio de produto RGV (`rgv.crm_funnel_deal_v1.product_rgv`; exclui "processos").
- Pipeline Principal (`749390743`): etapas Ganho (`1089131937`), Dinheiro Em Casa (`1121488310`) e a etapa final "finalizando" (`1089132034`).
- Pipeline Boleto (`763255146`): Ganho (`1111643947`) e as etapas finais `1166508330` e `1111643946`.
- Pipeline `746355509` (Ganho `1086562155`) entra na view atual, só para negócio com produto RGV.
- Implementação: colunas `sale_at` e `revenue` de `rgv.crm_funnel_deal_v1`. Toda tela deve usar essas colunas, sem recontar por etapa.
- Origem e atribuição (Turnê por cidade, Black Friday, ciclo) ainda a confirmar; a regra de ganho acima vale em todas.
