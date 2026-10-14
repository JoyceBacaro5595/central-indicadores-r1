import { ExternalLink } from 'lucide-react';

/* Visão geral do grupo, página inicial do app (pedido da Joyce, 14/10): o painel "Sala R1 · tempo real" exatamente como é,
   sem tirar nada, e sem barra de rolagem visível. O painel é de outro endereço, então a barra dele não dá para estilizar:
   o quadro é alargado e a borda direita fica escondida, e a rolagem por roda, toque ou teclado continua funcionando. */
const URL_PAINEL = 'https://lp.grupor1.com/realtime/';
const ESCONDE_BARRA = 24; // px, maior que a barra em qualquer navegador

export default function VisaoGeral() {
  return (
    <div className="h-screen bg-[#0d0d0f] flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <iframe
          title="Visão geral · painel em tempo real"
          src={URL_PAINEL}
          className="absolute top-0 left-0 h-full border-0 bg-[#0d0d0f]"
          style={{ width: `calc(100% + ${ESCONDE_BARRA}px)` }}
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <a href={URL_PAINEL} target="_blank" rel="noopener noreferrer" className="shrink-0 px-4 py-1 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        Abrir o painel em nova aba <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
