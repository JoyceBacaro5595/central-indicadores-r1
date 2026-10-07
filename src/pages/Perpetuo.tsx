import { ReactNode, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, ImageOff } from 'lucide-react';
import { usePerpetuo, PerpetuoMetricas, PerpetuoMetas, PerpetuoFunil, PerpetuoDescritivo } from '@/hooks/usePerpetuo';
import { NaoDisponivel, PageBody, PageHeader, fmtBrl, fmtNum, fmtPct } from '@/components/shared';

/* ─── Perpétuo RGV · Fluxo de Tráfego ───
 * Layout reproduzido do painel de referência (Funil por criativo · RGV): cabeçalho com abas
 * Campanhas | Peças criativas | Páginas, cartão da conta Meta e período; título em serifa com
 * destaque dourado; faixa do funil em 7 etapas (Lead no CRM → Venda); lista com controles de
 * visão, ordenação, filtro e busca; régua de metas do ciclo. Nenhum número vem da referência:
 * tudo sai da RPC perpetuo_funil_v2 do Supabase r1-indicadores e nulo vira "Não disponível". */

type Aba = 'campanhas' | 'criativos' | 'lps';
const CONTA_META = { nome: 'PERPETUO RGV', id: '696363384474339' };

/* ─── datas e presets ─── */
function hojeSP() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }
function addDias(iso: string, n: number) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }
function dataBR(iso?: string | null) { return iso ? iso.split('-').reverse().join('/') : '—'; }
function dataCurta(iso?: string | null) { return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—'; }

type Preset = { chave: string; rotulo: string; de: string; ate: string };
function presets(): Preset[] {
  const hoje = hojeSP(); const ontem = addDias(hoje, -1);
  const mesIni = hoje.slice(0, 8) + '01';
  const mesPassadoFim = addDias(mesIni, -1); const mesPassadoIni = mesPassadoFim.slice(0, 8) + '01';
  return [
    { chave: 'ano', rotulo: `${hoje.slice(0, 4)} até ontem`, de: `${hoje.slice(0, 4)}-01-01`, ate: ontem },
    { chave: '90', rotulo: 'Últimos 90 dias', de: addDias(ontem, -89), ate: ontem },
    { chave: '30', rotulo: 'Últimos 30 dias', de: addDias(ontem, -29), ate: ontem },
    { chave: '7', rotulo: 'Últimos 7 dias', de: addDias(ontem, -6), ate: ontem },
    { chave: 'mes', rotulo: 'Este mês', de: mesIni, ate: hoje },
    { chave: 'mes-1', rotulo: 'Mês passado', de: mesPassadoIni, ate: mesPassadoFim },
  ];
}

/* ─── formatação ─── */
const fmtBrlCurto = (v: number | null | undefined) => {
  if (v == null) return null;
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} mi`;
  if (a >= 1e4) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} mil`;
  return fmtBrl(v);
};
const divide = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || b === 0 ? null : a / b);
const pp = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} pp`;

/* ─── metas: situação de uma taxa frente ao plano do ciclo ─── */
type Situacao = 'meta' | 'perto' | 'longe' | 'poucos' | 'sem-meta' | 'nd';
function situacao(taxa: number | null | undefined, meta: number | null | undefined, base: number | null | undefined): Situacao {
  if (taxa == null) return 'nd';
  if (base != null && base < 5) return 'poucos';
  if (meta == null) return 'sem-meta';
  if (taxa >= meta) return 'meta';
  if (taxa >= meta * 0.9) return 'perto';
  return 'longe';
}
const COR: Record<Situacao, string> = {
  meta: 'bg-emerald-500/15 text-emerald-400',
  perto: 'bg-amber-500/15 text-amber-400',
  longe: 'bg-red-500/15 text-red-400',
  poucos: 'bg-muted text-muted-foreground',
  'sem-meta': 'bg-secondary text-foreground/80',
  nd: 'text-muted-foreground',
};
/** Custo frente ao total do período: abaixo → verde, mais de 10% acima → vermelho. */
function corCusto(v: number | null | undefined, ref: number | null | undefined) {
  if (v == null || ref == null || ref === 0) return 'text-foreground';
  return v <= ref ? 'text-emerald-400' : v > ref * 1.1 ? 'text-red-400' : 'text-foreground';
}
const PONTO: Record<Exclude<Situacao, 'sem-meta' | 'nd'>, string> = { meta: 'bg-emerald-400', perto: 'bg-amber-400', longe: 'bg-red-400', poucos: 'bg-muted-foreground' };

/* ─── etapas do funil ─── */
type Etapa = {
  chave: string; rotulo: string; curto: string; sub: string;
  valor: (m: PerpetuoMetricas) => number | null | undefined;
  taxa?: { rotulo: string; v: (m: PerpetuoMetricas) => number | null | undefined; meta: keyof PerpetuoMetas };
  custo: { rotulo: string; v: (m: PerpetuoMetricas) => number | null | undefined };
};
const ETAPAS: Etapa[] = [
  { chave: 'leads', rotulo: 'Lead no CRM', curto: 'Leads', sub: 'CRM', valor: (m) => m.leads_crm, custo: { rotulo: 'Custo por lead', v: (m) => m.cpl } },
  { chave: 'mql', rotulo: 'Lead no perfil (MQL)', curto: 'No perfil', sub: 'MQL', valor: (m) => m.mql,
    taxa: { rotulo: 'No perfil', v: (m) => m.taxa_mql, meta: 'qualificacao_mql' as keyof PerpetuoMetas }, custo: { rotulo: 'Custo por MQL', v: (m) => m.cpmql } },
  { chave: 'contato', rotulo: 'Contato efetivo', curto: 'Contato', sub: 'conexão', valor: (m) => m.contato_efetivo,
    taxa: { rotulo: 'Conexão', v: (m) => m.taxa_contato, meta: 'conexao' }, custo: { rotulo: 'Custo por contato', v: (m) => divide(m.investimento, m.contato_efetivo) } },
  { chave: 'sql', rotulo: 'SQL', curto: 'SQL', sub: 'qualificação', valor: (m) => m.sql,
    taxa: { rotulo: 'Qualificação', v: (m) => m.taxa_sql, meta: 'qualificacao' }, custo: { rotulo: 'Custo por SQL', v: (m) => divide(m.investimento, m.sql) } },
  { chave: 'agendado', rotulo: 'Agendamento marcado', curto: 'Ag. marcado', sub: 'agendamento', valor: (m) => m.reunioes_agendadas,
    taxa: { rotulo: 'Agendamento', v: (m) => m.taxa_agendamento, meta: 'agendamento' }, custo: { rotulo: 'Custo por ag. marcado', v: (m) => divide(m.investimento, m.reunioes_agendadas) } },
  { chave: 'realizado', rotulo: 'Agendamento realizado', curto: 'Ag. realizado', sub: 'comparecimento', valor: (m) => m.reunioes_realizadas,
    taxa: { rotulo: 'Comparecimento', v: (m) => m.taxa_comparecimento, meta: 'comparecimento' }, custo: { rotulo: 'Custo por ag. realizado', v: (m) => m.custo_reuniao } },
  { chave: 'venda', rotulo: 'Venda', curto: 'Venda', sub: 'fechamento', valor: (m) => m.vendas,
    taxa: { rotulo: 'Fechamento', v: (m) => m.taxa_fechamento, meta: 'fechamento' }, custo: { rotulo: 'Custo por venda (CAC)', v: (m) => m.cac } },
];
const metaDe = (metas: PerpetuoMetas | null | undefined, k: keyof PerpetuoMetas) => (metas ? (metas[k] as number | null | undefined) ?? null : null);

/* ─── textos por aba ─── */
const ABAS: { valor: Aba; rotulo: string; eyebrow: string; titulo: string; destaque: string; secao: string; nome: string; plural: string }[] = [
  { valor: 'campanhas', rotulo: 'Campanhas', eyebrow: 'Meta Ads · Perpétuo RGV · campanhas que geram lead', titulo: 'Do lead à venda,', destaque: 'campanha a campanha', secao: 'Campanhas', nome: 'campanha', plural: 'campanhas' },
  { valor: 'criativos', rotulo: 'Peças criativas', eyebrow: 'Meta Ads · Perpétuo RGV · peças criativas', titulo: 'Do lead à venda,', destaque: 'peça a peça', secao: 'Peças criativas', nome: 'peça', plural: 'peças' },
  { valor: 'lps', rotulo: 'Páginas', eyebrow: 'Meta Ads · Perpétuo RGV · todas as campanhas', titulo: 'Páginas de destino,', destaque: 'somadas entre campanhas', secao: 'Páginas', nome: 'página', plural: 'páginas' },
];

type Item = PerpetuoMetricas & PerpetuoDescritivo & { id: string; nome: string };
function itensDaAba(aba: Aba, d: PerpetuoFunil | undefined): Item[] | null | undefined {
  if (!d) return undefined;
  // A RPC pode devolver rótulo nulo (front_daily.label é opcional): mostramos o id como nome.
  const rotulo = (v: string | null | undefined, id: string) => (v && v.trim() ? v : `Sem rótulo · ${id}`);
  if (aba === 'campanhas') return d.por_campanha === undefined ? null : d.por_campanha?.map((c) => ({ ...c, nome: rotulo(c.campanha, c.id) })) ?? null;
  if (aba === 'criativos') return d.por_criativo?.map((c) => ({ ...c, nome: rotulo(c.criativo, c.id) })) ?? null;
  return d.por_lp?.map((l) => ({ ...l, nome: rotulo(l.pagina, l.id) })) ?? null;
}
const MOTIVO_ND: Record<Aba, string> = {
  campanhas: 'A quebra por campanha ainda não é entregue pela RPC perpetuo_funil_v2 (só total, criativo e LP). Os totais acima já são os da conta.',
  criativos: 'O ETL ainda não gravou dados por criativo em rgv.front_daily (grão creative). Quando a carga da Meta no nível de anúncio e a atribuição entrarem, a lista preenche sozinha.',
  lps: 'O ETL ainda não gravou dados por página em rgv.front_daily (grão lp). Quando a atribuição por página de destino entrar, a lista preenche sozinha.',
};

/* ═══════════════════════════ página ═══════════════════════════ */
export default function Perpetuo() {
  const { aba: abaParam } = useParams<{ aba: Aba }>();
  const aba: Aba = abaParam === 'criativos' || abaParam === 'lps' ? abaParam : 'campanhas';
  const cfg = ABAS.find((a) => a.valor === aba)!;
  const nav = useNavigate();
  const lista = useMemo(presets, []);
  const [preset, setPreset] = useState<string>(lista[0].chave);
  const [de, setDe] = useState(lista[0].de);
  const [ate, setAte] = useState(lista[0].ate);
  const { data, error, isFetching, refetch } = usePerpetuo(de, ate);

  const aplicarPreset = (chave: string) => {
    setPreset(chave);
    const p = lista.find((x) => x.chave === chave);
    if (p) { setDe(p.de); setAte(p.ate); return; }
    const c = data?.ciclos.find((x) => x.ciclo === chave);
    if (c) { setDe(c.inicio); setAte(c.fim > hojeSP() ? addDias(hojeSP(), -1) : c.fim); }
  };
  const mudarData = (campo: 'de' | 'ate', v: string) => { setPreset('custom'); if (campo === 'de') setDe(v); else setAte(v); };

  const itens = itensDaAba(aba, data);
  const r = data?.resumo;
  const metas = data?.metas ?? null;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo={<>Perpétuo RGV · <span className="display text-lg font-normal">Fluxo de <span className="italic text-gold">Tráfego</span></span></>}
        subtitulo={<>Funil por campanha, criativo e página · Supabase r1-indicadores{data?.atualizado_em ? ` · atualizado em ${new Date(data.atualizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ' · mart ainda sem carga'}</>}
        onAtualizar={() => refetch()}
        atualizando={isFetching}
        acoes={
          <div className="hidden lg:flex items-center gap-2">
            <ContaPill />
            <select value={preset} onChange={(e) => aplicarPreset(e.target.value)} className="select-r1">
              {lista.map((p) => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}
              {data && data.ciclos.length > 0 && (
                <optgroup label="Ciclos">
                  {data.ciclos.map((c) => <option key={c.ciclo} value={c.ciclo}>{c.ciclo} · {dataCurta(c.inicio)} a {dataCurta(c.fim)}</option>)}
                </optgroup>
              )}
              <option value="custom">Personalizado</option>
            </select>
            <input type="date" value={de} onChange={(e) => mudarData('de', e.target.value)} className="input-r1 mono" />
            <input type="date" value={ate} onChange={(e) => mudarData('ate', e.target.value)} className="input-r1 mono" />
          </div>
        }
      />
      <PageBody className="space-y-5">
        {/* abas + controles (os controles repetem aqui em telas menores) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="toggle-group">
            {ABAS.map((a) => (
              <button key={a.valor} onClick={() => nav(`/perpetuo/trafego/${a.valor}`)} className={`toggle-item ${aba === a.valor ? 'toggle-item-ativo' : ''}`}>{a.rotulo}</button>
            ))}
          </div>
          <div className="flex lg:hidden flex-wrap items-center gap-2">
            <ContaPill />
            <select value={preset} onChange={(e) => aplicarPreset(e.target.value)} className="select-r1">
              {lista.map((p) => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}
              {data?.ciclos.map((c) => <option key={c.ciclo} value={c.ciclo}>{c.ciclo}</option>)}
              <option value="custom">Personalizado</option>
            </select>
            <input type="date" value={de} onChange={(e) => mudarData('de', e.target.value)} className="input-r1 mono" />
            <input type="date" value={ate} onChange={(e) => mudarData('ate', e.target.value)} className="input-r1 mono" />
          </div>
        </div>

        {/* título da visão + investimento do período */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow">{cfg.eyebrow}</div>
            <h2 className="display text-4xl md:text-[44px] leading-tight mt-1 text-foreground">
              {cfg.titulo} <span className="italic text-gold">{cfg.destaque}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span>{dataBR(de)} a {dataBR(ate)}</span>
              <span>{itens === undefined ? '…' : itens === null ? <>Quebra por {cfg.nome}: <NaoDisponivel /></> : <><b className="text-foreground">{itens.length}</b> {itens.length === 1 ? cfg.nome : cfg.plural}</>}</span>
              <span>CRM: HubSpot · base do ETL (Supabase r1-indicadores)</span>
              <span>Meta coletado em {data ? (data.fontes.meta_ate ? dataBR(data.fontes.meta_ate) : <NaoDisponivel />) : '…'}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow">Investimento no período</div>
            <div className="display text-4xl md:text-[40px] leading-none mt-1 text-foreground">{r ? fmtBrl(r.investimento, 2) ?? <NaoDisponivel className="text-xl" /> : '…'}</div>
            <div className="text-sm text-muted-foreground mt-1">CAC {r ? fmtBrl(r.cac) ?? <NaoDisponivel /> : '…'}</div>
          </div>
        </div>

        {error && <div className="surface p-4 text-sm text-red-400">{(error as Error).message}</div>}
        {!data && !error && <div className="text-sm text-muted-foreground">Carregando o funil…</div>}

        {r && <FaixaFunil m={r} metas={metas} />}

        {data && <Lista key={aba} aba={aba} secao={cfg.secao} nome={cfg.nome} itens={itens ?? null} metas={metas} ref={r ?? null} />}

        <ComoLer />
      </PageBody>
    </div>
  );
}

function ContaPill() {
  return (
    <div className="inline-flex items-center gap-2 h-9 rounded-lg border border-border bg-secondary/40 px-3">
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      <span className="text-xs font-bold text-foreground">{CONTA_META.nome}</span>
      <span className="text-[11px] text-muted-foreground mono">{CONTA_META.id}</span>
    </div>
  );
}

/* ─── faixa do funil (7 etapas) ─── */
function FaixaFunil({ m, metas }: { m: PerpetuoMetricas; metas: PerpetuoMetas | null }) {
  const base = m.leads_crm;
  return (
    <div className="surface overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-border">
        {ETAPAS.map((e, i) => {
          const v = e.valor(m);
          const largura = v != null && base ? Math.max(2, Math.min(100, (v / base) * 100)) : 0;
          const taxa = e.taxa?.v(m);
          const meta = e.taxa ? metaDe(metas, e.taxa.meta) : null;
          const custo = e.custo.v(m);
          return (
            <div key={e.chave} className={`p-4 ${i >= 4 ? 'md:border-t md:border-border xl:border-t-0' : ''}`}>
              <div className="text-sm font-bold text-foreground">{e.rotulo}</div>
              <div className="display text-[34px] leading-none mt-2 text-foreground">{fmtNum(v) ?? <NaoDisponivel className="text-base" />}</div>
              <div className="h-1.5 rounded-full bg-muted mt-3 overflow-hidden"><div className="h-full rounded-full bg-violet-400/80" style={{ width: `${largura}%` }} /></div>
              <div className="mt-3 space-y-1 text-xs">
                {e.chave === 'leads' ? (
                  <>
                    <Linha k="Leads no Meta" v={fmtNum(m.leads_pixel)} />
                    <Linha k="CPL no Meta" v={fmtBrl(m.cpl_pixel)} />
                  </>
                ) : e.chave === 'mql' ? (
                  <>
                    <Linha k="No perfil" v={fmtPct(taxa)} />
                    <Linha k="MQL → venda" v={fmtPct(divide(m.vendas == null ? null : m.vendas * 100, m.mql), 2)} meta={metaDe(metas, 'mql_venda')} taxa={divide(m.vendas == null ? null : m.vendas * 100, m.mql)} />
                  </>
                ) : (
                  <>
                    <Linha k={e.taxa!.rotulo} v={fmtPct(taxa)} forte />
                    <Linha k="Meta" v={meta != null ? `${fmtPct(meta, 0)}${taxa != null ? ` · ${pp(taxa - meta)}` : ''}` : null} />
                  </>
                )}
              </div>
              <div className="mt-4 text-xs text-muted-foreground">{e.custo.rotulo}</div>
              <div className="display text-xl text-foreground">{fmtBrl(custo) ?? <NaoDisponivel className="text-sm" />}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Linha({ k, v, forte, meta, taxa }: { k: string; v: string | null | undefined; forte?: boolean; meta?: number | null; taxa?: number | null }) {
  const texto = v == null ? <NaoDisponivel /> : v;
  const extra = meta != null && taxa != null ? <span className="text-muted-foreground"> · meta {fmtPct(meta, 2)} · {pp(taxa - meta)}</span> : null;
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className={`mono ${forte ? 'font-bold text-foreground' : 'text-foreground/90'}`}>{texto}{extra}</span>
    </div>
  );
}

/* ─── lista (campanhas / peças / páginas) ─── */
type Visao = 'cards' | 'tabela' | 'custos' | 'taxas';
type Ordem = 'investimento' | 'leads' | 'mql' | 'vendas' | 'cac';
type Filtro = 'todas' | '20' | '100';
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'investimento', rotulo: 'Maior investimento' }, { valor: 'leads', rotulo: 'Mais leads' }, { valor: 'mql', rotulo: 'Mais MQL' },
  { valor: 'vendas', rotulo: 'Mais vendas' }, { valor: 'cac', rotulo: 'Menor CAC' },
];

function Lista({ aba, secao, nome, itens, metas, ref }: { aba: Aba; secao: string; nome: string; itens: Item[] | null; metas: PerpetuoMetas | null; ref: PerpetuoMetricas | null }) {
  const [visao, setVisao] = useState<Visao>(aba === 'campanhas' ? 'tabela' : 'cards');
  const [tipo, setTipo] = useState<string>('todas');
  const [status, setStatus] = useState<string>('todas');
  const temTipo = !!itens?.some((i) => i.tipo); const temStatus = !!itens?.some((i) => i.status);
  const [ordem, setOrdem] = useState<Ordem>('investimento');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');

  const visiveis = useMemo(() => {
    if (!itens) return [];
    const minimo = filtro === '20' ? 20 : filtro === '100' ? 100 : 0;
    const q = busca.trim().toLowerCase();
    const filtrados = itens.filter((i) => (minimo === 0 || (i.leads_crm ?? 0) >= minimo) && (!q || i.nome.toLowerCase().includes(q) || (i.nome_curto ?? '').toLowerCase().includes(q))
      && (tipo === 'todas' || i.tipo === tipo) && (status === 'todas' || i.status === status));
    const chave = (i: Item) => ordem === 'investimento' ? i.investimento : ordem === 'leads' ? i.leads_crm : ordem === 'mql' ? i.mql : ordem === 'vendas' ? i.vendas : i.cac;
    return [...filtrados].sort((a, b) => {
      const va = chave(a), vb = chave(b);
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return ordem === 'cac' ? va - vb : vb - va;
    });
  }, [itens, filtro, busca, ordem, tipo, status]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="display text-3xl text-foreground">{secao}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="toggle-group">
            {(['cards', 'tabela', 'custos', 'taxas'] as Visao[]).map((v) => (
              <button key={v} onClick={() => setVisao(v)} className={`toggle-item capitalize ${visao === v ? 'toggle-item-ativo' : ''}`}>{v}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Ordenar por
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="select-r1">
              {ORDENS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </label>
          <div className="toggle-group">
            {([['todas', 'Todas'], ['20', '20+ leads'], ['100', '100+ leads']] as [Filtro, string][]).map(([v, rot]) => (
              <button key={v} onClick={() => setFiltro(v)} className={`toggle-item ${filtro === v ? 'toggle-item-ativo' : ''}`}>{rot}</button>
            ))}
          </div>
          {temTipo && (
            <div className="toggle-group">
              {([['todas', 'Todas'], ['imagem', 'Imagem'], ['video', 'Vídeo']] as [string, string][]).map(([v, rot]) => (
                <button key={v} onClick={() => setTipo(v)} className={`toggle-item ${tipo === v ? 'toggle-item-ativo' : ''}`}>{rot}</button>
              ))}
            </div>
          )}
          {temStatus && (
            <div className="toggle-group">
              {([['todas', 'Todas'], ['no_ar', 'No ar'], ['pausado', 'Pausadas']] as [string, string][]).map(([v, rot]) => (
                <button key={v} onClick={() => setStatus(v)} className={`toggle-item ${status === v ? 'toggle-item-ativo' : ''}`}>{rot}</button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar ${nome}`} className="input-r1 pl-8 w-56" />
          </div>
        </div>
      </div>

      <ReguaMetas metas={metas} />

      {itens === null ? (
        <div className="surface p-5 text-sm text-muted-foreground leading-relaxed">
          <p><NaoDisponivel className="not-italic font-bold text-foreground" /> por {nome}.</p>
          <p className="mt-1">{MOTIVO_ND[aba]}</p>
        </div>
      ) : visao === 'cards' ? (
        visiveis.length === 0 ? <div className="surface px-5 py-6 text-sm text-muted-foreground">Nenhum resultado para esse filtro no período.</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {visiveis.map((it, idx) => <CardItem key={it.id} it={it} pos={idx + 1} aba={aba} metas={metas} ref={ref} />)}
          </div>
        )
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[1100px]">
              {/* cabeçalho das colunas */}
              <div className="grid grid-cols-[1.3fr_repeat(7,1fr)] gap-3 px-5 py-3 border-b border-border bg-secondary/30 text-xs">
                <div><div className="font-bold text-foreground">Investimento</div><div className="text-muted-foreground">leads Meta</div></div>
                {ETAPAS.map((e) => {
                  const meta = e.taxa ? metaDe(metas, e.taxa.meta) : null;
                  return (
                    <div key={e.chave}>
                      <div className="font-bold text-foreground">{e.curto}</div>
                      <div className="text-muted-foreground">{e.taxa && meta != null ? `meta ${fmtPct(meta, 0)}` : e.sub}</div>
                    </div>
                  );
                })}
              </div>
              {visiveis.length === 0 && <div className="px-5 py-6 text-sm text-muted-foreground">Nenhum resultado para esse filtro no período.</div>}
              {visiveis.map((it, idx) => <LinhaItem key={it.id} it={it} pos={idx + 1} visao={visao} metas={metas} />)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ReguaMetas({ metas }: { metas: PerpetuoMetas | null }) {
  const partes: [string, number | null | undefined, number | undefined][] = [
    ['conexão', metas?.conexao, 0], ['qualificação', metas?.qualificacao, 0], ['agendamento', metas?.agendamento, 0],
    ['comparecimento', metas?.comparecimento, 0], ['fechamento', metas?.fechamento, 0], ['MQL → venda', metas?.mql_venda, 2],
  ];
  const tem = partes.some(([, v]) => v != null);
  return (
    <div className="surface px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span><b className="text-foreground">Metas</b> · Plano do ciclo{metas?.ciclo ? ` ${metas.ciclo}` : ''}:</span>
      {tem ? partes.map(([k, v, casas]) => (
        <span key={k}>{k} <b className="text-foreground">{fmtPct(v, casas) ?? <NaoDisponivel />}</b></span>
      )) : <NaoDisponivel motivo="O plano de metas do ciclo ainda não está cadastrado no Supabase; quando a RPC devolver `metas`, a régua e as cores das taxas passam a usar o plano." />}
      <span className="ml-auto flex flex-wrap items-center gap-3">
        {([['meta', 'na meta'], ['perto', 'até 10% abaixo'], ['longe', 'mais de 10% abaixo'], ['poucos', 'menos de 5 casos']] as [keyof typeof PONTO, string][]).map(([s, rot]) => (
          <span key={s} className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${PONTO[s]}`} />{rot}</span>
        ))}
      </span>
    </div>
  );
}

function LinhaItem({ it, pos, visao, metas }: { it: Item; pos: number; visao: Visao; metas: PerpetuoMetas | null }) {
  return (
    <div className="px-5 py-4 border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs text-muted-foreground w-5 shrink-0">{pos}</span>
        <span className="text-sm font-bold text-foreground truncate" title={it.nome}>{it.nome}</span>
        {it.cobertura && (it.cobertura.midia_completa === false || it.cobertura.crm_completo === false || it.cobertura.historico_completo === false) && <span className="tag ml-auto shrink-0" title="Período com dias sem coleta completa de mídia, CRM ou histórico">dados parciais</span>}
      </div>
      <div className="grid grid-cols-[1.3fr_repeat(7,1fr)] gap-3 mt-2 pl-8">
        <Celula principal={fmtBrlCurto(it.investimento)} secundaria={it.leads_pixel != null ? `${fmtNum(it.leads_pixel)} leads Meta` : null} />
        {ETAPAS.map((e) => {
          const v = e.valor(it); const taxa = e.taxa?.v(it); const custo = e.custo.v(it);
          const meta = e.taxa ? metaDe(metas, e.taxa.meta) : null;
          const sit = e.taxa ? situacao(taxa, meta, v) : 'nd';
          const chip = e.taxa ? (
            <span className={`inline-block rounded px-1.5 py-0.5 mono text-[11px] font-semibold ${e.chave === 'mql' ? 'text-muted-foreground' : COR[sit]}`}>{fmtPct(taxa) ?? <NaoDisponivel />}</span>
          ) : null;
          if (visao === 'custos') return <Celula key={e.chave} principal={fmtBrl(custo)} secundaria={fmtNum(v)} />;
          if (visao === 'taxas') return <Celula key={e.chave} principal={e.taxa ? chip : fmtNum(v)} secundaria={e.taxa ? fmtNum(v) : null} />;
          return <Celula key={e.chave} principal={fmtNum(v)} secundaria={chip} terciaria={fmtBrl(custo)} />;
        })}
      </div>
    </div>
  );
}

function Celula({ principal, secundaria, terciaria }: { principal: ReactNode | null; secundaria?: ReactNode | null; terciaria?: ReactNode | null }) {
  return (
    <div className="min-w-0">
      <div className="text-base font-bold text-foreground mono">{principal ?? <NaoDisponivel className="text-xs" />}</div>
      {secundaria != null && <div className="text-xs text-muted-foreground mt-0.5">{secundaria}</div>}
      {terciaria != null && <div className="text-xs text-muted-foreground mono mt-0.5">{terciaria}</div>}
    </div>
  );
}

/* ─── card (peças e páginas) ─── */
function CardItem({ it, pos, aba, metas, ref }: { it: Item; pos: number; aba: Aba; metas: PerpetuoMetas | null; ref: PerpetuoMetricas | null }) {
  const semImagem = aba === 'lps' ? 'Sem foto da página' : 'Sem imagem do anúncio';
  const rodou = it.campanhas != null || it.anuncios != null || it.pecas != null;
  return (
    <article className="surface overflow-hidden flex flex-col">
      <div className="relative aspect-[4/3] bg-secondary/40 flex items-center justify-center text-xs text-muted-foreground">
        {it.thumb ? <img src={it.thumb} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" /> : <span className="flex items-center gap-2"><ImageOff className="w-4 h-4" />{semImagem}</span>}
        <span className="absolute top-3 left-3 w-7 h-7 rounded-full bg-background/90 border border-border text-xs font-bold flex items-center justify-center">{pos}</span>
        <span className="absolute top-3 right-3 flex items-center gap-1.5">
          {it.tipo && <span className="tag bg-background/90">{it.tipo === 'video' ? 'Vídeo' : it.tipo === 'imagem' ? 'Imagem' : it.tipo}</span>}
          {it.status && <span className={`tag bg-background/90 ${it.status === 'no_ar' ? 'text-emerald-400 border-emerald-500/40' : ''}`}>{it.status === 'no_ar' ? 'No ar' : it.status === 'pausado' ? 'Pausado' : it.status}</span>}
        </span>
      </div>
      <div className="p-4 space-y-3 flex-1">
        <div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-bold text-foreground truncate" title={it.nome}>{it.nome_curto ?? it.nome}</span>
            {it.arte_em && <span className="text-xs text-muted-foreground shrink-0">arte de {dataBR(it.arte_em)}</span>}
          </div>
          {it.nome_curto && <div className="text-[11px] text-muted-foreground mono truncate" title={it.nome}>{it.nome}</div>}
          <div className="text-xs text-muted-foreground mt-1">
            {rodou ? <>Rodou em <b className="text-foreground/80">{fmtNum(it.campanhas) ?? '—'}</b> campanhas{it.anuncios != null && <> · {fmtNum(it.anuncios)} anúncios</>}{it.pecas != null && <> · {fmtNum(it.pecas)} peças</>}</> : <>Campanhas e anúncios: <NaoDisponivel /></>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          <Mini k="Investimento" v={fmtBrlCurto(it.investimento)} />
          <Mini k="Leads CRM" v={fmtNum(it.leads_crm)} />
          <Mini k="Custo por MQL" v={fmtBrl(it.cpmql)} />
        </div>
        <table className="w-full text-xs border-t border-border">
          <thead>
            <tr className="text-muted-foreground"><th className="py-1.5 text-left font-semibold">Etapa</th><th className="py-1.5 text-right font-semibold">Qtd</th><th className="py-1.5 text-right font-semibold">Taxa</th><th className="py-1.5 text-right font-semibold">Custo</th></tr>
          </thead>
          <tbody>
            {ETAPAS.map((e) => {
              const v = e.valor(it); const taxa = e.taxa?.v(it); const custo = e.custo.v(it);
              const meta = e.taxa ? metaDe(metas, e.taxa.meta) : null;
              const sit = e.taxa && e.chave !== 'mql' ? situacao(taxa, meta, v) : 'nd';
              const corTaxa = sit === 'meta' ? 'text-emerald-400' : sit === 'perto' ? 'text-amber-400' : sit === 'longe' ? 'text-red-400' : sit === 'poucos' ? 'text-muted-foreground' : 'text-foreground/80';
              return (
                <tr key={e.chave} className="border-t border-border/60">
                  <td className="py-1.5 text-muted-foreground">{e.chave === 'leads' ? 'Lead' : e.curto}</td>
                  <td className="py-1.5 text-right mono font-semibold text-foreground">{fmtNum(v) ?? <NaoDisponivel />}</td>
                  <td className={`py-1.5 text-right mono font-semibold ${corTaxa}`}>{e.taxa ? fmtPct(taxa) ?? <NaoDisponivel /> : ''}</td>
                  <td className={`py-1.5 text-right mono font-semibold ${corCusto(custo, ref ? e.custo.v(ref) : null)}`}>{v === 0 && e.chave === 'venda' ? <span className="text-red-400">sem venda</span> : fmtBrl(custo) ?? <NaoDisponivel />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function Mini({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className="text-sm font-bold text-foreground mono truncate">{v ?? <NaoDisponivel className="text-xs" />}</div>
    </div>
  );
}

/* ─── como ler ─── */
const COMO_LER: [string, string][] = [
  ['Investimento', 'Gasto no Meta Ads da conta PERPETUO RGV no período, carregado pelo ETL no Supabase r1-indicadores (rgv.front_daily).'],
  ['Lead no CRM', 'Negócios do HubSpot (pipeline Perpétuo) contados pela data de criação do lead; "Leads no Meta" são os leads reportados pelo pixel/formulário do Meta.'],
  ['Lead no perfil (MQL)', 'Leads que entraram no perfil qualificado segundo as regras de segmentação ativas (faixa de faturamento). MQL pendente de segmentação fica fora até ser classificado.'],
  ['Taxas', 'Cada uma sobre a etapa anterior, colorida contra a meta do plano do ciclo quando o plano estiver cadastrado; sem plano, as taxas ficam neutras. Menos de 5 casos fica cinza.'],
  ['Etapa alcançada', 'Cada etapa conta negócios distintos que chegaram nela ou além, inclusive os perdidos depois; reentrada não duplica.'],
  ['Datas', 'Leads contam pela data de criação, cada etapa pela data de entrada nela e vendas pela data real da venda. Por isso o funil de um período é operacional (o que aconteceu nele), não a safra dos leads daquele período; taxas de períodos curtos misturam leads de datas diferentes.'],
  ['Peça criativa', 'Anúncios com a mesma arte somados em todas as campanhas, resolvidos por ID do anúncio no Meta (não por utm_content, que costuma identificar o público).'],
  ['Página', 'Endereço de destino sem UTM, somando campanhas e anúncios que levaram tráfego a ele. Formulário nativo do Meta fica em linha própria.'],
  ['Não disponível', 'A métrica ainda não está conectada no ETL ou a RPC devolveu nulo para o período. Zero só aparece quando a coleta terminou sem atividade.'],
];
function ComoLer() {
  return (
    <section className="surface p-5">
      <h3 className="display text-2xl text-foreground">Como ler</h3>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {COMO_LER.map(([k, v]) => (<div key={k} className="contents"><dt className="font-bold text-foreground whitespace-nowrap">{k}</dt><dd className="text-muted-foreground">{v}</dd></div>))}
      </dl>
    </section>
  );
}
