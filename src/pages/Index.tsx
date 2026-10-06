import { useState, useEffect } from 'react';
import { MetaCascata } from '@/components/MetaCascata';
import { InvestimentoVendas, InvestimentoVendasChart } from '@/components/InvestimentoVendas';
import { QualificacaoProduto } from '@/components/QualificacaoProduto';
import { CargosLeads } from '@/components/CargosLeads';
import { FaixasFaturamento } from '@/components/FaixasFaturamento';
import { PublicoQuenteFrio } from '@/components/PublicoQuenteFrio';
import { PaginasTeste } from '@/components/PaginasTeste';
import { TopCriativosMQL } from '@/components/TopCriativosMQL';
import { DistribuicaoLeads } from '@/components/DistribuicaoLeads';
import { useHubspotData } from '@/hooks/useHubspotData';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LoadingBar } from '@/components/LoadingBar';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Sun, Moon, Smartphone, Monitor, RefreshCw, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';


export default function Index() {
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('theme') === 'light');
  const [mobileView, setMobileView] = useState(() => localStorage.getItem('mobileView') === 'true');
  const [startDate, setStartDate] = useState('2026-09-14');
  const [endDate, setEndDate] = useState('2026-09-21');
  const { data: ads, error: adsError, refetch: refetchAds, isFetching: adsFetching } = useDashboardData(startDate || undefined, endDate || undefined);
  const { data: hubspot, refetch: refetchHubspot, isFetching: hubspotFetching } = useHubspotData(startDate || undefined, endDate || undefined);
  const fetching = adsFetching || hubspotFetching;

  useEffect(() => {
    document.documentElement.classList.toggle('light', lightMode);
    localStorage.setItem('theme', lightMode ? 'light' : 'dark');
  }, [lightMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('mobile-view', mobileView);
    localStorage.setItem('mobileView', mobileView ? 'true' : 'false');
  }, [mobileView]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="dashboard-header">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-primary text-sm font-black">+</span>
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-foreground tracking-wide">Máquina de Vendas Online</h1>
            <p className="text-[10px] text-muted-foreground font-medium">Evento 21/09 · Metas de Performance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/central"
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150"
            title="Central de vendas de ingressos"
          >
            <Ticket className="w-4 h-4" /> Ingressos
          </Link>
          <button
            onClick={() => { refetchAds(); refetchHubspot(); }}
            disabled={fetching}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150 disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
          </button>
          {[
            {
              icon: mobileView ? Monitor : Smartphone,
              onClick: () => setMobileView(!mobileView),
              title: mobileView ? 'Desktop' : 'Mobile',
            },
            {
              icon: lightMode ? Moon : Sun,
              onClick: () => setLightMode(!lightMode),
              title: lightMode ? 'Escuro' : 'Claro',
            },
          ].map((btn, i) => (
            <button
              key={i}
              onClick={btn.onClick}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150"
              title={btn.title}
            >
              <btn.icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main
        className={`py-6 space-y-6 mx-auto transition-all duration-300 ${
          mobileView ? 'max-w-[420px] px-4' : 'max-w-[1520px] px-8'
        }`}
      >
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        />

        <LoadingBar
          fetching={fetching}
          loaded={(ads ? 1 : 0) + (hubspot ? 1 : 0)}
          total={2}
        />
        <MetaCascata
          totals={ads?.totals}
          guru={undefined}
          modo="gratuito"
          leads={hubspot?.inscricoes}
          qualificados={hubspot?.qualificados}
        />
        <InvestimentoVendas investido={ads?.totals.spend} daily={ads?.daily} />
        <QualificacaoProduto
          investido={ads?.totals.spend}
          inscritos={hubspot?.inscricoes}
          qualificados={hubspot?.qualificados}
        />
        <CargosLeads
          investido={ads?.totals.spend}
          inscritos={hubspot?.inscricoes}
          cargos={hubspot?.distCargos}
          cargosMql={hubspot?.distCargosMql}
        />
        <FaixasFaturamento
          faixas={hubspot?.faixas}
          inscritos={hubspot?.inscricoes}
          investido={ads?.totals.spend}
        />
        <InvestimentoVendasChart
          daily={ads?.daily}
          gratuito
          leadsDaily={hubspot?.daily}
        />
        <DistribuicaoLeads
          subtitulo="Distribuição"
          titulo="Quem mais traz MQL"
          total={hubspot?.qualificados}
          dist={hubspot?.distMql}
        />
        <DistribuicaoLeads
          subtitulo="Distribuição"
          titulo="Leads que faturam abaixo de 100k"
          total={
            hubspot
              ? (hubspot.distAbaixo100k?.campanhas ?? []).reduce((s, c) => s + c.value, 0)
              : undefined
          }
          dist={hubspot?.distAbaixo100k}
        />
        <PublicoQuenteFrio
          audiences={ads?.audiences}
          distTodos={hubspot?.distTodos}
          distMql={hubspot?.distMql}
        />
        <PaginasTeste
          paginasMeta={ads?.paginas}
          paginasHub={hubspot?.paginas}
        />

        <TopCriativosMQL
          creatives={ads?.creativeCards}
          taxaQualificacao={hubspot?.taxaQualificacao}
        />

        {adsError && (
          <div className="surface px-5 py-4">
            <span className="section-label">Dados de campanha</span>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Não foi possível ler os dados da campanha agora. Tente atualizar em instantes.
            </p>
          </div>
        )}
      </main>

    </div>
  );
}
