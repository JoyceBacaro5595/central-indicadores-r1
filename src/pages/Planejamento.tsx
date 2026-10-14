import { PageBody, PageHeader } from '@/components/shared';
import PlanoRotaForm from './maquina-vendas/PlanoRotaForm';
import { Planejamento as Cronograma } from '@/components/Planejamento';

/* Planejamento saiu de dentro de Máquina de Vendas e virou item próprio do menu (pedido da Joyce, 13/10).
   Réplica da aba Planejamento da Lovable: cronograma da campanha, checklist de páginas e de criativos. */
export default function Planejamento() {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader titulo="Planejamento" subtitulo="Cronograma da campanha, checklist de páginas e de criativos" />
      <PageBody><div className="space-y-4"><PlanoRotaForm /><Cronograma /></div></PageBody>
    </div>
  );
}
