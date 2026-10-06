import { Users } from 'lucide-react';
import type { BreakdownEntry } from '@/hooks/useDashboardData';
import type { HubspotDistGrupo } from '@/hooks/useHubspotData';

interface Props {
  audiences?: BreakdownEntry[];
  distTodos?: HubspotDistGrupo;
  distMql?: HubspotDistGrupo;
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString('pt-BR');
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** CPMQL acima da meta fica vermelho; na meta ou abaixo fica verde */
function corMeta(raw: number | null, metaNum: number) {
  if (raw == null || raw === 0) return 'text-foreground';
  return raw > metaNum ? 'text-red-500' : 'text-emerald-400';
}

/** Envolvimento = público quente; demais = frio. */
function classificar(nome: string): 'Quente' | 'Frio' {
  return /envolvimento/i.test(nome) ? 'Quente' : 'Frio';
}

interface Linha {
  publico: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  cpmWeighted: number;
  ctrWeighted: number;
  leads: number;
  mql: number;
}

const novaLinha = (publico: string): Linha => ({
  publico, spend: 0, impressions: 0, clicks: 0, linkClicks: 0,
  landingPageViews: 0, cpmWeighted: 0, ctrWeighted: 0, leads: 0, mql: 0,
});

export function PublicoQuenteFrio({ audiences, distTodos, distMql }: Props) {
  const quente = novaLinha('Quente');
  const frio = novaLinha('Frio');
  const semTag = novaLinha('Sem tag');

  const conhecidos = new Set<string>();

  for (const a of audiences ?? []) {
    conhecidos.add(a.name.trim().toLowerCase());
    const alvo = classificar(a.name) === 'Quente' ? quente : frio;
    alvo.spend += a.spend ?? 0;
    alvo.impressions += a.impressions ?? 0;
    alvo.clicks += a.clicks ?? 0;
    alvo.linkClicks += a.linkClicks ?? 0;
    alvo.landingPageViews += a.landingPageViews ?? 0;
    alvo.cpmWeighted += (a.cpm ?? 0) * (a.impressions ?? 0);
    alvo.ctrWeighted += (a.ctr ?? 0) * (a.impressions ?? 0);
  }

  const distribuir = (lista: { name: string; value: number }[] | undefined, campo: 'leads' | 'mql') => {
    for (const item of lista ?? []) {
      const nome = item.name.trim();
      const chave = nome.toLowerCase();
      const alvo = conhecidos.has(chave)
        ? (classificar(nome) === 'Quente' ? quente : frio)
        : semTag;
      alvo[campo] += item.value;
    }
  };
  distribuir(distTodos?.publicos, 'leads');
  distribuir(distMql?.publicos, 'mql');

  const linhas = [quente, frio, semTag];
  const total = linhas.reduce((acc, l) => {
    acc.spend += l.spend; acc.impressions += l.impressions; acc.clicks += l.clicks;
    acc.linkClicks += l.linkClicks; acc.landingPageViews += l.landingPageViews;
    acc.cpmWeighted += l.cpmWeighted; acc.ctrWeighted += l.ctrWeighted;
    acc.leads += l.leads; acc.mql += l.mql;
    return acc;
  }, novaLinha('Total'));

  const celulas = (l: Linha) => {
    const cpl = l.leads > 0 ? l.spend / l.leads : null;
    const cpmql = l.mql > 0 ? l.spend / l.mql : null;
    const conversao = l.landingPageViews > 0 ? (l.leads / l.landingPageViews) * 100 : null;
    const cpm = l.impressions > 0 ? l.cpmWeighted / l.impressions : null;
    const ctr = l.impressions > 0 ? l.ctrWeighted / l.impressions : null;
    const connect = l.clicks > 0 ? (l.landingPageViews / l.clicks) * 100 : null;
    const cpc = l.linkClicks > 0 ? l.spend / l.linkClicks : null;
    return { cpl, cpmql, conversao, cpm, ctr, connect, cpc };
  };

  const semDados = (audiences?.length ?? 0) === 0 && total.leads === 0;

  return (
    <div className="surface px-5 py-4">
      <div className="flex items-center gap-2.5">
        <Users className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
          Público quente × frio
        </span>
      </div>

      {semDados ? (
        <p className="mt-4 text-xs text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs mono border-collapse">
            <thead>
              <tr className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                <th className="border-b border-border px-3 py-2" />
                <th className="border-b border-l border-border px-3 py-2 text-center font-semibold" colSpan={5}>Captação</th>
                <th className="border-b border-l border-border px-3 py-2 text-center font-semibold" colSpan={3}>Mídia</th>
                <th className="border-b border-l border-border px-3 py-2 text-center font-semibold" colSpan={3}>Tráfego</th>
              </tr>
              <tr className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="border-b border-border px-3 py-2 text-left font-semibold">Público</th>
                <th className="border-b border-l border-border px-3 py-2 text-right font-semibold">Investimento</th>
                <th className="border-b border-border px-3 py-2 text-right font-semibold">Leads</th>
                <th className="border-b border-border px-3 py-2 text-right font-semibold">CPL</th>
                <th className="border-b border-border px-3 py-2 text-right font-semibold">MQL</th>
                <th className="border-b border-border px-3 py-2 text-right font-semibold">CPMQL</th>
                <th className="border-b border-l border-border px-3 py-2 text-right font-semibold">CPM</th>
                <th className="border-b border-border px-3 py-2 text-right font-semibold">CTR</th>
                <th className="border-b border-border px-3 py-2 text-right font-semibold">Connect</th>
                <th className="border-b border-l border-border px-3 py-2 text-right font-semibold">Impressões</th>
                <th className="border-b border-border px-3 py-2 text-right font-semibold">Cliques</th>
                <th className="border-b border-border px-3 py-2 text-right font-semibold">CPC</th>
              </tr>
            </thead>
            <tbody>
              {[...linhas, total].map((l) => {
                const c = celulas(l);
                const ehTotal = l.publico === 'Total';
                const apagado = l.publico === 'Sem tag';
                const pctMql = total.mql > 0 && l.mql > 0
                  ? (l.mql / total.mql) * 100
                  : null;
                return (
                  <tr
                    key={l.publico}
                    className={ehTotal ? 'border-t border-border font-bold' : ''}
                  >
                    <td className={`px-3 py-2 text-left font-semibold ${apagado ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {l.publico}
                    </td>
                    <td className="border-l border-border px-3 py-2 text-right text-foreground">{l.spend > 0 ? brl(l.spend) : ''}</td>
                    <td className="px-3 py-2 text-right text-foreground">{l.leads > 0 ? num(l.leads) : ''}</td>
                    <td className="px-3 py-2 text-right text-emerald-400">{c.cpl != null ? brl(c.cpl) : ''}</td>
                    <td className="px-3 py-2 text-right text-white">
                      {l.mql > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          {num(l.mql)}
                          {pctMql != null && (
                            <span className="text-[10px] text-white/70">
                              ({pctMql.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                            </span>
                          )}
                        </span>
                      ) : ''}
                    </td>
                    <td className={`px-3 py-2 text-right ${corMeta(c.cpmql, 150)}`}>{c.cpmql != null ? brl(c.cpmql) : ''}</td>
                    <td className="border-l border-border px-3 py-2 text-right text-foreground">{c.cpm != null ? brl(c.cpm) : ''}</td>
                    <td className="px-3 py-2 text-right text-foreground">{c.ctr != null ? pct(c.ctr) : ''}</td>
                    <td className="px-3 py-2 text-right text-foreground">{c.connect != null ? pct(c.connect) : ''}</td>
                    <td className="border-l border-border px-3 py-2 text-right text-foreground">{l.impressions > 0 ? num(l.impressions) : ''}</td>
                    <td className="px-3 py-2 text-right text-foreground">{l.clicks > 0 ? num(l.clicks) : ''}</td>
                    <td className="px-3 py-2 text-right text-foreground">{c.cpc != null ? brl(c.cpc) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
