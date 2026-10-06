const Bloco = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="surface px-5 py-4">
    <span className="section-label">{titulo}</span>
    <div className="mt-3 text-sm text-foreground/90 leading-relaxed space-y-2">{children}</div>
  </section>
);

const Lista = ({ itens }: { itens: string[] }) => (
  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
    {itens.map((i) => (
      <li key={i}>{i}</li>
    ))}
  </ul>
);

const engrenagens = [
  'Mentalidade de Empresário',
  'Dono x Empresário',
  'O Grande Segredo 3G',
  'Gestão é Tudo!',
  'Tributário',
  'Marketing é Tudo!',
  'É Proibido Perder Venda!',
];

const dualidades = [
  ['Empresa preparada', 'Empresa reativa'],
  ['Oportunidade', 'Medo'],
  ['Crescer', 'Apenas sobreviver'],
  ['Caixa forte', 'Caixa pressionado'],
  ['Margem protegida', 'Margem corroída'],
  ['No controle', 'Apagando incêndios'],
  ['Máquina de Vendas', 'Engrenagens desconectadas'],
];



export default function ResumoProjeto() {
  return (
    <div className="space-y-4">
      <Bloco titulo="Termo de Abertura · Resumo do Projeto">
        <p>
          Realizar a venda de ingressos para o evento online <strong>SOS: O FIM DAS EMPRESAS</strong>, com estratégia
          de lançamento pago direcionada a empresários de PMEs brasileiras.
        </p>
        <p>
          O evento será realizado nos dias <strong>21 e 22 de setembro</strong>, ao vivo no YouTube, com ingresso de
          entrada a <strong>R$ 67</strong> no primeiro lote.
        </p>
        <p>
          O objetivo é atrair empresários qualificados para uma experiência paga de alto valor percebido, aumentar o
          comparecimento ao evento e, posteriormente, identificar empresários com perfil para avançar no relacionamento
          comercial com o Grupo R1, com prioridade para o “De Frente Com Ricardo”.
        </p>
      </Bloco>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bloco titulo="Ideia Central">
          <p className="font-semibold">SOS: O FIM DAS EMPRESAS</p>
          <p>Enquanto algumas empresas se protegem da crise, outras crescem ocupando o espaço que ela abre.</p>
          <p>
            O cenário econômico e político muda. Empresas preparadas continuam vendendo, gerando caixa e encontrando
            oportunidades porque possuem uma estrutura capaz de atravessar momentos adversos.
          </p>
        </Bloco>

        <Bloco titulo="Narrativa">
          <p>
            Crises econômicas, juros altos, mudanças tributárias, transformação no comportamento do consumidor e pressão
            sobre margens não são acontecimentos inéditos.
          </p>
          <p>
            Ricardo Nunes atravessou diferentes cenários ao longo de mais de 40 anos empreendendo e construiu uma
            operação que chegou a mais de 1.100 lojas espalhadas pelo Brasil.
          </p>
          <p>
            A tese do SOS não é ensinar o empresário a sobreviver a uma empresa quebrada. É mostrar ao empresário que já
            construiu uma empresa saudável como preparar sua operação para continuar forte quando o cenário muda — e
            enxergar as oportunidades deixadas por empresas menos preparadas.
          </p>
        </Bloco>
      </div>

      <Bloco titulo="Promessa Principal">
        <p>
          Conheça as 7 engrenagens que Ricardo Nunes usou para construir uma Máquina de Vendas e atravessar diferentes
          crises. Prepare sua empresa para continuar forte e crescer mesmo em um cenário econômico e político adverso.
        </p>
        <p className="text-xs uppercase tracking-wide text-muted-foreground pt-2">
          Promessas secundárias para teste A/B/C
        </p>
        <Lista
          itens={[
            'Enquanto empresas recuam na crise, outras ocupam o espaço que elas deixam. Descubra como preparar sua empresa para estar entre as que crescem quando o cenário econômico e político joga contra.',
            'As 7 engrenagens por trás da operação que Ricardo Nunes levou a mais de 1.100 lojas. Aplique o que ele aprendeu atravessando diferentes crises para continuar crescendo quando o cenário joga contra.',
          ]}
        />
      </Bloco>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bloco titulo="Público-Alvo">
          <Lista
            itens={[
              'Já possuem uma empresa estabelecida e em operação',
              'Têm funcionários e estrutura real para administrar',
              'Prioritariamente acima de R$ 1-5 milhões de faturamento anual',
              'Possuem capacidade financeira e operacional para agir',
              'Estão crescendo, mas percebem pressão sobre margem, caixa, vendas ou operação',
              'Querem se antecipar ao cenário econômico em vez de esperar a crise chegar',
              'Valorizam experiência empresarial prática, execução e resultado',
            ]}
          />
          <p className="text-xs text-muted-foreground pt-2">
            <strong>Não é público prioritário:</strong> empresa em situação terminal, empresário buscando renegociação
            como “bote salva-vidas”, quem ainda está começando ou quem procura motivação/fórmula rápida.
          </p>
        </Bloco>

        <Bloco titulo="Persona">
          <p>
            Empresário entre 35 e 55 anos, fundador, segunda geração ou principal decisor de uma PME já consolidada.
            Construiu sua empresa trabalhando, contratou equipe, paga folha, impostos e fornecedores.
          </p>
          <p>
            Sua empresa não está quebrada — existe operação, venda e potencial de crescimento. Mas ele percebe que o
            jogo ficou mais difícil: crédito custa mais, margens são disputadas, o consumidor mudou, concorrentes
            pressionam preço e decisões erradas ficaram mais caras.
          </p>
          <p className="italic">
            “Como preparo o que construí para continuar crescendo, independentemente do que acontecer no país?”
          </p>
        </Bloco>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bloco titulo="Vilão e Lutas">
          <p>
            <strong>Vilão:</strong> o despreparo empresarial diante de um cenário que mudou. O verdadeiro inimigo é
            administrar uma empresa nova com decisões e estruturas do cenário antigo.
          </p>
          <p>
            <strong>Objetivo do vilão:</strong> fazer o empresário reagir ao cenário em vez de se antecipar —
            comprimindo margem, enfraquecendo caixa e transformando decisões estratégicas em decisões de sobrevivência.
          </p>
          <Lista
            itens={[
              'Crédito mais caro',
              'Margem pressionada',
              'Mudanças tributárias',
              'Consumidor mais exigente',
              'Concorrência por preço',
              'Caixa sob maior pressão',
              'Crescimento sem estrutura',
              'Decisões operacionais cada vez mais caras',
              'Medo de investir enquanto o mercado muda',
            ]}
          />
        </Bloco>

        <Bloco titulo="As 7 Engrenagens">
          <p className="text-xs text-muted-foreground">
            Propósito do herói: preparar empresários saudáveis para atravessar cenários adversos sem administrar pelo
            medo — e enxergar oportunidades enquanto outros recuam.
          </p>
          <ol className="space-y-1 pt-1">
            {engrenagens.map((e, i) => (
              <li key={e} className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                {e}
              </li>
            ))}
          </ol>
        </Bloco>
      </div>

      <Bloco titulo="Dualidades">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {dualidades.map(([a, b]) => (
            <div key={a} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
              <span className="font-semibold text-foreground">{a}</span>
              <span className="text-muted-foreground">×</span>
              <span className="text-muted-foreground text-right">{b}</span>
            </div>
          ))}
        </div>
      </Bloco>

      <Bloco titulo="Visão de Futuro">
        <p>
          Empresas brasileiras fortes, estruturadas e preparadas para crescer independentemente do cenário econômico e
          político. Um mercado em que o empresário não apenas resiste às crises, mas está preparado para ocupar os
          espaços e oportunidades que elas inevitavelmente criam.
        </p>
      </Bloco>

      <Bloco titulo="Manifesto Central">
        <div className="text-sm leading-relaxed space-y-3 text-muted-foreground max-h-[420px] overflow-y-auto pr-2">
          <p className="text-foreground font-semibold">MANIFESTO — SOS: O FIM DAS EMPRESAS</p>
          <p>[Tic tac | tic tac | tic tac]</p>
          <p>
            Enquanto você assiste esse vídeo, o mercado está mudando. O crédito ficou mais caro. A margem ficou mais
            disputada. O consumidor mudou. As regras mudaram. E decisões que antes custavam pouco agora podem custar
            milhões.
          </p>
          <p>
            Empresas grandes estão enfrentando dificuldades. Empresas menores estão sentindo a pressão. E diante desse
            cenário, é fácil chegar à conclusão de que a única coisa a fazer é se proteger. Cortar. Esperar. Recuar.
          </p>
          <p>
            Mas existe uma verdade que mais de 40 anos empreendendo me ensinaram: crise não é novidade. Eu já vi o
            Brasil mudar de moeda. Já vi juros subirem. Crédito desaparecer. Consumo despencar. Governos mudarem.
            Concorrentes surgirem. Tecnologias transformarem mercados inteiros.
          </p>
          <p>
            E uma coisa sempre aconteceu: algumas empresas desapareceram. Outras saíram maiores do outro lado. Não
            porque tiveram sorte, nem porque previram o futuro. Mas porque estavam preparadas para tomar decisões
            enquanto os outros estavam paralisados.
          </p>
          <p>
            Quando uma empresa recua, alguma coisa fica para trás. Clientes. Pontos comerciais. Profissionais.
            Fornecedores. Participação de mercado. Oportunidades. O mercado não desaparece — o mercado muda de mãos.
          </p>
          <p>
            Mas existe uma condição: sua empresa precisa estar preparada para ocupá-la. Não adianta enxergar uma
            oportunidade se a sua margem não suporta crescer. Não adianta vender mais se o caixa não acompanha. Não
            adianta colocar mais clientes para dentro se sua operação não consegue atendê-los. Não adianta fazer
            marketing se o comercial perde as oportunidades que chegam.
          </p>
          <p>
            Uma empresa forte não depende de uma única estratégia. Ela funciona como uma máquina. E cada engrenagem
            precisa cumprir o seu papel: mentalidade, postura de empresário, crescimento, gestão, tributário, marketing
            e vendas.
          </p>
          <p>
            O SOS: O FIM DAS EMPRESAS não nasceu para ensinar empresário a ter medo da crise. Nasceu para quem ainda
            está no jogo. Para quem tem funcionário dependendo das suas decisões, cliente para atender, fornecedor para
            pagar, família, sócios, uma história construída — e muito espaço pela frente para crescer.
          </p>
          <p>
            Não sabemos qual será a próxima crise. Mas podemos decidir qual empresa estará preparada quando isso
            acontecer. Porque o cenário muda. A experiência fica. A gestão fica. A capacidade de vender fica. A
            capacidade de gerar caixa fica.
          </p>
          <p className="text-foreground font-semibold">
            SOS: O FIM DAS EMPRESAS. O cenário muda. Empresas preparadas continuam avançando.
          </p>
        </div>
      </Bloco>

      <Bloco titulo="ID Visual do Produto">
        <a
          href="https://drive.google.com/drive/folders/1GiDLUwwE6a6mp02F0zQRJT6GC4F73-ML?usp=share_link"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline"
        >
          Abrir Drive com o ID Visual →
        </a>
      </Bloco>


    </div>
  );
}
