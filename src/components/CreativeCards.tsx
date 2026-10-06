import { ExternalLink, Play } from 'lucide-react';

export interface CreativeCardData {
  id: string;
  name: string;
  campaignName: string;
  spend: number;
  clicks: number;
  purchases: number;
  costPerResult: number;
  thumbnailUrl: string;
  previewUrl: string;
  status: string;
}

function formatCurrency(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function proxyImageUrl(url: string): string {
  if (!url) return '';
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/image-proxy?url=${encodeURIComponent(url)}`;
}

function statusLabel(status: string): { text: string; color: string } {
  switch (status) {
    case 'ACTIVE': return { text: 'Ativo', color: 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/20' };
    case 'PAUSED': return { text: 'Pausado', color: 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/20' };
    case 'DELETED': return { text: 'Excluído', color: 'bg-red-500/20 text-red-400 ring-1 ring-red-500/20' };
    case 'ARCHIVED': return { text: 'Arquivado', color: 'bg-slate-500/20 text-slate-400 ring-1 ring-slate-500/20' };
    case 'IN_PROCESS': return { text: 'Em análise', color: 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/20' };
    case 'WITH_ISSUES': return { text: 'Com problemas', color: 'bg-red-500/20 text-red-400 ring-1 ring-red-500/20' };
    default: return { text: status || '—', color: 'bg-slate-500/20 text-slate-400 ring-1 ring-slate-500/20' };
  }
}

function CreativeCard({ creative, rank }: { creative: CreativeCardData; rank: number }) {
  const handleClick = () => {
    if (creative.previewUrl) {
      window.open(creative.previewUrl, '_blank', 'noopener');
    }
  };

  const st = statusLabel(creative.status);

  return (
    <div
      className={`surface-elevated overflow-hidden transition-all duration-200 group ${creative.previewUrl ? 'cursor-pointer hover:ring-1 hover:ring-primary/30 hover:scale-[1.01]' : ''}`}
      onClick={handleClick}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-secondary/40 overflow-hidden">
        {creative.thumbnailUrl ? (
          <img
            src={proxyImageUrl(creative.thumbnailUrl)}
            alt={creative.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Play className="w-10 h-10 opacity-20" />
          </div>
        )}
        {/* Rank badge */}
        <div className="absolute top-3 left-3 w-7 h-7 rounded-lg bg-primary shadow-lg flex items-center justify-center">
          <span className="text-primary-foreground text-[11px] font-black">#{rank}</span>
        </div>
        {/* Status badge */}
        <div className={`absolute top-3 right-3 px-2 py-0.5 rounded-md text-[10px] font-bold backdrop-blur-sm ${st.color}`}>
          {st.text}
        </div>
        {/* Play overlay */}
        {creative.previewUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors duration-300">
            <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-xl">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-foreground text-sm font-bold truncate" title={creative.name}>
            {creative.name}
          </h3>
          <p className="text-muted-foreground text-[10px] uppercase tracking-[0.1em] truncate mt-0.5" title={creative.campaignName}>
            {creative.campaignName}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <div>
            <span className="text-muted-foreground text-[9px] uppercase tracking-[0.12em] font-semibold">Gasto</span>
            <p className="text-primary text-sm font-bold mono mt-0.5">{formatCurrency(creative.spend)}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-[9px] uppercase tracking-[0.12em] font-semibold">Cliques</span>
            <p className="text-foreground text-sm font-bold mono mt-0.5">{creative.clicks}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-[9px] uppercase tracking-[0.12em] font-semibold">Resultados</span>
            <p className="text-foreground text-sm font-bold mono mt-0.5">{creative.purchases}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-[9px] uppercase tracking-[0.12em] font-semibold">CPR</span>
            <p className="text-foreground text-sm font-bold mono mt-0.5">{formatCurrency(creative.costPerResult)}</p>
          </div>
        </div>

        {creative.previewUrl && (
          <div className="flex items-center gap-1.5 text-primary text-[10px] font-semibold pt-1 opacity-70 group-hover:opacity-100 transition-opacity">
            <ExternalLink className="w-3 h-3" />
            <span>Ver criativo</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function CreativeCards({ creatives }: { creatives: CreativeCardData[] }) {
  if (!creatives || creatives.length === 0) return null;

  const top5 = [...creatives]
    .sort((a, b) => b.purchases - a.purchases || b.spend - a.spend)
    .slice(0, 5);

  return (
    <div>
      <span className="section-label">Top 5 Criativos por Vendas</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mt-3">
        {top5.map((creative, i) => (
          <CreativeCard key={creative.id} creative={creative} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}
