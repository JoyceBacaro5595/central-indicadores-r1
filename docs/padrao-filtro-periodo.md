# Filtro de período padrão (regra da Joyce, 19/10/2026)

Em todas as telas o filtro de período é exatamente o do Perpétuo RGV · Fluxo Marketing RGV: menu com "Personalizado", Hoje, Ontem, "2026 até hoje", Últimos N dias, Este mês e Mês passado e, em "Personalizado", o seletor de datas por dia.

- Componente único: `src/components/FiltroPeriodoPadrao.tsx` (`FiltroPeriodoPadrao`, `PeriodoPadrao` e o estado `usePeriodoPadrao`). Não criar outro formato de filtro de período.
- Telas por mês do evento (Eventos, Check-ins, Máquina de Vendas, Fluxo MDV) usam `usePeriodoPadrao('ano', { eventos: true })`: em "ano" e "todo o período" a consulta vai até 31/12 para incluir os eventos futuros.
- Cards em faixa (Perpétuo e Fluxo MDV): cada card é um container (`.faixa-slot`) e o tamanho do número se ajusta à largura do card pelo número de caracteres (`--n`), sem sobrepor.
