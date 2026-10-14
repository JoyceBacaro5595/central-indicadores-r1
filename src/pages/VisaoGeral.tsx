import { ExternalLink } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/shared';

/* Visão geral do grupo: painel em tempo real da LP (pedido da Joyce, 14/10). Fica acima de Máquina de Vendas e é a página inicial do app. */
const URL_PAINEL = 'https://lp.grupor1.com/realtime/';

export default function VisaoGeral() {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader titulo="Visão geral" subtitulo="Painel em tempo real do Grupo R1" />
      <PageBody>
        <div className="surface overflow-hidden">
          <iframe
            title="Visão geral · painel em tempo real"
            src={URL_PAINEL}
            className="w-full h-[calc(100vh-11rem)] min-h-[480px] border-0 bg-background"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Se o painel não carregar aqui dentro,{' '}
          <a href={URL_PAINEL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline hover:text-foreground">abra em uma nova aba <ExternalLink className="w-3 h-3" /></a>.
        </p>
      </PageBody>
    </div>
  );
}
