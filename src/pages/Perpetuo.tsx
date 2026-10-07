import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calendar } from 'lucide-react';
import { usePerpetuo, PerpetuoCriativo, PerpetuoLp } from '@/hooks/usePerpetuo';
import { Abas, Aviso, KpiCard, KpiGrid, NaoDisponivel, PageBody, PageHeader, Secao, Tabela, fmtBrl, fmtNum, fmtPct } from '@/components/shared';

type Aba = 'criativos' | 'lps';

function hojeSP() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }
function addDias(iso: string, n: number) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }
function dataBR(iso?: string | null) { return iso ? iso.split('-').reverse().join('/') : '—'; }

type Preset = { rotulo: string; de: string; ate: string };
function presets(): Preset[] {
  const hoje = hojeSP(); const ontem = addDias(hoje, -1);
  const mesIni = hoje.slice(0, 8) + '01';
  const mesPassadoFim = addDias(mesIni, -1); const mesPassadoIni = mesPassadoFim.slice(0, 8) + '01';
  return [
    { rotulo: `${hoje.slice(0, 4)} até ontem`, de: `${hoje.slice(0, 4)}-01-01`, ate: ontem },
    { rotulo: 'Últimos 90 dias', de: addDias(ontem, -89), ate: ontem },
    { rotulo: 'Últimos 30 dias', de: addDias(ontem, -29), ate: ontem },
    { rotulo: 'Últimos 7 dias', de: addDias(ontem, -6), ate: ontem },
    { rotulo: 'Este mês', de: mesIni, ate: hoje },
    { rotulo: 'Mês passado', de: mesPassadoIni, ate: mesPassadoFim },
  ];
}

export default function Perpetuo() {
  const { aba = 'criativos' } = useParams<{ aba: Aba }>();
  const nav = useNavigate();
  const lista = useMemo(presets, []);
  const [de, setDe] = useState(lista[0].de);
  const [ate, setAte] = useState(lista[0].ate);
  const [custom, setCustom] = useState(false);
  const { data, error, isFetching, refetch } = usePerpetuo(de, ate);

  const r = data?.resumo;
  const f = data?.fontes;
  const diario = useMemo(() => (data?.diario ?? []).map((d) => ({ ...d, dia: d.data.slice(8, 10) + '/' + d.data.slice(5, 7) })), [data]);
  const motivoMeta = f && !f.meta_no_periodo ? `Sem dados da conta Meta no período (último dia carregado: ${dataBR(f.meta_ate)})` : undefined;
  const motivoFunil = f && !f.funil_no_periodo ? `Sem dados do funil no período (último dia carregado: ${dataBR(f.funil_ate)})` : undefined;

  const aplicarPreset = (p: Preset) => { setCustom(false); setDe(p.de); setAte(p.ate); };
  const aplicarCiclo = (c: { inicio: string; fim: string }) => { setCustom(false); setDe(c.inicio); setAte(c.fim > hojeSP() ? addDias(hojeSP(), -1) : c.fim); };
  const presetAtivo = !custom && lista.find((p) => p.de === de && p.ate === ate)?.rotulo;
  const cicloAtivo = !custom && data?.ciclos.find((c) => c.inicio === de && (c.fim === ate || (c.fim > hojeSP() && ate === addDias(hojeSP(), -1))))?.ciclo;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo={<>Perpétuo RGV · Funil por <span className="text-primary">{aba === 'lps' ? 'LP' : 'criativo'}</span></>}
        subtitulo={<>Conta Meta PERPETUO RGV e funil do HubSpot {data && `· mídia até ${dataBR(f?.meta_ate)} · funil até ${dataBR(f?.funil_ate)}`}</>}
        onAtualizar={() => refetch()}
        atualizando={isFetching}
      />
      <PageBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Abas<Aba> valor={aba as Aba} onChange={(v) => nav(`/perpetuo/${v}`)} itens={[{ valor: 'criativos', rotulo: 'Por criativo' }, { valor: 'lps', rotulo: 'Por LP' }]} />
          <div className="flex flex-wrap items-center gap-1.5">
            {lista.map((p) => (
              <button key={p.rotulo} onClick={() => aplicarPreset(p)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${presetAtivo === p.rotulo ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground border-border hover:text-foreground hover:bg-secondary'}`}>
                {p.rotulo}
              </button>
            ))}
            <button onClick={() => setCustom(true)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${custom ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground border-border hover:text-foreground hover:bg-secondary'}`}>
              <Calendar className="w-3 h-3" /> Personalizado
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {data && data.ciclos.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Ciclos</span>
              {data.ciclos.map((c) => (
                <button key={c.ciclo} onClick={() => aplicarCiclo(c)} title={`${dataBR(c.inicio)} a ${dataBR(c.fim)}`}
                  className={`px-2 py-0.5 rounded text-[11px] mono border ${cicloAtivo === c.ciclo ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground border-border hover:text-foreground'}`}>
                  {c.ciclo}
                </button>
              ))}
            </div>
          )}
          {custom && (
            <div className="flex items-center gap-2 surface px-3 py-1.5 rounded-lg">
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="bg-transparent text-xs mono text-foreground outline-none" />
              <span className="text-muted-foreground text-[10px]">a</span>
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="bg-transparent text-xs mono text-foreground outline-none" />
            </div>
          )}
          <span className="text-[11px] text-muted-foreground mono">{dataBR(de)} – {dataBR(ate)}</span>
        </div>

        {error && <div className="surface p-4 text-sm text-red-400">{(error as Error).message}</div>}
        {!data && !error && <div className="text-sm text-muted-foreground">Carregando…</div>}

        {data && r && (
          <>
            <Secao titulo="Mídia · conta PERPETUO RGV">
              <KpiGrid cols={8}>
                <KpiCard label="Investimento" value={fmtBrl(r.investimento)} highlight motivo={motivoMeta} />
                <KpiCard label="Impressões" value={fmtNum(r.impressoes)} motivo={motivoMeta} />
                <KpiCard label="Alcance" value={fmtNum(r.alcance)} motivo={motivoMeta} />
                <KpiCard label="Cliques" value={fmtNum(r.cliques)} motivo={motivoMeta} />
                <KpiCard label="CPM" value={fmtBrl(r.cpm, 2)} motivo={motivoMeta} />
                <KpiCard label="CTR" value={fmtPct(r.ctr, 2)} motivo={motivoMeta} />
                <KpiCard label="CPC" value={fmtBrl(r.cpc, 2)} motivo={motivoMeta} />
                <KpiCard label="CPMQL" value={fmtBrl(r.cpl, 2)} highlight motivo={motivoMeta ?? motivoFunil} />
              </KpiGrid>
            </Secao>

            <Secao titulo="Funil · HubSpot">
              <KpiGrid cols={8}>
                <KpiCard label="MQL" value={fmtNum(r.mql)} highlight motivo={motivoFunil} />
                <KpiCard label="Reuniões agendadas" value={fmtNum(r.reunioes_agendadas)} motivo={motivoFunil} />
                <KpiCard label="Reuniões realizadas" value={fmtNum(r.reunioes_realizadas)} motivo={motivoFunil} />
                <KpiCard label="No-show" value={fmtNum(r.noshow)} motivo={motivoFunil} />
                <KpiCard label="Custo por reunião" value={fmtBrl(r.custo_reuniao, 2)} motivo={motivoMeta ?? motivoFunil} />
                <KpiCard label="Vendas" value={fmtNum(r.vendas)} highlight motivo={motivoFunil} />
                <KpiCard label="CAC" value={fmtBrl(r.cac, 2)} motivo={motivoMeta ?? motivoFunil} />
                <KpiCard label="Faturamento · ROAS" value={r.faturamento == null ? null : `${fmtBrl(r.faturamento)}${r.roas != null ? ` · ${r.roas}x` : ''}`} motivo={motivoFunil} />
              </KpiGrid>
            </Secao>

            <Secao titulo="Investimento e MQL por dia">
              {diario.length === 0 ? <NaoDisponivel motivo="Sem dados diários no período" /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={diario}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(228 12% 14%)" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fill: 'hsl(220 10% 40%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="inv" tick={{ fill: 'hsl(220 10% 40%)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                    <YAxis yAxisId="mql" orientation="right" tick={{ fill: 'hsl(220 10% 40%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                      formatter={(v: number, n: string) => [n === 'Investimento' ? fmtBrl(v) : fmtNum(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="inv" dataKey="investimento" name="Investimento" fill="hsl(0 65% 50%)" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="mql" dataKey="mql" name="MQL" stroke="hsl(45 70% 55%)" strokeWidth={2} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </Secao>

            {aba === 'lps' ? <PorLp linhas={data.por_lp} /> : <PorCriativo linhas={data.por_criativo} />}
          </>
        )}
      </PageBody>
    </div>
  );
}

const ND = <NaoDisponivel />;

function PorCriativo({ linhas }: { linhas: PerpetuoCriativo[] | null }) {
  const vazio = (
    <div className="space-y-2">
      <p><NaoDisponivel className="not-italic font-semibold text-foreground" /> por criativo.</p>
      <p>Os números por peça dependem de duas conexões do ETL que ainda não existem: insights da Meta no nível de anúncio (hoje só vem o total da conta) e o campo utm_content dos contatos do HubSpot. Quando elas entrarem, a tabela preenche sozinha.</p>
    </div>
  );
  return (
    <Secao titulo="Peças criativas">
      <Tabela<PerpetuoCriativo>
        minWidth="900px"
        colunas={[
          { chave: 'criativo', titulo: 'Criativo', alinhar: 'left', render: (l) => l.criativo },
          { chave: 'inv', titulo: 'Investimento', render: (l) => fmtBrl(l.investimento) ?? ND },
          { chave: 'imp', titulo: 'Impressões', render: (l) => fmtNum(l.impressoes) ?? ND },
          { chave: 'cli', titulo: 'Cliques', render: (l) => fmtNum(l.cliques) ?? ND },
          { chave: 'ctr', titulo: 'CTR', render: (l) => fmtPct(l.ctr, 2) ?? ND },
          { chave: 'leads', titulo: 'Leads', render: (l) => fmtNum(l.leads) ?? ND },
          { chave: 'mql', titulo: 'MQL', render: (l) => fmtNum(l.mql) ?? ND },
          { chave: 'cpl', titulo: 'CPL', render: (l) => fmtBrl(l.cpl, 2) ?? ND },
          { chave: 'vendas', titulo: 'Vendas', render: (l) => fmtNum(l.vendas) ?? ND },
        ]}
        linhas={linhas ?? []}
        chave={(l) => l.criativo}
        vazio={linhas ? 'Sem criativos no período' : vazio}
      />
    </Secao>
  );
}

function PorLp({ linhas }: { linhas: PerpetuoLp[] | null }) {
  const vazio = (
    <div className="space-y-2">
      <p><NaoDisponivel className="not-italic font-semibold text-foreground" /> por página.</p>
      <p>Os números por LP dependem de o ETL trazer a página de conversão de cada contato do HubSpot (URL da primeira conversão) e as visualizações de página da Meta. Quando isso entrar, a tabela preenche sozinha.</p>
    </div>
  );
  return (
    <Secao titulo="Páginas (LPs)">
      <Tabela<PerpetuoLp>
        minWidth="760px"
        colunas={[
          { chave: 'pagina', titulo: 'Página', alinhar: 'left', render: (l) => l.pagina },
          { chave: 'views', titulo: 'Visualizações', render: (l) => fmtNum(l.visualizacoes) ?? ND },
          { chave: 'leads', titulo: 'Leads', render: (l) => fmtNum(l.leads) ?? ND },
          { chave: 'conv', titulo: 'Conversão', render: (l) => fmtPct(l.conversao, 2) ?? ND },
          { chave: 'mql', titulo: 'MQL', render: (l) => fmtNum(l.mql) ?? ND },
          { chave: 'vendas', titulo: 'Vendas', render: (l) => fmtNum(l.vendas) ?? ND },
        ]}
        linhas={linhas ?? []}
        chave={(l) => l.pagina}
        vazio={linhas ? 'Sem páginas no período' : vazio}
      />
      <div className="mt-3"><Aviso>Nenhum número desta aba é copiado de outro painel: tudo vem do Supabase r1-indicadores.</Aviso></div>
    </Secao>
  );
}
