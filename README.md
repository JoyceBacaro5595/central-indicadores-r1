# Central de Indicadores R1

Painel de indicadores do Grupo R1: vendas de ingressos da Máquina de Vendas (Guru), campanhas e leads.

- `/` painel de campanhas (Supabase do projeto Lovable original)
- `/central` central de vendas de ingressos em tempo real
- `/central/relatorio` relatório automático por cidade, mês, tipo, canal, pagamento e status

Os dados de ingressos vêm do Supabase **r1-indicadores** (funções `central_ingressos` e `relatorio_ingressos`), alimentado pela Guru de hora em hora. O código das funções de ingestão está em `supabase-r1/`.

Stack: React + Vite + Tailwind + recharts. Publicado no Vercel.

```sh
npm install
npm run dev
```
