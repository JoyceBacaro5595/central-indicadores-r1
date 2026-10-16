import '@/pages/visao-geral/painel.css';

/* Estrutura fixa enquanto os dados chegam: a moldura aparece na hora e só os números entram depois. */
export function Esq({ h = '1.2em', w = '100%', className = '' }: { h?: string; w?: string; className?: string }) {
  return <div className={`rt-sk ${className}`} style={{ height: h, width: w }} aria-hidden="true" />;
}

/** Bloco de esqueleto para áreas de gráfico, funil ou lista. */
export function EsqBloco({ linhas = 3, h = '3.2em' }: { linhas?: number; h?: string }) {
  return (
    <div className="rt-sk-g" role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => <Esq key={i} h={h} />)}
    </div>
  );
}

/** Linhas de esqueleto dentro de uma tabela (no lugar da linha "Carregando…"). */
export function EsqLinhas({ colunas, n = 4 }: { colunas: number; n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <tr key={i} role="status" aria-label="Carregando"><td colSpan={colunas} className="py-2"><Esq h="1.1em" /></td></tr>
      ))}
    </>
  );
}
