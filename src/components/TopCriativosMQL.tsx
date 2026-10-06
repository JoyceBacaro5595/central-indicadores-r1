import { useState } from 'react';
import { ExternalLink, Play, TriangleAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CreativeCardData } from '@/hooks/useDashboardData';

interface TopCriativosMQLProps {
  creatives?: CreativeCardData[];
  /** Taxa de qualificação global (%) vinda do HubSpot */
  taxaQualificacao?: number;
}

type RankedCreative = CreativeCardData & { leads: number; mql: number; cpmql: number; impressions: number; cpm: number; ctr: number };

const CPMQL_LIMITE = 200;

const brl = (v: number) =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

function proxyImageUrl(url: string): string {
  if (!url) return '';
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/image-proxy?url=${encodeURIComponent(url)}`;
}

export function TopCriativosMQL({
  creatives,
  taxaQualificacao,
}: TopCriativosMQLProps) {
  const [selecionado, setSelecionado] = useState<RankedCreative | null>(null);
  const taxa = (taxaQualificacao ?? 0) / 100;

  // Agrupa criativos com a mesma nomenclatura em um único card (dados somados)
  // CPM e CTR vêm prontos do gerenciador de anúncios; ao agrupar, usamos média ponderada por impressões
  const agrupados = new Map<string, CreativeCardData & { leads: number; anuncios: number; cpmPond: number; ctrPond: number }>();
  for (const c of creatives ?? []) {
    const chave = (c.name ?? '').trim().toLowerCase();
    const imps = c.impressions ?? 0;
    const atual = agrupados.get(chave);
    if (atual) {
      atual.spend += c.spend ?? 0;
      atual.leads += c.leads ?? 0;
      atual.clicks = (atual.clicks ?? 0) + (c.clicks ?? 0);
      atual.impressions = (atual.impressions ?? 0) + imps;
      atual.cpmPond += (c.cpm ?? 0) * imps;
      atual.ctrPond += (c.ctr ?? 0) * imps;

      atual.anuncios += 1;
      if (!atual.thumbnailUrl && c.thumbnailUrl) atual.thumbnailUrl = c.thumbnailUrl;
      if (!atual.previewUrl && c.previewUrl) atual.previewUrl = c.previewUrl;
      if (!atual.videoUrl && c.videoUrl) atual.videoUrl = c.videoUrl;
    } else {
      agrupados.set(chave, {
        ...c,
        spend: c.spend ?? 0,
        leads: c.leads ?? 0,
        anuncios: 1,
        cpmPond: (c.cpm ?? 0) * imps,
        ctrPond: (c.ctr ?? 0) * imps,
      });
    }
  }

  const todos: (RankedCreative & { anuncios: number; impressions: number; cpm: number; ctr: number })[] = [...agrupados.values()].map((c) => {
    const leads = c.leads ?? 0;
    const mql = leads * taxa;
    const cpmql = mql > 0 ? c.spend / mql : Infinity;
    const impressions = c.impressions ?? 0;
    const cpm = impressions > 0 ? c.cpmPond / impressions : (c.cpm ?? 0);
    const ctr = impressions > 0 ? c.ctrPond / impressions : (c.ctr ?? 0);
    return { ...c, leads, mql, cpmql, impressions, cpm, ctr };
  });



  const top = todos
    .filter((c) => c.leads > 0 && Number.isFinite(c.cpmql) && c.cpmql <= CPMQL_LIMITE)
    .sort((a, b) => b.mql - a.mql || a.cpmql - b.cpmql)
    .slice(0, 10);

  const piores = todos
    .filter((c) => c.spend > 0 && (c.mql === 0 || c.cpmql > CPMQL_LIMITE))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);

  const renderCard = (
    c: RankedCreative & { anuncios?: number },
    i: number,
    variante: 'top' | 'pior',
  ) => (
    <div
      key={c.id}
      className="surface-elevated overflow-hidden group transition-all duration-200"
    >
      <button
        type="button"
        onClick={() => setSelecionado(c)}
        className="relative aspect-[4/3] bg-secondary/40 overflow-hidden w-full cursor-zoom-in"
        title="Clique para ampliar o criativo"
      >
        {c.thumbnailUrl ? (
          <img
            src={proxyImageUrl(c.thumbnailUrl)}
            alt={c.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Play className="w-10 h-10 opacity-20" />
          </div>
        )}
        {c.videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-background/70 backdrop-blur flex items-center justify-center shadow-lg">
              <Play className="w-5 h-5 text-foreground fill-current" />
            </div>
          </div>
        )}
        <div
          className={`absolute top-3 left-3 w-7 h-7 rounded-lg shadow-lg flex items-center justify-center ${
            variante === 'top' ? 'bg-primary' : 'bg-destructive'
          }`}
        >
          <span
            className={`text-[11px] font-black ${
              variante === 'top' ? 'text-primary-foreground' : 'text-destructive-foreground'
            }`}
          >
            #{i + 1}
          </span>
        </div>
        {variante === 'pior' && (
          <div className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-destructive/90 shadow-lg flex items-center justify-center">
            <TriangleAlert className="w-3.5 h-3.5 text-destructive-foreground" />
          </div>
        )}
      </button>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-foreground text-sm font-bold truncate" title={c.name}>
            {c.name}
          </h3>
          <p
            className="text-muted-foreground text-[10px] uppercase tracking-[0.1em] truncate mt-0.5"
            title={c.campaignName}
          >
            {c.campaignName}
          </p>
          {(c.anuncios ?? 1) > 1 && (
            <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md bg-secondary text-muted-foreground text-[9px] font-semibold uppercase tracking-[0.1em]">
              {c.anuncios} anúncios somados
            </span>
          )}
        </div>


        <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
          <div>
            <span className="text-muted-foreground text-[9px] uppercase tracking-[0.12em] font-semibold">
              MQL
            </span>
            <p
              className={`text-sm font-bold mono mt-0.5 ${
                variante === 'pior' && c.mql === 0 ? 'text-destructive' : 'text-primary'
              }`}
            >
              {Math.round(c.mql)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground text-[9px] uppercase tracking-[0.12em] font-semibold">
              CPMQL
            </span>
            <p
              className={`text-sm font-bold mono mt-0.5 ${
                Number.isFinite(c.cpmql) && c.cpmql > 150 ? 'text-red-500' : 'text-foreground'
              }`}
            >
              {Number.isFinite(c.cpmql) ? brl(c.cpmql) : '—'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground text-[9px] uppercase tracking-[0.12em] font-semibold">
              Leads
            </span>
            <p className="text-foreground text-sm font-bold mono mt-0.5">{c.leads}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-[9px] uppercase tracking-[0.12em] font-semibold">
              CPM
            </span>
            <p className="text-foreground text-sm font-bold mono mt-0.5">{brl(c.cpm)}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-[9px] uppercase tracking-[0.12em] font-semibold">
              CTR
            </span>
            <p className="text-foreground text-sm font-bold mono mt-0.5">{c.ctr.toFixed(2)}%</p>
          </div>
          <div>
            <span className="text-muted-foreground text-[9px] uppercase tracking-[0.12em] font-semibold">
              Investido
            </span>
            <p className="text-foreground text-sm font-bold mono mt-0.5">{brl(c.spend)}</p>
          </div>
        </div>

        {c.previewUrl && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <a
              href={c.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir post no Instagram em nova aba"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-[10px] font-semibold transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Abrir post</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-end justify-between">
          <span className="section-label">Top 10 Criativos por MQL</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Leads da BM cruzados com a taxa de qualificação do HubSpot ({(taxaQualificacao ?? 0).toFixed(0)}%) · ordenado por volume de MQL
        </p>

        {top.length === 0 ? (
          <div className="surface px-5 py-4 mt-3 text-xs text-muted-foreground">
            Nenhum criativo com leads no período selecionado.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mt-3">
            {top.map((c, i) => renderCard(c, i, 'top'))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-end justify-between">
          <span className="section-label">10 Piores Criativos</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Investiram e não geraram MQL, ou CPMQL acima de {brl(CPMQL_LIMITE)} · ordenado por maior gasto
        </p>

        {piores.length === 0 ? (
          <div className="surface px-5 py-4 mt-3 text-xs text-muted-foreground">
            Nenhum criativo com gasto sem retorno ou CPMQL acima de {brl(CPMQL_LIMITE)} no período.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mt-3">
            {piores.map((c, i) => renderCard(c, i, 'pior'))}
          </div>
        )}
      </div>

      <Dialog open={!!selecionado} onOpenChange={(open) => !open && setSelecionado(null)}>
        <DialogContent className="max-w-3xl">
          {selecionado && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{selecionado.name}</DialogTitle>
                <p className="text-muted-foreground text-[10px] uppercase tracking-[0.1em]">
                  {selecionado.campaignName}
                </p>
              </DialogHeader>
              <div className="bg-secondary/40 rounded-lg overflow-hidden flex items-center justify-center max-h-[70vh]">
                {selecionado.videoUrl ? (
                  <iframe
                    src={selecionado.videoUrl}
                    title={selecionado.name}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    className="w-full h-[70vh] border-0"
                  />
                ) : selecionado.thumbnailUrl ? (
                  <img
                    src={proxyImageUrl(selecionado.thumbnailUrl)}
                    alt={selecionado.name}
                    className="max-h-[70vh] w-auto max-w-full object-contain"
                  />
                ) : (
                  <div className="w-full aspect-video flex items-center justify-center text-muted-foreground">
                    <Play className="w-16 h-16 opacity-20" />
                  </div>
                )}
              </div>

              {selecionado.videoUrl && (
                <p className="text-muted-foreground text-[11px]">
                  O player do Meta começa sem som — clique no ícone de som dentro do vídeo ou abra o post no
                  Instagram para ouvir o áudio.
                </p>
              )}

              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <span className="text-muted-foreground">
                    MQL <span className="text-primary font-bold mono">{Math.round(selecionado.mql)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    CPMQL{' '}
                    <span className={`font-bold mono ${Number.isFinite(selecionado.cpmql) && selecionado.cpmql > 150 ? 'text-red-500' : 'text-foreground'}`}>
                      {Number.isFinite(selecionado.cpmql) ? brl(selecionado.cpmql) : '—'}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Leads <span className="text-foreground font-bold mono">{selecionado.leads}</span>
                  </span>
                  <span className="text-muted-foreground">
                    CPM <span className="text-foreground font-bold mono">{brl(selecionado.cpm)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    CTR <span className="text-foreground font-bold mono">{selecionado.ctr.toFixed(2)}%</span>
                  </span>
                  <span className="text-muted-foreground">
                    Investido <span className="text-foreground font-bold mono">{brl(selecionado.spend)}</span>
                  </span>
                </div>
                {selecionado.previewUrl && (
                  <a
                    href={selecionado.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-primary text-xs font-semibold opacity-80 hover:opacity-100 transition-opacity"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir post no Instagram</span>
                  </a>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
