import { PageBody, PageHeader } from '@/components/shared';

/* Planejamento saiu de dentro de Máquina de Vendas e virou item próprio do menu (pedido da Joyce, 13/10).
   Conteúdo ainda é o da etapa seguinte da réplica: simulador de plano e funil padrão de 40 dias. */
export default function Planejamento() {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader titulo="Planejamento" subtitulo="Simulador de plano e funil padrão de 40 dias" />
      <PageBody>
        <section className="surface p-6 text-sm text-muted-foreground">Esta área entra nas próximas etapas da réplica: simulador de plano e funil padrão de 40 dias.</section>
      </PageBody>
    </div>
  );
}
