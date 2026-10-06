import { LayoutTemplate } from 'lucide-react';
import type { PaginaMeta } from '@/hooks/useDashboardData';
import type { HubspotPagina } from '@/hooks/useHubspotData';

interface Props {
  paginasMeta?: PaginaMeta[];
  paginasHub?: HubspotPagina[];
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString('pt-BR');
const pct = (v: number) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** CPL acima da meta fica vermelho; na meta ou abaixo fica verde */
const META_CPL = 47;
function corCpl(raw: number | null) {
  if (raw == null || raw === 0) return 'text-foreground';
  return raw > META_CPL ? 'text-red-500' : 'text-emerald-400';
}

/** CPMQL acima de R$ 150 fica vermelho; até R$ 150 fica verde */
const META_CPMQL = 150;
function corCpmql(raw: number | null) {
  if (raw == null || raw === 0) return 'text-foreground';
  return raw > META_CPMQL ? 'text-red-500' : 'text-emerald-400';
}

const ehVarianteLp = (nome: string) => /^LP V\d+$/i.test(nome);
const numeroVarianteLp = (nome: string) => {
  const m = nome.match(/^LP V(\d+)$/i);
  return m ? Number(m[1]) : 0;
};
const ehVarianteLpValida = (nome: string) => numeroVarianteLp(nome) >= 1 && numeroVarianteLp(nome) <= 3;


interface Linha {
  pagina: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  leads: number;
  mql: number;
}

const novaLinha = (pagina: string): Linha => ({
  pagina, spend: 0, impressions: 0, clicks: 0, linkClicks: 0,
  landingPageViews: 0, leads: 0, mql: 0,
});

export function PaginasTeste({ paginasMeta, paginasHub }: Props) {
  const mapa = new Map<string, Linha>();
  const pega = (nome: string) => {
    const l = mapa.get(nome) ?? novaLinha(nome);
    mapa.set(nome, l);
    return l;
  };

  // Leads e MQL vêm do HubSpot, por página. Variantes acima de V3 não existem
  // no teste: somam no controle (LP V1) e não geram linha própria.
  for (const p of paginasHub ?? []) {
    if (ehVarianteLp(p.name) && !ehVarianteLpValida(p.name)) {
      const v1 = pega('LP V1');
      v1.leads += p.leads;
      v1.mql += p.mql;
      continue;
    }
    const l = pega(p.name);
    l.leads += p.leads;
    l.mql += p.mql;
  }


  // Investimento e tráfego vêm da Meta. As variantes "LP V<n>" casam pelo nome;
  // o que não é variante (Validados, Teste de Criativos, sem identificação)
  // roda a página principal, então soma na linha da URL com mais leads.
  const metaRestante: PaginaMeta[] = [];
  for (const p of paginasMeta ?? []) {
    if (ehVarianteLp(p.name) && ehVarianteLpValida(p.name)) {
      const l = pega(p.name);
      l.spend += p.spend;
      l.impressions += p.impressions;
      l.clicks += p.clicks;
      l.linkClicks += p.linkClicks;
      l.landingPageViews += p.landingPageViews;
    } else {
      metaRestante.push(p);
    }
  }

  const paginaPrincipal = [...mapa.values()]
    .filter((l) => !ehVarianteLp(l.pagina))
    .sort((a, b) => b.leads - a.leads)[0];
  const alvo = paginaPrincipal ?? pega('Página principal');
  for (const p of metaRestante) {
    alvo.spend += p.spend;
    alvo.impressions += p.impressions;
    alvo.clicks += p.clicks;
    alvo.linkClicks += p.linkClicks;
    alvo.landingPageViews += p.landingPageViews;
  }

  // Se há qualquer variante "LP V<n>" (Meta ou HubSpot), o teste de LP está
  // rodando. A página principal é o controle do teste: exibe como "LP V1"
  // e garante as 3 linhas (V1, V2, V3), mesmo sem gasto/leads ainda.
  const temTesteLp = [...mapa.keys()].some(ehVarianteLp);
  if (temTesteLp) {
    if (alvo !== pega('LP V1')) {
      mapa.delete(alvo.pagina);
      const v1 = pega('LP V1');
      v1.spend += alvo.spend;
      v1.impressions += alvo.impressions;
      v1.clicks += alvo.clicks;
      v1.linkClicks += alvo.linkClicks;
      v1.landingPageViews += alvo.landingPageViews;
      v1.leads += alvo.leads;
      v1.mql += alvo.mql;
    }
    for (const n of [1, 2, 3]) pega(`LP V${n}`);
  }

  const ordemVariante = (nome: string) => {
    const m = nome.match(/^LP V(\d+)$/i);
    return m ? Number(m[1]) : 0;
  };
  const linhas = [...mapa.values()].sort((a, b) => {
    const av = ehVarianteLp(a.pagina) ? 1 : 0;
    const bv = ehVarianteLp(b.pagina) ? 1 : 0;
    if (av !== bv) return av - bv;
    if (av === 1) return ordemVariante(a.pagina) - ordemVariante(b.pagina);
    return b.leads - a.leads || b.spend - a.spend;
  });
  const total = novaLinha('Total');
  for (const l of linhas) {
    total.spend += l.spend;
    total.impressions += l.impressions;
    total.clicks += l.clicks;
    total.linkClicks += l.linkClicks;
    total.landingPageViews += l.landingPageViews;
    total.leads += l.leads;
    total.mql += l.mql;
  }

  const celulas = (l: Linha) => ({
    conversao: l.landingPageViews > 0 ? (l.leads / l.landingPageViews) * 100 : null,
    qualif: l.leads > 0 ? (l.mql / l.leads) * 100 : null,
    cpl: l.leads > 0 && l.spend > 0 ? l.spend / l.leads : null,
    cpmql: l.mql > 0 && l.spend > 0 ? l.spend / l.mql : null,
    connect: l.linkClicks > 0 ? (l.landingPageViews / l.linkClicks) * 100 : null,
  });

  const semDados = linhas.length === 0;
  const cTotal = celulas(total);

  const nomeExibicao = (pagina: string) =>
    ehVarianteLp(pagina) ? pagina : pagina.replace(/^www\./, '');

  return (
    <div className="surface px-5 py-4">
      <div className="flex items-center gap-2.5">
        <LayoutTemplate className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
          Páginas
        </span>
      </div>

      {semDados ? (
        <p className="mt-4 text-xs text-muted-foreground">Sem dados no período.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="surface-soft px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Views de página</p>
              <p className="mt-1 text-xl font-extrabold text-foreground mono">{num(total.landingPageViews)}</p>
              <p className="text-[10px] text-muted-foreground">no Meta</p>
            </div>
            <div className="surface-soft px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Conversão paga</p>
              <p className="mt-1 text-xl font-extrabold text-foreground mono">{cTotal.conversao != null ? pct(cTotal.conversao) : '—'}</p>
              <p className="text-[10px] text-muted-foreground">leads (HubSpot) ÷ views (Meta)</p>
            </div>
            <div className="surface-soft px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Connect rate</p>
              <p className="mt-1 text-xl font-extrabold text-foreground mono">{cTotal.connect != null ? pct(cTotal.connect) : '—'}</p>
              <p className="text-[10px] text-muted-foreground">views ÷ cliques no link</p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs mono border-collapse">
              <thead>
                <tr className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="border-b border-border px-3 py-2 text-left font-semibold">Página</th>
                  <th className="border-b border-l border-border px-3 py-2 text-right font-semibold">Leads</th>
                  <th className="border-b border-border px-3 py-2 text-right font-semibold">MQL</th>
                  <th className="border-b border-border px-3 py-2 text-right font-semibold">% Qualif.</th>
                  <th className="border-b border-border px-3 py-2 text-right font-semibold">Conversão</th>
                  <th className="border-b border-l border-border px-3 py-2 text-right font-semibold">Investimento</th>
                  <th className="border-b border-border px-3 py-2 text-right font-semibold">CPL</th>
                  <th className="border-b border-border px-3 py-2 text-right font-semibold">Custo/MQL</th>
                </tr>
              </thead>
              <tbody>
                {[...linhas, total].map((l) => {
                  const c = celulas(l);
                  const ehTotal = l.pagina === 'Total';
                  return (
                    <tr key={l.pagina} className={ehTotal ? 'border-t border-border font-bold' : ''}>
                      <td className="px-3 py-2 text-left font-semibold text-foreground">
                        {nomeExibicao(l.pagina)}
                      </td>
                      <td className="border-l border-border px-3 py-2 text-right text-foreground">{l.leads > 0 ? num(l.leads) : ''}</td>
                      <td className="px-3 py-2 text-right text-foreground">{l.mql > 0 ? num(l.mql) : ''}</td>
                      <td className="px-3 py-2 text-right text-foreground">{c.qualif != null ? pct(c.qualif) : ''}</td>
                      <td className="px-3 py-2 text-right text-foreground">{c.conversao != null ? pct(c.conversao) : ''}</td>
                      <td className="border-l border-border px-3 py-2 text-right text-foreground">{l.spend > 0 ? brl(l.spend) : ''}</td>
                      <td className={`px-3 py-2 text-right ${corCpl(c.cpl)}`}>{c.cpl != null ? brl(c.cpl) : ''}</td>
                      <td className={`px-3 py-2 text-right ${corCpmql(c.cpmql)}`}>{c.cpmql != null ? brl(c.cpmql) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
