import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useChecklistStatus } from '@/hooks/useChecklistStatus';


type Dia = {
  data: string;
  label?: string;
  tipo?: 'briefing' | 'producao' | 'start' | 'venda' | 'feriado' | 'live' | 'debriefing';
};

const dias: (Dia | null)[] = [
  { data: '31/08', label: 'Briefing', tipo: 'briefing' },
  { data: '01/09', label: 'Produção', tipo: 'producao' },
  { data: '02/09', label: 'Produção', tipo: 'producao' },
  { data: '03/09', label: 'START CAMPANHA', tipo: 'start' },
  { data: '04/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '05/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '06/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '07/09', label: 'FERIADO', tipo: 'feriado' },
  { data: '08/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '09/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '10/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '11/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '12/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '13/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '14/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '15/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '16/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '17/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '18/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '19/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '20/09', label: 'Venda Ingressos', tipo: 'venda' },
  { data: '21/09', label: 'DIA DA LIVE', tipo: 'live' },
  { data: '22/09', label: 'DIA DA LIVE', tipo: 'live' },
  { data: '23/09', label: 'DEBRIEFING', tipo: 'debriefing' },
  null,
  null,
  null,
  null,
];

const estilos: Record<string, string> = {
  briefing: 'bg-[#c5ddb4] text-[#1c2b16]',
  producao: 'bg-[#5fe6f0] text-[#0a2a2e]',
  start: 'bg-[#c0271c] text-white font-bold',
  venda: 'bg-[#f3ba48] text-[#2b1d00]',
  feriado: 'bg-[#0d0d0d] text-white font-bold',
  live: 'bg-[#2f5220] text-white font-bold',
  debriefing: 'bg-[#7c2049] text-white font-bold',
};

const semana = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

const paginas = [
  { nome: 'SOS V1', url: 'https://lp.grupor1.com/sos-v1/', noAr: true },
  { nome: 'SOS V2', url: 'https://lp.grupor1.com/sos-v2/', noAr: true },
  { nome: 'SOS V3', url: 'https://lp.grupor1.com/sos-v3/', noAr: true },
];

const criativos = [
  {
    grupo: 'Estáticos',
    pasta: 'https://drive.google.com/drive/folders/1oWyOhOXcpL4Vd2Gyl6u6FZtGxJdS27jZ',
    itens: [
      { nome: '1', url: 'https://drive.google.com/drive/folders/1L8AxaNpIGqgSfL8ALwv7RxBcFsh-3x3E' },
      { nome: '2', url: 'https://drive.google.com/drive/folders/1g1QOQ1wU4bZfnkkhcsJwlXIDiKkwA_l1' },
      { nome: '3', url: 'https://drive.google.com/drive/folders/14jR-j4E5ZedmZNN5pErlH83plZ0X41em' },
      { nome: '4', url: 'https://drive.google.com/drive/folders/1ikyL7kVhWwpef6XkNLo7kWbWCI9PAKgc' },
      { nome: '5', url: 'https://drive.google.com/drive/folders/1N0BaFxRTbitMYZDzPtD4M9yVhYjDtYKK' },
      { nome: '6', url: 'https://drive.google.com/drive/folders/1DFNSch070et7qFijGHDASsJ6umtwGIjg' },
      { nome: '7', url: 'https://drive.google.com/drive/folders/1IFCp6KqXnD-rxhWMW48s7ygyOMoinjBe' },
      { nome: '8', url: 'https://drive.google.com/drive/folders/1imsr5DnW4Hl3BhURre_E09WNAk752frr' },
      { nome: '9', url: 'https://drive.google.com/drive/folders/1-z0_j_NA5-E4XCQDz3PAL9ZhP4UMEYM4' },
      { nome: '10', url: 'https://drive.google.com/drive/folders/1DHZwUCMOGLZwZvjjFOFCe84Z5TFNBUf8' },
      { nome: '11', url: 'https://drive.google.com/drive/folders/1U1XAM_4EZTyr6ZAvSU07zwgngByHzOy6' },
      { nome: '12', url: 'https://drive.google.com/drive/folders/1nUtsNqExL5KI8CqTo8ZSPkA-MMrbB2fT' },
    ],
  },
  {
    grupo: 'Vídeos',
    pasta: 'https://drive.google.com/drive/folders/1Ye1MscH0U8W3F6P7ya3S50eQlgHhdUDm',
    itens: [
      { nome: 'AD01', url: 'https://drive.google.com/drive/folders/1R90SeSmXJ9rAIXXAomAt91uaUeKxO1nc' },
      { nome: 'AD02', url: 'https://drive.google.com/drive/folders/1rjX3JQo2TZDrSXpjSkhIkPVa--nLGHoF' },
      { nome: 'AD03', url: 'https://drive.google.com/drive/folders/1f3PF07xlb5d7cmgjalD3zaOcRiuqU8Fw' },
      { nome: 'AD04', url: 'https://drive.google.com/drive/folders/1cCZHd48vY7y7h0-i6wkRlQXQJyvo4oNz' },
      { nome: 'AD05', url: 'https://drive.google.com/drive/folders/1eaYlir8pAY94oZqpIHCIcuiDfywKWP_J' },
      { nome: 'AD06', url: 'https://drive.google.com/drive/folders/1PsldmorcpPDSVC8sWV2f50YEJyhq1fIK' },
      { nome: 'AD07', url: 'https://drive.google.com/drive/folders/1r7yf0NubbC_UozQ4uyKkNWUQOCKUNi0y' },
      { nome: 'AD08', url: 'https://drive.google.com/drive/folders/1WSSljWuz9jbrK5xgQbyvchpKzdvxJw2D' },
      { nome: 'AD09', url: 'https://drive.google.com/drive/folders/1JeFPAP-sPKTFIsHnNGKnW1fjFhGq7TZj' },
      { nome: 'AD10', url: 'https://drive.google.com/drive/folders/1vOH36NpWDY3ZsRowZoHkDARlnDo2bzUm' },
      { nome: 'AD11', url: 'https://drive.google.com/drive/folders/1wBWlmEpXs0XcSp_egQAkNfZxl7N_PezM' },
      { nome: 'AD12', url: 'https://drive.google.com/drive/folders/15Zr09Wc6M464bPyRox8MDFxm2imPnjs3' },
      { nome: 'AD13', url: 'https://drive.google.com/drive/folders/1mkg87J9Yv-cgLujNyU1g14fxs2OyJy-W' },
      { nome: 'AD14', url: 'https://drive.google.com/drive/folders/1RnSrxiBjm4_XV_h41JLr4sG7fncV7ZMQ' },
      { nome: 'AD15', url: 'https://drive.google.com/drive/folders/1akXSMAuqhsoMbkwiVknv3PZ-ZwcRgYLC' },
      { nome: 'AD16', url: 'https://drive.google.com/drive/folders/1Sq6nKMAxQ72NNowfe3cn3Mrs3qAdlGOV' },
      { nome: 'AD17', url: 'https://drive.google.com/drive/folders/1_dv-h_4v7GeqjCpmeg1z0VCsDVuunDe8' },
      { nome: 'AD18', url: 'https://drive.google.com/drive/folders/11rB8Z2Uu11wyJwRXHxQg06wBpIXGMdoH' },
      { nome: 'AD19', url: 'https://drive.google.com/drive/folders/1EnMncriB_uLFHHFoEhW5tEtV1HsEOAa7' },
      { nome: 'AD20', url: 'https://drive.google.com/drive/folders/1S4pDJDXZVTfsDv4-RN3oVssAheDf17m0' },
      { nome: 'AD21', url: 'https://drive.google.com/drive/folders/1Tj6sJ1Oq_Yz1BVwo56i9Lh6MI1E87ni2' },
      { nome: 'AD22', url: 'https://drive.google.com/drive/folders/1JxHzRkZ7m8k_W6_GGTiSAF0EtWCWD_YO' },
      { nome: 'AD23', url: 'https://drive.google.com/drive/folders/1pk_OaNYBij19bVZqAbJ9VVnrV_mfogQ-' },
      { nome: 'AD24', url: 'https://drive.google.com/drive/folders/1NBBRRnmcDfDhjLYbFz1jHCT3uD0QUxCG' },
      { nome: 'AD25', url: 'https://drive.google.com/drive/folders/1Ll9hyF1PqoqP-dSRYet26hUsXnwLt-dW' },
      { nome: 'AD26', url: 'https://drive.google.com/drive/folders/1WUlOqVvlvDKaF1HxVgIrPji2vSNBS60u' },
      { nome: 'AD27', url: 'https://drive.google.com/drive/folders/1DqjwtchoIGWejhTK5ggN-ivePeapNm82' },
      { nome: 'AD28', url: 'https://drive.google.com/drive/folders/1ZBinn9vRTf9QDvbr086dixFnt723fM1L' },
      { nome: 'AD29', url: 'https://drive.google.com/drive/folders/1pN6UJawe_zQqn8wYF57EWixY5YLJfP6w' },
      { nome: 'AD30', url: 'https://drive.google.com/drive/folders/1tIr50bNZq1OKye8E8JGX9EfFoYY6G1gy' },
      { nome: 'AD31', url: 'https://drive.google.com/drive/folders/1Jt8LFnkOUt4jOfMppVf6dJv3aSmk6xiu' },
      { nome: 'AD32', url: 'https://drive.google.com/drive/folders/1I7p_bFSERaBd0yZOf8EE0m7t_warcLZj' },
      { nome: 'AD33', url: 'https://drive.google.com/drive/folders/1yGPFozp_zsWSujtSGMp3IDG6z5aDNR0B' },
      { nome: 'AD34', url: 'https://drive.google.com/drive/folders/1DSN4j3lCbQv35wNs09LzBC1xBmRyBnef' },
      { nome: 'AD35', url: 'https://drive.google.com/drive/folders/16ep_H7h4xwSDtCRp7DG4GLvWoRwmOCT3' },
      { nome: 'AD36', url: 'https://drive.google.com/drive/folders/1Ig5t8ONQ3thVn2BgZwRRtGifyFjFvBbg' },
      { nome: 'AD37', url: 'https://drive.google.com/drive/folders/1XaJ64bOHHfyd0xt0FugvLQwbwSiYOgRz' },
      { nome: 'AD38', url: 'https://drive.google.com/drive/folders/16zbJxnY4dBVExGLcGOB3u6pwBHXlsSKw' },
      { nome: 'AD39', url: 'https://drive.google.com/drive/folders/1dJ8Y3YSlr5fB-8M2Yi3LmQ6Qj-hdkpDH' },
      { nome: 'AD40', url: 'https://drive.google.com/drive/folders/1WafbQZWZ3BKRxs5ceqmq6AhaxrWttZZ8' },
      { nome: 'AD41', url: 'https://drive.google.com/drive/folders/1m4kyGVsC7jFc05MjVC5O0o82Q6vwYdW8' },
      { nome: 'AD42', url: 'https://drive.google.com/drive/folders/1x4ep-zgy0FRyPaLggVew04fMwnFG9VHt' },
      { nome: 'AD43', url: 'https://drive.google.com/drive/folders/1PlINerxSqMNNTXksKiTsz1ds_bONBvPu' },
      { nome: 'AD44', url: 'https://drive.google.com/drive/folders/1wbq20Z0EfDOFM-gzGLfYeBixfNe19LJG' },
      { nome: 'AD45', url: 'https://drive.google.com/drive/folders/1p1qmLWygvI5uPfwVDfRu-ts_DvMJqf9-' },
      { nome: 'AD46', url: 'https://drive.google.com/drive/folders/1GY2rWVNH4-IZ9fpu1s7zhj1yWKmHa65r' },
      { nome: 'AD47', url: 'https://drive.google.com/drive/folders/1MVB-_rt5VXuf-PBFprjtBki-81cRxk2g' },
      { nome: 'AD48', url: 'https://drive.google.com/drive/folders/1AG6-vSdMZMs7dZ7ocBxewGn7BJhqsU3e' },
      { nome: 'AD49', url: 'https://drive.google.com/drive/folders/1V0Y8cvQERVu6q3tKySB-ydAjWsjE6HK8' },
      { nome: 'AD50', url: 'https://drive.google.com/drive/folders/18AeBPaGY6whTbppUeIvjbtJMEiQdbg2-' },
    ],
  },
];

const PAGINAS_STORAGE_KEY = 'sos-paginas-no-ar';

function ChecklistPaginas() {
  const { status, toggle } = useChecklistStatus(
    'pagina',
    PAGINAS_STORAGE_KEY,
    Object.fromEntries(paginas.map((p) => [p.url, p.noAr]))
  );
  const [copiado, setCopiado] = useState<string | null>(null);


  const copiarLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopiado(url);
    setTimeout(() => setCopiado((k) => (k === url ? null : k)), 1500);
  };

  const ativos = paginas.filter((p) => status[p.url]).length;

  return (
    <div className="surface px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="section-label">Checklist de Páginas</span>
        <span className="text-[10px] text-muted-foreground">
          {ativos}/{paginas.length} no ar
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {paginas.map((p) => {
          const noAr = !!status[p.url];
          return (
            <div
              key={p.url}
              className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => toggle(p.url)}
                  aria-label={`Marcar ${p.nome} como no ar`}
                  className={`w-4 h-4 shrink-0 rounded-sm flex items-center justify-center text-[10px] font-bold cursor-pointer transition-colors ${
                    noAr ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {noAr ? '✓' : ''}
                </button>
                <span className="text-xs font-medium">{p.nome}</span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-muted-foreground hover:underline truncate"
                >
                  {p.url}
                </a>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => copiarLink(p.url)}
                  title="Copiar link da página"
                  aria-label={`Copiar link da página ${p.nome}`}
                  className="p-1 rounded-sm cursor-pointer text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                >
                  {copiado === p.url ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => toggle(p.url)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm cursor-pointer transition-colors ${
                    noAr ? 'bg-[#2f5220] text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {noAr ? 'NO AR · TRÁFEGO' : 'FORA DO AR'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


const STORAGE_KEY = 'sos-criativos-no-ar';

function ChecklistCriativos() {
  const { status, toggle } = useChecklistStatus('criativo', STORAGE_KEY);
  const [copiado, setCopiado] = useState<string | null>(null);


  const copiarLink = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopiado(key);
    setTimeout(() => setCopiado((k) => (k === key ? null : k)), 1500);
  };

  return (
    <div className="surface px-5 py-4">
      <span className="section-label">Checklist de Criativos</span>
      <div className="mt-3 flex items-center gap-2 rounded-sm border border-border bg-muted/40 px-3 py-2">
        <span className="text-primary text-sm">✉️</span>
        <span className="text-[11px] text-muted-foreground">
          Abrir no email da empresa
        </span>
      </div>
      <div className="mt-4 space-y-5">
        {criativos.map((g) => {
          const total = g.itens.length;
          const ativos = g.itens.filter((i) => status[`${g.grupo}:${i.nome}`]).length;
          return (
            <div key={g.grupo}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{g.grupo}</span>
                  <a
                    href={g.pasta}
                    target="_top"
                    className="text-[11px] text-muted-foreground hover:underline"
                  >
                    Abrir pasta no Drive →
                  </a>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {ativos}/{total} no ar
                </span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {g.itens.map((c) => {
                  const key = `${g.grupo}:${c.nome}`;
                  const noAr = !!status[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-sm border border-border px-2.5 py-1.5"
                    >
                      <a
                        href={c.url}
                        target="_top"
                        className="flex items-center gap-2 min-w-0 hover:underline"
                      >
                        <span
                          className={`w-4 h-4 shrink-0 rounded-sm flex items-center justify-center text-[10px] font-bold ${
                            noAr ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {noAr ? '✓' : ''}
                        </span>
                        <span className="text-xs font-medium truncate">{c.nome}</span>
                      </a>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => copiarLink(key, c.url)}
                          title="Copiar link da pasta do criativo"
                          aria-label={`Copiar link da pasta do criativo ${c.nome}`}
                          className="p-1 rounded-sm cursor-pointer text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                        >
                          {copiado === key ? (
                            <Check size={13} className="text-primary" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggle(key)}
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-sm cursor-pointer transition-colors ${
                            noAr ? 'bg-[#2f5220] text-white' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {noAr ? 'NO AR' : 'FORA DO AR'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


export function Planejamento() {
  return (
    <div className="space-y-4">
    <div className="surface px-5 py-4">
      <span className="section-label">Planejamento · Cronograma da Campanha</span>


      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {semana.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[11px] font-medium py-1.5 rounded-sm ${
              i >= 5 ? 'bg-[#4a4a4a] text-white' : 'bg-[#bdbdbd] text-[#1a1a1a]'
            }`}
          >
            {d}
          </div>
        ))}

        {dias.map((dia, i) =>
          dia ? (
            <div key={i} className="space-y-1">
              <div className="text-center text-[11px] text-muted-foreground">{dia.data}</div>
              <div
                className={`text-center text-[11px] py-1.5 rounded-sm truncate ${
                  estilos[dia.tipo ?? 'venda']
                }`}
                title={dia.label}
              >
                {dia.label}
              </div>
            </div>
          ) : (
            <div key={i} />
          )
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {[
          ['Briefing', 'briefing'],
          ['Produção', 'producao'],
          ['Start campanha', 'start'],
          ['Venda de ingressos', 'venda'],
          ['Feriado', 'feriado'],
          ['Dia da live', 'live'],
          ['Debriefing', 'debriefing'],
        ].map(([nome, tipo]) => (
          <div key={tipo} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm ${estilos[tipo]}`} />
            <span className="text-[10px] text-muted-foreground">{nome}</span>
          </div>
        ))}
      </div>
    </div>

    <ChecklistPaginas />
    <ChecklistCriativos />
    </div>
  );
}

