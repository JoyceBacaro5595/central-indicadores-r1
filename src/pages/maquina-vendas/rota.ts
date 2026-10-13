/* Rota em andamento, copiada da config do app da Lovable (lá é fixa no código).
   Etapa seguinte: mover para tabela editável. As datas daqui só valem quando o evento ainda não tem data cadastrada na Central. */
export const ROTA = {
  nome: 'Rota 45',
  cidades: [
    { cidade: 'Campina Grande', data: '2026-10-06', inicio: '2026-08-15' }, { cidade: 'João Pessoa', data: '2026-10-07', inicio: '2026-08-15' },
    { cidade: 'Palmas', data: '2026-10-08', inicio: '2026-08-15' }, { cidade: 'Vitória da Conquista', data: '2026-10-13', inicio: '2026-09-15' },
    { cidade: 'Brasília', data: '2026-10-14', inicio: '2026-09-15' }, { cidade: 'Manaus', data: '2026-10-26', inicio: '2026-09-15' },
    { cidade: 'Belém', data: '2026-10-27', inicio: '2026-09-15' }, { cidade: 'Sinop', data: '2026-10-28', inicio: '2026-09-15' },
    { cidade: 'Cuiabá', data: '2026-10-29', inicio: '2026-09-25' }, { cidade: 'Ribeirão Preto', data: '2026-10-30', inicio: '2026-09-25' },
  ],
};

/** A base grava as cidades sem acento e com iniciais maiúsculas ("Brasilia", "Vitoria Da Conquista"); aqui compara sem acento e sem caixa. */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const mesmoEvento = (a: { cidade: string; mes_evento: string }, c: { cidade: string; data: string }) =>
  norm(a.cidade) === norm(c.cidade) && a.mes_evento.slice(0, 7) === c.data.slice(0, 7);
