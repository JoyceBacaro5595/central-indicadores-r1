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

/** Cidades já realizadas em 2026 (Rotas anteriores à 45), copiadas do app da Lovable. Alimenta o Histórico de Cidades Realizadas. */
export const HISTORICO: { cidade: string; data: string }[] = [
  { cidade: 'Palmas', data: '2026-01-26' },
  { cidade: 'Brasília', data: '2026-01-27' },
  { cidade: 'Fortaleza', data: '2026-01-28' },
  { cidade: 'Recife', data: '2026-01-29' },
  { cidade: 'Salvador', data: '2026-01-30' },
  { cidade: 'Goiânia', data: '2026-02-09' },
  { cidade: 'Cuiabá', data: '2026-02-10' },
  { cidade: 'Sinop', data: '2026-02-11' },
  { cidade: 'Aracaju', data: '2026-02-12' },
  { cidade: 'João Pessoa', data: '2026-02-13' },
  { cidade: 'Natal', data: '2026-02-14' },
  { cidade: 'Maceió', data: '2026-02-15' },
  { cidade: 'Campo Grande', data: '2026-04-06' },
  { cidade: 'Manaus', data: '2026-05-25' },
  { cidade: 'Belém', data: '2026-05-26' },
  { cidade: 'São Luís', data: '2026-05-27' },
  { cidade: 'Imperatriz', data: '2026-05-28' },
  { cidade: 'Teresina', data: '2026-05-29' },
  { cidade: 'Chapecó', data: '2026-06-01' },
  { cidade: 'Balneário', data: '2026-06-02' },
  { cidade: 'Porto Alegre', data: '2026-06-03' },
  { cidade: 'Caxias do Sul', data: '2026-06-16' },
  { cidade: 'Vitória', data: '2026-06-17' },
  { cidade: 'Uberlândia', data: '2026-06-18' },
  { cidade: 'Belo Horizonte', data: '2026-06-19' },
  { cidade: 'Londrina', data: '2026-07-01' },
  { cidade: 'Maringá', data: '2026-07-02' },
  { cidade: 'Cascavel', data: '2026-07-03' },
  { cidade: 'Belo Horizonte', data: '2026-07-16' },
  { cidade: 'Pouso Alegre', data: '2026-07-27' },
  { cidade: 'Passo Fundo', data: '2026-07-28' },
  { cidade: 'Criciúma', data: '2026-07-29' },
  { cidade: 'Florianópolis', data: '2026-07-30' },
  { cidade: 'Rondonópolis', data: '2026-08-03' },
  { cidade: 'Dourados', data: '2026-08-06' },
  { cidade: 'Caruaru', data: '2026-08-17' },
  { cidade: 'Rio de Janeiro', data: '2026-08-18' },
  { cidade: 'Goiânia', data: '2026-08-19' },
  { cidade: 'Curitiba', data: '2026-08-20' }, { cidade: 'Ponta Grossa', data: '2026-08-21' },
  { cidade: 'Petrolina', data: '2026-09-01' },
  { cidade: 'Salvador', data: '2026-09-02' },
  { cidade: 'Feira de Santana', data: '2026-09-03' },
  { cidade: 'Aracaju', data: '2026-09-08' },
  { cidade: 'Maceió', data: '2026-09-09' },
  { cidade: 'Juiz de Fora', data: '2026-09-11' },
  { cidade: 'Mossoró', data: '2026-09-14' },
  { cidade: 'Natal', data: '2026-09-15' },
  { cidade: 'Fortaleza', data: '2026-09-16' },
];

/** A base grava as cidades sem acento e com iniciais maiúsculas ("Brasilia", "Vitoria Da Conquista"); aqui compara sem acento e sem caixa. */
export const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const mesmoEvento = (a: { cidade: string; mes_evento: string }, c: { cidade: string; data: string }) =>
  norm(a.cidade) === norm(c.cidade) && a.mes_evento.slice(0, 7) === c.data.slice(0, 7);
