/* Períodos prontos usados nos filtros (Fluxo Marketing RGV e Recuperação de carrinho). Datas em Brasília. */
export function hojeSP() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }
export function addDias(iso: string, n: number) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }

export type Preset = { chave: string; rotulo: string; de: string; ate: string };
export function presets(): Preset[] {
  const hoje = hojeSP(); const ontem = addDias(hoje, -1);
  const mesIni = hoje.slice(0, 8) + '01';
  const mesPassadoFim = addDias(mesIni, -1); const mesPassadoIni = mesPassadoFim.slice(0, 8) + '01';
  return [
    { chave: 'hoje', rotulo: 'Hoje', de: hoje, ate: hoje },
    { chave: 'ontem', rotulo: 'Ontem', de: ontem, ate: ontem },
    { chave: 'todos', rotulo: 'Todo o período', de: '2026-01-01', ate: hoje },
    { chave: 'ano', rotulo: `${hoje.slice(0, 4)} até hoje`, de: `${hoje.slice(0, 4)}-01-01`, ate: hoje },
    { chave: '90', rotulo: 'Últimos 90 dias', de: addDias(ontem, -89), ate: ontem },
    { chave: '60', rotulo: 'Últimos 60 dias', de: addDias(ontem, -59), ate: ontem },
    { chave: '30', rotulo: 'Últimos 30 dias', de: addDias(ontem, -29), ate: ontem },
    { chave: '7', rotulo: 'Últimos 7 dias', de: addDias(ontem, -6), ate: ontem },
    { chave: 'mes', rotulo: 'Este mês', de: mesIni, ate: hoje },
    { chave: 'mes-1', rotulo: 'Mês passado', de: mesPassadoIni, ate: mesPassadoFim },
  ];
}

