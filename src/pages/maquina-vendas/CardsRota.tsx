import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { ROTA, mesmoEvento } from './rota';
import CadastroEvento from './CadastroEvento';
import CidadeCard, { type CidadeIng } from './CidadeCard';
import { TabelaRota, FunilRota } from './VisoesRota';
import { META, num, brl, pct, dm, dias, type Evento, type MetaEvento, type HubEvento, type Presenca, type Cadeiras } from './DashboardRota';

const INICIO_ANO = '2026-01-01';
const CHAVE = 'central.cardsPorLinha';
const CHAVE_VISAO = 'central.visaoEventos';
type Visao = 'card' | 'tabela' | 'funil';
const VISOES: [Visao, string][] = [['card', 'Card'], ['tabela', 'Lista / Tabela'], ['funil', 'Funil']];
const lerVisao = (): Visao => { try { const v = localStorage.getItem(CHAVE_VISAO); return v === 'tabela' || v === 'funil' ? v : 'card'; } catch { return 'card'; } };
const lerPref = () => { try { const v = Number(localStorage.getItem(CHAVE)); return v >= 1 && v <= 5 ? v : 3; } catch { return 3; } };
type Situacao = 'todas' | 'abertas' | 'lotadas' | 'proximos7' | 'proximos14' | 'realizadas';
type Ordem = 'data' | 'ocupacao' | 'vendas' | 'cidade';
const SITUACOES: [Situacao, string][] = [['todas', 'Todas'], ['abertas', 'Com vagas'], ['lotadas', 'Lotadas'], ['proximos7', 'Faltam até 7 dias'], ['proximos14', 'Faltam até 14 dias'], ['realizadas', 'Já realizadas']];
const ORDENS: [Ordem, string][] = [['data', 'Data do evento'], ['ocupacao', 'Maior ocupação'], ['vendas', 'Mais vendas'], ['cidade', 'Cidade (A a Z)']];
const sel = 'bg-secondary rounded px-2 py-1.5 text-xs text-foreground';
const mesISO = (offset: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7) + '-01'; };

/** Cards por cidade da rota (visão geral Realizado, Previsto, %), com cadastro de evento e de meta; usado na página Eventos e metas. */
export default function CardsRota() {
  const { pode } = useAuth();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('todas');
  const [ordem, setOrdem] = useState<Ordem>('data');
  const [visao, setVisao] = useState<Visao>(lerVisao);
  const escolherVisao = (v: Visao) => { setVisao(v); try { localStorage.setItem(CHAVE_VISAO, v); } catch { /* preferência só desta sessão */ } };
  const [porLinha, setPorLinha] = useState<number>(lerPref);
  const escolherPorLinha = (n: number) => { setPorLinha(n); try { localStorage.setItem(CHAVE, String(n)); } catch { /* preferência só desta sessão */ } };
  const de = mesISO(-1); const ate = mesISO(4);
  const eventos = useQuery({ queryKey: ['mv-eventos', de, ate], queryFn: () => r1Rpc<Evento[]>('eventos_listar', { p_de: de, p_ate: ate }), refetchInterval: 5 * 60_000 });
  const eventosHist = useQuery({ queryKey: ['mv-eventos-hist', ate], queryFn: () => r1Rpc<Evento[]>('eventos_listar', { p_de: INICIO_ANO, p_ate: ate }), refetchInterval: 15 * 60_000 });
  const meta = useQuery({ queryKey: ['mv-meta', de, ate], queryFn: () => r1Rpc<MetaEvento[]>('meta_eventos', { p_de: de, p_ate: ate }), refetchInterval: 15 * 60_000 });
  const hub = useQuery({ queryKey: ['mv-hub', de, ate], queryFn: () => r1Rpc<HubEvento[]>('hubspot_eventos', { p_inicio: de, p_fim: ate }), refetchInterval: 15 * 60_000 });
  const presenca = useQuery({ queryKey: ['mv-presenca', INICIO_ANO, ate], queryFn: () => r1Rpc<Presenca[]>('presenca_eventos', { p_inicio: INICIO_ANO, p_fim: ate }), enabled: pode('presenca'), refetchInterval: 5 * 60_000 });
  const cadeiras = useQuery({ queryKey: ['mv-cadeiras', INICIO_ANO, ate], queryFn: () => r1Rpc<Cadeiras[]>('mv_cadeiras_evento', { p_inicio: INICIO_ANO, p_fim: ate }), enabled: pode('presenca'), refetchInterval: 5 * 60_000 });
  const detalhe = useQuery({ queryKey: ['mv-cidade-ingressos', INICIO_ANO, ate], queryFn: () => r1Rpc<CidadeIng[]>('mv_cidade_ingressos', { p_de: INICIO_ANO, p_ate: ate }), refetchInterval: 5 * 60_000 });

  const linhas = ROTA.cidades.map((c) => {
    const ev = (eventos.data ?? []).find((e) => mesmoEvento(e, c));
    const m = (meta.data ?? []).find((x) => mesmoEvento(x, c)) ?? null;
    const h = (hub.data ?? []).find((x) => mesmoEvento(x, c)) ?? null;
    const pr = (presenca.data ?? []).find((x) => mesmoEvento(x, c));
    const ocup = pr && pr.esperados > 0 ? pr.esperados : ev ? ev.realizado : null;
    return {
      c, ev: ev ?? null, m, h, inv: m ? Number(m.investimento) : null, vendas: ev ? ev.pagos : null, cort: ev ? ev.cortesias : null,
      fat: ev ? Number(ev.faturamento) : null, ocup, cap: ev?.capacidade ?? META.capacidade, qual: h ? h.compradores_qualificados : null,
      dias: dias(ev?.data_evento ?? c.data), data: ev?.data_evento ?? c.data,
      pres: pr ? pr.presentes : null, esp: pr && pr.esperados > 0 ? pr.esperados : null, metaIng: ev?.meta_ingressos ?? null, metaFat: ev?.meta_faturamento ? Number(ev.meta_faturamento) : null,
      cad: (cadeiras.data ?? []).find((x) => mesmoEvento(x, c)) ?? null,
    };
  });

  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const visiveis = linhas
    .filter((l) => norm(l.c.cidade).includes(norm(busca.trim())))
    .filter((l) => {
      const lotada = l.ocup != null && l.ocup >= l.cap;
      if (situacao === 'abertas') return !lotada && l.dias >= 0;
      if (situacao === 'lotadas') return lotada;
      if (situacao === 'proximos7') return l.dias >= 0 && l.dias <= 7;
      if (situacao === 'proximos14') return l.dias >= 0 && l.dias <= 14;
      if (situacao === 'realizadas') return l.dias < 0;
      return true;
    })
    .sort((a, b) => {
      if (ordem === 'cidade') return a.c.cidade.localeCompare(b.c.cidade, 'pt-BR');
      if (ordem === 'ocupacao') return (b.ocup ?? -1) / b.cap - (a.ocup ?? -1) / a.cap;
      if (ordem === 'vendas') return (b.vendas ?? -1) - (a.vendas ?? -1);
      return a.data.localeCompare(b.data);
    });

  return (
    <section className="surface p-5 space-y-4" aria-label="Cards por cidade">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="section-label">Cards por cidade · {ROTA.nome}</span>
          <p className="text-[10px] text-muted-foreground mt-1">Visão geral por evento: Realizado, Previsto e % atingido. Os detalhes de cada assunto abrem em modais.</p>
        </div>
        <CadastroEvento eventos={eventosHist.data ?? []} />
      </div>
      <div className="flex flex-wrap items-end gap-3 text-[10px] text-muted-foreground">
        <label>Cidade<br /><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cidade" className={`${sel} w-40`} /></label>
        <label>Situação<br /><select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)} className={sel}>{SITUACOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
        <label>Ordenar por<br /><select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={sel}>{ORDENS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
        <div role="group" aria-label="Formato de visualização" className="flex rounded-lg border border-border overflow-hidden">{VISOES.map(([v, r]) => <button key={v} type="button" aria-pressed={visao === v} onClick={() => escolherVisao(v)} className={`px-3 py-1.5 text-xs font-bold ${visao === v ? 'bg-primary text-primary-foreground' : 'bg-secondary/40 text-foreground hover:bg-secondary'}`}>{r}</button>)}</div>
        {visao === 'card' && <label className="hidden lg:block">Cards por linha<br /><select value={porLinha} onChange={(e) => escolherPorLinha(Number(e.target.value))} className={sel} aria-label="Cards por linha">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>}
        <span className="pb-2">{visiveis.length} de {linhas.length} cidades</span>
      </div>
      {visiveis.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma cidade com esses filtros.</p>}
      {visao === 'card' && (
        <div className="grid gap-4 grid-cols-1 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ ['--cols' as string]: porLinha }}>
          {visiveis.map((l) => <CidadeCard key={l.c.cidade} l={l} det={(detalhe.data ?? []).find((x) => mesmoEvento(x, l.c)) ?? null} fmt={{ num, brl, pct, dm }} meta={META} />)}
        </div>
      )}
      {visao === 'tabela' && <TabelaRota linhas={visiveis} detalhe={detalhe.data ?? []} mesmo={mesmoEvento} />}
      {visao === 'funil' && <FunilRota linhas={visiveis} />}
    </section>
  );
}
