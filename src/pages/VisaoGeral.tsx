import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { usePerpetuo, useMetaCiclo, usePerpetuoVendasClubeTrator } from '@/hooks/usePerpetuo';
import { Link } from 'react-router-dom';
import { ROTA, mesmoEvento } from './maquina-vendas/rota';
import { usePlanoRota } from './maquina-vendas/plano';
import type { CidadeIng } from './maquina-vendas/CidadeCard';
import { lerAgendaAoVivo, type EventoAgenda } from './visao-geral/agenda';
import ProximosEventos from './visao-geral/ProximosEventos';
import './visao-geral/painel.css';

/* Visão geral do grupo, página inicial do app (pedido da Joyce, 14/10): o painel "Sala R1 · tempo real" (lp.grupor1.com/realtime)
   com o mesmo layout, cores e cards do HTML original. Os números vêm do banco (Guru, HubSpot, Meta) e a agenda vem da planilha
   "R1 | Agenda 2026" lida ao vivo. Ao clicar no card da Turnê Máquina de Vendas, ele se amplia com o detalhamento. Os Próximos eventos agora ficam no Calendário. */

const TZ = 'America/Sao_Paulo';
const DAY = 864e5;
const CAT: Record<string, [string, string]> = { rgv: ['#FE0026', 'Método RGV'], mdv: ['#FF8A1F', 'Turnê MDV'], proc: ['#3D8BFF', 'RGV Processos'], clube: ['#C9A84C', 'Clube R1'], frente: ['#FF4FA3', 'De Frente'], china: ['#2DD4BF', 'Missão China'], bf: ['#FFD43B', 'Black Friday'], online: ['#9B6BFF', 'Ao vivo online'], ricardo: ['#33D17A', 'Agenda do Ricardo'], dono: ['#9AA7B8', 'Dono com Dono'], outros: ['#8C8C8C', 'Outros'] };
const MESC = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const PADRAO = { meta: 250, capacidade: 350 }; /* iguais aos da Máquina de Vendas: valem só quando o evento não tem valor próprio */

const n = (v: number | null | undefined, d = 0) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pc2 = (v: number | null | undefined) => (v == null || isNaN(v) ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const brl = (v: number | null | undefined) => (v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? Math.round((a / b) * 100) : null);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dt = (s: string) => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
const fmtD = (s: string) => { const d = dt(s); return `${String(d.getDate()).padStart(2, '0')}/${MESC[d.getMonth()]}`; };
const quando = (e: EventoAgenda) => { const d = dt(e.inicio); return `${SEM[d.getDay()]}, ${d.getDate()} ${MESC[d.getMonth()]}${e.fim && e.fim !== e.inicio ? ` a ${fmtD(e.fim)}` : ''}${e.hora ? ` · ${e.hora}` : ''}`; };
const hora = (e: EventoAgenda) => { const m = /(\d{1,2})h(\d{2})?/.exec(e.hora || ''); return m ? [+m[1], +(m[2] || 0)] : [9, 0]; };
const titulo = (s: string) => String(s).toLowerCase().replace(/(^|\s)(\S)/g, (_a, b, c) => b + c.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos)\b/g, (x) => x.toLowerCase());
const tom = (p: number | null) => (p == null ? '' : p >= 100 ? 'good' : p >= 70 ? 'warn' : 'bad');
const custo = (r: number | null | undefined, m: number | null | undefined) => (r != null && m ? (r <= m ? 'good' : r <= m * 1.3 ? 'warn' : 'bad') : '');
const soma = <T,>(l: T[], f: (x: T) => number) => l.reduce((s, x) => s + (f(x) || 0), 0);

/* a TV pode estar com fuso errado: "agora" é sempre a hora de São Paulo (campos locais = relógio de SP) */
function spNow() {
  const p: Record<string, number> = {};
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()).forEach((x) => { if (x.type !== 'literal') p[x.type] = +x.value; });
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}
const hoje0 = () => { const d = spNow(); d.setHours(0, 0, 0, 0); return d; };
const mesISO = (offset: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return `${d.toISOString().slice(0, 7)}-01`; };
const diasAte = (iso: string, hoje: string) => Math.round((Date.parse(`${iso}T12:00:00`) - Date.parse(`${hoje}T12:00:00`)) / DAY);

interface Evento { id: number; cidade: string; mes_evento: string; data_evento: string | null; capacidade: number | null; meta_ingressos: number | null; meta_faturamento: number | null; realizado: number; pagos: number; cortesias: number; faturamento: number; dias_restantes: number }
interface LinhaCanal { cidade: string; mes_evento: string; tipo: 'comum' | 'vip' | 'cortesia'; grupo: 'comercial' | 'cs' | 'seller' | 'social_selling' | 'marketing' | 'recuperacao'; cp: 'CP1' | 'CP2' | 'CP3' | null; ingressos: number; faturamento: number }
interface MetaEvento { cidade: string; mes_evento: string; investimento: number }
type Dia = { dia: string; [k: string]: number | string | null | undefined };

/** Estrutura do card enquanto os números chegam: a moldura aparece na hora e só os dados entram depois. */
function Esqueleto() {
  return (
    <div className="rt-sk-g" role="status" aria-label="Carregando">
      <div className="rt-sk" style={{ height: '5em' }} />
      <div className="rt-sk-3"><div className="rt-sk" style={{ height: '3.2em' }} /><div className="rt-sk" style={{ height: '3.2em' }} /><div className="rt-sk" style={{ height: '3.2em' }} /></div>
      <div className="rt-sk" style={{ height: '9em' }} />
    </div>
  );
}

function K({ l, v, m, cls, bar, din, onClick, ativo }: { l: string; v: string; m?: React.ReactNode; cls?: string; bar?: number | null; din?: boolean; onClick?: () => void; ativo?: boolean }) {
  return (
    <div className={`k${onClick ? ' clk' : ''}${ativo ? ' on' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-expanded={onClick ? !!ativo : undefined} onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}>
      <div className="l">{l}</div>
      <div className={`v ${cls || ''} ${din ? 'din' : ''}`}>{v}</div>
      {m ? <div className="m">{m}</div> : null}
      {bar != null ? <div className="pbar"><i style={{ width: `${Math.min(100, bar)}%` }} /></div> : null}
    </div>
  );
}

function Anel({ p, cor, rot }: { p: number | null; cor: string; rot?: string }) {
  const r = 42, cf = 2 * Math.PI * r, fill = (Math.min(100, p || 0) / 100) * cf;
  return (
    <div className="ring">
      <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r={r} fill="none" stroke="#232323" strokeWidth="10" /><circle cx="50" cy="50" r={r} fill="none" stroke={cor} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${fill} ${cf}`} /></svg>
      <div><b>{p == null ? '—' : `${Math.round(p)}%`}</b><span>{rot || 'da meta'}</span></div>
    </div>
  );
}

/** Barras por dia, janela de 14 dias com navegação (igual ao painel original). */
function Barras({ rows, chave, cor, meta, classe }: { rows: Dia[]; chave: string; cor?: string; meta?: number | null; classe: string }) {
  const JAN = 14;
  const [off0, setOff] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [util, setUtil] = useState<number | null>(null);
  const off = Math.max(0, Math.min(off0, Math.max(0, rows.length - JAN)));
  const vis = rows.slice(Math.max(0, rows.length - JAN - off), rows.length - off);
  const hs = ymd(spNow());
  const val = (r: Dia) => Number(r[chave]) || 0;
  const mx = Math.max(...vis.map(val), meta || 0, 1);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const medir = () => {
      const b = el.querySelector('.b') as HTMLElement | null; if (!b) return;
      const lab = b.querySelector('span') as HTMLElement, top = b.querySelector('em') as HTMLElement;
      setUtil(Math.max(10, b.clientHeight - lab.offsetHeight - top.offsetHeight - 8));
    };
    medir();
    const ro = new ResizeObserver(medir); ro.observe(el);
    return () => ro.disconnect();
  }, [vis.length]);
  const x0 = useRef<number | null>(null);
  const mover = (passo: number) => setOff(off + passo);
  if (!vis.length) return <div className={`rt-bars ${classe}`}><div className="rt-empty">Sem dados diários.</div></div>;
  const f = (s: string) => { const d = dt(s); return `${d.getDate()}/${d.getMonth() + 1}`; };
  return (
    <div className={`rt-bars ${classe}`} ref={ref}
      onPointerDown={(e) => { x0.current = e.clientX; }}
      onPointerUp={(e) => { if (x0.current == null) return; const dx = e.clientX - x0.current; x0.current = null; if (Math.abs(dx) > 40) mover(dx > 0 ? 7 : -7); }}>
      {vis.map((r) => (
        <div key={r.dia} className={`b${r.dia === hs ? ' hoje' : ''}`}>
          <em>{n(val(r))}</em>
          <i style={{ height: util ? `${Math.max(2, (val(r) / mx) * util)}px` : `${Math.max(1, Math.round((val(r) / mx) * 100))}%`, ...(cor ? { background: cor } : {}) }} />
          <span>{r.dia === hs ? 'hoje' : f(r.dia)}</span>
        </div>
      ))}
      {meta ? <div className="goal" style={util ? { bottom: `${20 + 4 + (util * meta) / mx}px` } : undefined}><span>meta {n(meta)}/dia</span></div> : null}
      {rows.length > JAN ? (
        <div className="bnav">
          <button type="button" aria-label="dias anteriores" disabled={off >= rows.length - JAN} onClick={() => mover(7)}>‹</button>
          <span>{f(vis[0].dia)} – {f(vis[vis.length - 1].dia)}</span>
          <button type="button" aria-label="dias seguintes" disabled={off <= 0} onClick={() => mover(-7)}>›</button>
        </div>
      ) : null}
    </div>
  );
}

const GRUPOS: { k: LinhaCanal['grupo']; r: string }[] = [{ k: 'comercial', r: 'Comercial' }, { k: 'cs', r: 'CS' }, { k: 'seller', r: 'Seller' }, { k: 'social_selling', r: 'Social Selling' }, { k: 'marketing', r: 'Marketing' }, { k: 'recuperacao', r: 'Recuperação' }];
const CPS: { k: LinhaCanal['cp']; r: string }[] = [{ k: 'CP1', r: 'CP1' }, { k: 'CP2', r: 'CP2' }, { k: 'CP3', r: 'CP3' }, { k: null, r: 'Sem CP' }];

export default function VisaoGeral() {
  const { pode } = useAuth();
  usePlanoRota();
  const [agora, setAgora] = useState(() => spNow());
  const [ampliado, setAmpliado] = useState(false);
  const [agenda, setAgenda] = useState<{ eventos: EventoAgenda[]; fonte: string } | null>(null);

  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setAmpliado(false); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, []);
  useEffect(() => { const t = setInterval(() => setAgora(spNow()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (document.getElementById('rt-fontes')) return;
    const l = document.createElement('link'); l.id = 'rt-fontes'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=Rethink+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }, []);

  // Agenda: planilha lida ao vivo (a cada 5 min); o último resultado fica salvo no navegador, como no painel original.
  useEffect(() => {
    let vivo = true;
    try { const c = JSON.parse(localStorage.getItem('r1-agenda-live') || 'null'); if (c?.eventos?.length) setAgenda({ eventos: c.eventos, fonte: 'planilha · cache' }); } catch { /* sem cache */ }
    const ler = () => lerAgendaAoVivo().then((ev) => {
      if (!vivo) return;
      try { localStorage.setItem('r1-agenda-live', JSON.stringify({ eventos: ev, gerado: new Date().toISOString() })); } catch { /* sem cache */ }
      setAgenda({ eventos: ev, fonte: `planilha ao vivo · ${new Date().toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}` });
    }).catch(() => { /* planilha indisponível: segue com o cache ou com a rota do banco */ });
    ler();
    const t = setInterval(ler, 5 * 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const INICIO_ANO = '2026-01-01', de = INICIO_ANO, ate = '2026-12-31';
  const eventosQ = useQuery({ queryKey: ['vg-eventos', de, ate], queryFn: () => r1Rpc<Evento[]>('eventos_listar', { p_de: de, p_ate: ate }), refetchInterval: 5 * 60_000, enabled: pode('eventos') });
  const metaQ = useQuery({ queryKey: ['vg-meta', de, ate], queryFn: () => r1Rpc<MetaEvento[]>('meta_eventos', { p_de: de, p_ate: ate }), refetchInterval: 15 * 60_000, enabled: pode('eventos') });
  const detalheQ = useQuery({ queryKey: ['vg-cidade-ingressos', INICIO_ANO, ate], queryFn: () => r1Rpc<CidadeIng[]>('mv_cidade_ingressos', { p_de: INICIO_ANO, p_ate: ate }), refetchInterval: 5 * 60_000, enabled: pode('eventos') });
  const canalQ = useQuery({ queryKey: ['vg-ingressos-canal', INICIO_ANO, ate], queryFn: () => r1Rpc<LinhaCanal[]>('mv_ingressos_canal_v2', { p_de: INICIO_ANO, p_ate: ate }), refetchInterval: 5 * 60_000, enabled: pode('eventos'), retry: false });
  const hojeStr = ymd(agora);
  // A lista de ciclos vem em qualquer janela; a janela curta evita o limite de 8 s do banco que a leitura sem datas estourava.
  const perpBase = usePerpetuo(ymd(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 7)), hojeStr, pode('perpetuo'));
  const ciclo = perpBase.data?.ciclos?.find((c) => c.inicio <= hojeStr && hojeStr <= c.fim) ?? perpBase.data?.ciclos?.[perpBase.data.ciclos.length - 1];
  const perp = usePerpetuo(ciclo?.inicio, hojeStr, pode('perpetuo') && !!ciclo);

  const bfQ = useQuery({ queryKey: ['vg-black10x'], queryFn: () => r1Rpc<{ ingressos: number; receita: number; reembolsos: number; ultima_carga: string; investido: number; lpv: number; checkouts: number; meta_ate: string | null; janela_inicio: string; janela_fim: string; diario: { dia: string; ingressos: number }[] }>('black10x_painel', {}), refetchInterval: 5 * 60_000, enabled: pode('painel'), retry: false });
  const bf = bfQ.data;
  const eventos = eventosQ.data ?? [];
  // Todas as praças cadastradas no ano (Calendário/Guru); a lista fixa da Rota 45 só entra se a cidade ainda não estiver cadastrada.
  const cidadesTurne = useMemo(() => {
    const doBanco = eventos.map((e) => ({ cidade: e.cidade, data: e.data_evento ?? e.mes_evento.slice(0, 7) + '-01', inicio: '' }));
    const faltam = ROTA.cidades.filter((c) => !eventos.some((x) => mesmoEvento(x, c)));
    /* as praças que ainda vão acontecer ficam no topo; as realizadas descem (Joyce, 19/10) */
    return [...doBanco, ...faltam].sort((a, b) => a.data.localeCompare(b.data)).sort((a, b) => Number(a.data < hojeStr) - Number(b.data < hojeStr));
  }, [eventos, hojeStr]);
  const rota = useMemo(() => cidadesTurne.map((c) => {
    const e = eventos.find((x) => mesmoEvento(x, c));
    const data = e?.data_evento ?? c.data;
    return { c, e, data, dias: diasAte(data, hojeStr), cap: e?.capacidade ?? PADRAO.capacidade, meta: e?.meta_ingressos ?? PADRAO.meta, pagos: e?.pagos ?? 0, cort: e?.cortesias ?? 0, real: e?.realizado ?? 0, fat: e?.faturamento ?? 0, metaFat: e?.meta_faturamento ?? 0 };
  }), [cidadesTurne, eventos, hojeStr]);
  const metaRota = (metaQ.data ?? []).filter((m) => cidadesTurne.some((c) => mesmoEvento(m, c)));
  const vendas = soma(rota, (x) => x.real), pagos = soma(rota, (x) => x.pagos), cortT = soma(rota, (x) => x.cort), receita = soma(rota, (x) => x.fat);
  const metaIng = soma(rota, (x) => x.meta), metaFat = soma(rota, (x) => x.metaFat), capTotal = soma(rota, (x) => x.cap);
  const invRota = soma(metaRota, (m) => m.investimento);
  const carregandoMdv = pode('eventos') && eventosQ.isLoading;

  // ---- agenda (planilha; sem ela, as praças da rota)
  const lista: EventoAgenda[] = agenda?.eventos ?? rota.map((x) => ({ cat: 'mdv', titulo: 'Turnê Máquina de Vendas', local: x.c.cidade, hora: '', inicio: x.data, fim: x.data }));
  const fonteAgenda = agenda?.fonte ?? 'rota do banco';
  const h0 = hoje0();
  const fut = lista.filter((e) => (e.fim || e.inicio) >= ymd(h0)).sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
  const prox = fut[0];
  let cd: { v: string; r: string }[] | null = null; let aoVivo = false;
  if (prox) {
    const hm = hora(prox), alvo = dt(prox.inicio); alvo.setHours(hm[0], hm[1]);
    const ms = alvo.getTime() - agora.getTime(), fimMs = dt(prox.fim || prox.inicio).getTime() + DAY;
    if (ms <= 0) aoVivo = agora.getTime() < fimMs;
    else { const s = Math.floor(ms / 1e3); cd = [[Math.floor(s / 86400), 'dias'], [Math.floor((s % 86400) / 3600), 'horas'], [Math.floor((s % 3600) / 60), 'min'], [s % 60, 'seg']].map(([v, r]) => ({ v: String(v).padStart(2, '0'), r: String(r) })); }
  }

  // ---- MDV
  const cidades = rota.filter((x) => x.data).map((x) => ({ x, d: dt(x.data), dias: Math.round((dt(x.data).getTime() - h0.getTime()) / DAY) })).sort((a, b) => Number(a.dias < 0) - Number(b.dias < 0) || (a.dias < 0 ? b.d.getTime() - a.d.getTime() : a.d.getTime() - b.d.getTime())); /* ainda vão acontecer primeiro (mais próxima no topo); realizadas depois (mais recente primeiro) */
  const cac = vendas > 0 && invRota > 0 ? invRota / vendas : null;
  const pi = pct(vendas, metaIng), pr = pct(receita, metaFat);

  // ---- RGV
  const metaCicloQ = useMetaCiclo(pode('perpetuo'));
  const metaLeads = metaCicloQ.data?.find((m) => m.ciclo === ciclo?.ciclo)?.leads ?? null;
  const r = perp.data?.resumo;
  const ctQ = usePerpetuoVendasClubeTrator(undefined, undefined, pode('perpetuo'), ciclo?.ciclo ?? null);
  const ct = ctQ.data ?? null;
  const vTotal = r?.vendas != null && ct ? r.vendas + ct.clube_r1.vendas + ct.trator.vendas + ct.sem_produto.vendas : null;
  const fTotal = r?.faturamento != null && ct ? r.faturamento + ct.clube_r1.faturamento + ct.trator.faturamento + ct.sem_produto.faturamento : null;
  const diarioRgv: Dia[] = (perp.data?.diario ?? []).map((d) => ({ dia: d.data, leads: d.leads_crm ?? 0 }));
  const dCorr = ciclo ? Math.max(0, diasAte(hojeStr, ciclo.inicio) + 1) : null;
  const mediaDia = r?.mql != null && dCorr ? r.mql / dCorr : null;
  const projecao = mediaDia != null && ciclo ? Math.round(mediaDia * ciclo.dias) : null;
  const pMql = r?.leads_crm ? Math.round(((r.mql ?? 0) / r.leads_crm) * 100) : null; // MQL é o "lead do ciclo"; leads_crm é a base total do CRM

  /* Vendas RGV, Clube R1 e Trator do ciclo, repetidas nos cards de Turnê e Black Friday (Joyce, 19/10) */
  const vendasPerp = pode('perpetuo') && r ? (
    <>
      <div className="rt-sub">Vendas RGV, Clube R1 e Trator <small>{ciclo?.ciclo ?? 'ciclo atual'}</small></div>
      <div className="rt-kpis rt-kpis-4">
        <K l="Vendas RGV" v={n(r.vendas)} m={r.faturamento != null ? <>receita <b>{brl(r.faturamento)}</b></> : undefined} />
        <K l="Vendas Clube R1" v={n(ct?.clube_r1.vendas)} m={ct ? <>receita <b>{brl(ct.clube_r1.faturamento)}</b></> : undefined} />
        <K l="Vendas Trator" v={n(ct?.trator.vendas)} m={ct ? <>receita <b>{brl(ct.trator.faturamento)}</b></> : undefined} />
        <K l="Total de vendas" v={n(vTotal)} m={fTotal != null ? <>receita <b>{brl(fTotal)}</b></> : undefined} />
      </div>
    </>
  ) : null;

  // ---- selo de atualização
  const atualizado = Math.max(eventosQ.dataUpdatedAt, metaQ.dataUpdatedAt, perp.dataUpdatedAt, detalheQ.dataUpdatedAt, bfQ.dataUpdatedAt);
  const min = atualizado ? Math.round((Date.now() - atualizado) / 6e4) : null;
  const ds = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  // ---- detalhamento da Turnê (clique em Próximos eventos)
  const detalhe = detalheQ.data ?? [];
  const canal = canalQ.data;
  const praca = rota.map((x) => {
    const d = detalhe.find((y) => mesmoEvento(y, x.c));
    const ocupados = d ? d.ingressos : null;
    return { x, d, cn: canal?.filter((y) => mesmoEvento(y, x.c)), ocupados, livres: ocupados == null ? null : Math.max(0, x.cap - ocupados) };
  });
  const somaD = (f: (d: CidadeIng) => number) => (detalheQ.data ? soma(praca.filter((p) => p.d), (p) => f(p.d!)) : null);
  const T = {
    vendidos: somaD((d) => d.comuns_pagos + d.vip_pagos), comuns: somaD((d) => d.comuns_pagos), vip: somaD((d) => d.vip_total), cort: somaD((d) => d.cortesias),
    ocupados: somaD((d) => d.ingressos), fat: somaD((d) => d.faturamento),
  };
  const livresT = T.ocupados == null ? null : Math.max(0, capTotal - T.ocupados);
  const [explode, setExplode] = useState<string | null>(null);
  const porCanal = (tipo: LinhaCanal['tipo'], grupo: LinhaCanal['grupo'] | null, cp?: LinhaCanal['cp'] | undefined) => (canal ? soma(canal.filter((l) => l.tipo === tipo && (grupo == null || l.grupo === grupo) && (cp === undefined || l.cp === cp) && rota.some((x) => mesmoEvento(l, x.c))), (l) => l.ingressos) : null);
  const TIPOS: { k: LinhaCanal['tipo']; r: string; total: number | null }[] = [{ k: 'comum', r: 'Ingressos comuns', total: T.comuns }, { k: 'cortesia', r: 'Cortesias', total: T.cort }, { k: 'vip', r: 'VIPs', total: T.vip }];

  const kpisMdv = (
    <>
      <K l="Vendas + cortesias" v={n(vendas)} m={<><b>{pi == null ? '—' : `${pi}%`}</b> de {n(metaIng)} · {n(pagos)} + {n(cortT)}</>} bar={pi} />
      <K l="Receita" v={brl(receita)} din m={<><b>{pr == null ? '—' : `${pr}%`}</b> de {brl(metaFat || null)}</>} bar={pr} />
      <K l="CAC ingresso" v={brl(cac)} din />
      <K l="Investido" v={brl(invRota || null)} din />
    </>
  );

  const abrir = () => { if (pode('eventos')) setAmpliado(true); };
  const turne = (ampliado: boolean) => (
          <section className={`rt-card rt-mdv${ampliado ? ' amp' : ''}`} style={!ampliado && pode('eventos') ? { cursor: 'pointer' } : undefined} title={ampliado ? undefined : 'Clique para ver o detalhamento'}
            onClick={() => { if (!ampliado) abrir(); }}>
            <div className="rt-h">
              <span><i className="dot" style={{ ['--c' as string]: '#FF8A1F' }} />Turnê Máquina de Vendas</span>
              {ampliado ? <button type="button" className="rt-voltar" onClick={(e) => { e.stopPropagation(); setAmpliado(false); }}>Fechar ✕</button>
                : <small>{[`${rota.length} praças em 2026`, capTotal ? `ocupação ${pct(vendas, capTotal)}%` : ''].filter(Boolean).join(' · ')}</small>}
            </div>
            {!pode('eventos') ? <div className="rt-empty">Sem permissão para ver eventos.</div> : carregandoMdv ? <Esqueleto /> : (
              <>
                {ampliado ? (
                  <div className="rt-kpis rt-kpis-4">
                    {kpisMdv}
                    <K l="Meta de ingressos" v={n(metaIng)} m={`${rota.length} praças`} />
                    <K l="Ingressos vendidos" v={n(T.vendidos)} m="comuns + VIP pagos" />
                    <K l="Cadeiras disponíveis" v={n(livresT)} m={`de ${n(capTotal)} · ${n(T.ocupados)} ocupadas`} />
                    <K l="Faturamento" v={brl(T.fat)} din m="Guru" />
                  </div>
                ) : <div className="rt-kpis rt-kpis-2">{kpisMdv}</div>}
                {vendasPerp}

                {ampliado && TIPOS.map((t) => {
                  const aberto = explode?.startsWith(`${t.k}|`) ? explode.slice(t.k.length + 1) : null;
                  const base = aberto == null ? null : aberto === '*' ? porCanal(t.k, null) : porCanal(t.k, aberto as LinhaCanal['grupo']);
                  const rotuloAberto = aberto === '*' ? t.r : GRUPOS.find((g) => g.k === aberto)?.r;
                  return (
                    <div key={t.k}>
                      <div className="rt-sub rt-sub-clk" role="button" tabIndex={0} aria-expanded={aberto === '*'} onClick={() => setExplode(aberto === '*' ? null : `${t.k}|*`)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExplode(aberto === '*' ? null : `${t.k}|*`); } }}>{t.r} <small>total {n(t.total)} · por canal de venda · clique para ver por CP</small></div>
                      <div className="rt-kpis rt-kpis-6">
                        {GRUPOS.map((g) => <K key={g.k} l={g.r} v={n(porCanal(t.k, g.k))} onClick={() => setExplode(aberto === g.k ? null : `${t.k}|${g.k}`)} ativo={aberto === g.k} />)}
                      </div>
                      {aberto != null && (
                        <div className="rt-cp">
                          <div className="rt-sub">{rotuloAberto} por CP <small>{base == null ? '' : `${n(base)} ingressos`}</small></div>
                          <div className="rt-kpis rt-kpis-4">
                            {CPS.map((c) => { const v = porCanal(t.k, aberto === '*' ? null : (aberto as LinhaCanal['grupo']), c.k); return <K key={c.r} l={c.r} v={n(v)} m={v != null && base ? <><b>{Math.round((100 * v) / base)}%</b> do total</> : undefined} bar={v != null && base ? (100 * v) / base : null} />; })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {ampliado && !canal && (
                  <div className="rt-empty">{canalQ.isError ? 'A divisão por canal (Comercial, CS, Seller, Social Selling) ainda não existe no banco: aguarda a criação da função de ingressos por canal.' : 'Carregando a divisão por canal…'}</div>
                )}

                <div className="rt-sub">Ocupação por praça</div>
                <div className={`rt-cities${ampliado ? ' rt-ext' : ''}`}>
                  <div className="cty cty-h"><div className="nm">Praça</div><div className="dt">Data</div><div className="pc">%</div><div className="ct">Ocupação</div><div className="rit">Vend.+cort.</div>{!ampliado && <div className="ct">Receita</div>}<div className="dl">Prazo</div>
                    {ampliado && <><div className="ct">Meta</div><div className="ct">Vendidos</div><div className="ct">Disponíveis</div><div className="ct">Faturamento</div><div className="ct">Comuns</div><div className="ct">Cortesias</div><div className="ct">VIPs</div></>}
                  </div>
                  {cidades.map(({ x, dias }) => {
                    const p = x.cap ? (x.real / x.cap) * 100 : 0, cor = p >= 60 ? 'var(--green)' : p >= 30 ? 'var(--orange)' : '#ff5c72';
                    const pr = praca.find((q) => q.x === x), d = pr?.d;
                    return (
                      <div key={x.c.cidade} className={`cty${dias >= 0 && dias <= 7 ? ' soon' : ''}${dias < 0 ? ' past' : ''}`}>
                        <div className="nm">{pode('eventos') ? <Link to={`/central/planejamento?cidade=${encodeURIComponent(x.c.cidade)}`} onClick={(e) => e.stopPropagation()} title="Editar a cidade e a data da rota" className="hover:underline">{titulo(x.c.cidade)}</Link> : titulo(x.c.cidade)}</div>
                        <div className="dt">{x.data ? x.data.split('-').reverse().join('/') : '—'}</div>
                        <div className="pc" style={{ color: cor }}>{Math.round(p)}%</div>
                        <div className="ct">{n(x.real)} <span>/ {n(x.cap)}</span></div>
                        <div className="rit vc">{n(x.pagos)}<span>+{n(x.cort)}</span></div>
                        {!ampliado && <div className="ct">{brl(x.fat)}</div>}
                        <div className="dl">{x.real > x.cap && dias >= 0 ? <b className="good">LOTADO</b> : dias < 0 ? 'realizado' : dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `${dias} dias`}</div>
                        {ampliado && (
                          <>
                            <div className="ct">{n(x.meta)}</div>
                            <div className="ct">{n(d ? d.comuns_pagos + d.vip_pagos : null)}</div>
                            <div className="ct">{n(pr?.livres)}</div>
                            <div className="ct">{brl(d ? d.faturamento : null)}</div>
                            <div className="ct">{n(d ? d.comuns_pagos : null)}</div>
                            <div className="ct">{n(d ? d.cortesias : null)}</div>
                            <div className="ct">{n(d ? d.vip_total : null)}</div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
  );
  return (
    <div className="rt-wrap">
      <div className="rt">
        <header className="rt-top">
          <div className="rt-brand">
            <img src="https://lp.grupor1.com/wp-content/uploads/bbr1-logo-r1.png" alt="Grupo R1" width={44} height={44} />
            <div>
              <div className="rt-kick"><span className="rt-live" />Sala R1 · tempo real</div>
              <div className="rt-date">{ds.charAt(0).toUpperCase() + ds.slice(1)}</div>
            </div>
          </div>
          <div className="rt-clock">{agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
          <div className={`rt-sync${min != null && min > 150 ? ' old' : ''}`}>
            <div className="rt-sync-l">Dados dos painéis</div>
            <div className="rt-sync-v">{atualizado ? `atualizado às ${new Date(atualizado).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}${min ? ` · há ${min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`}` : ''}` : 'carregando…'}</div>
          </div>
        </header>

        <main className="rt-grid">
          {turne(false)}

          {(
            <>
              <section className="rt-card rt-rgv">
                <div className="rt-h"><span><i className="dot" style={{ ['--c' as string]: '#FE0026' }} />Método RGV · <b>{ciclo ? ciclo.ciclo.replace(/^RGV\s*/, 'Ciclo ') : 'Ciclo'}</b></span><small>{ciclo && dCorr != null ? `dia ${Math.min(dCorr, ciclo.dias)} de ${ciclo.dias}` : ''}</small></div>
                {!pode('perpetuo') ? <div className="rt-empty">Sem permissão para ver o Perpétuo.</div> : (!r && (perp.error || perpBase.error)) ? <div className="rt-empty">Erro ao ler o funil: {String(((perp.error || perpBase.error) as Error).message ?? (perp.error || perpBase.error))}</div> : !r ? <Esqueleto /> : (
                  <>
                    {(perp.error || perpBase.error) ? <div className="rt-empty" title={String(((perp.error || perpBase.error) as Error).message ?? '')}>Não consegui atualizar o funil agora. Os números abaixo são da última leitura.</div> : null}
                    <div className="rt-hero">
                      <Anel p={metaLeads && r.mql != null ? (r.mql / metaLeads) * 100 : null} cor="var(--red)" />
                      <div className="hero-t"><div className="l">Leads no ciclo (HubSpot)</div><div className="v">{n(r.mql)}</div><div className="m">meta <b>{metaLeads != null ? n(metaLeads) : '—'}</b>{projecao != null ? <> · projeção <b>{n(projecao)}</b></> : null}{mediaDia != null ? <> · <b>{n(mediaDia, 1)}</b>/dia</> : null}</div></div>
                    </div>
                    <div className="rt-kpis rt-kpis-3">
                      <K l="Investido" v={brl(r.investimento)} din />
                      <K l="CPL" v={brl(r.cpl)} din />
                      <K l="Leads no CRM" v={n(r.leads_crm)} m={pMql != null ? <>MQL = <b>{pMql}%</b></> : undefined} />
                    </div>
                    <div className="rt-kpis rt-kpis-2">
                      <K l="CTR (link)" v={pc2(r.ctr)} />
                      <K l="Conversão da página" v={pc2(r.conversao_lp)} m={<>visita → lead</>} />
                    </div>
                    <div className="rt-kpis rt-kpis-3">
                      <K l="Vendas RGV" v={n(r.vendas)} m={r.leads_crm ? <>do ciclo</> : undefined} />
                      <K l="Receita" v={brl(r.faturamento)} din />
                      <K l="CAC" v={brl(r.investimento != null && r.vendas != null ? r.investimento / Math.max(r.vendas, 1) : null)} din />
                    </div>
                    <div className="rt-kpis rt-kpis-3">
                      <K l="Vendas Clube R1" v={n(ct?.clube_r1.vendas)} m={ct ? <>receita <b>{brl(ct.clube_r1.faturamento)}</b></> : undefined} />
                      <K l="Vendas Trator" v={n(ct?.trator.vendas)} m={ct ? <>receita <b>{brl(ct.trator.faturamento)}</b></> : undefined} />
                      <K l="Total de vendas" v={n(vTotal)} m={fTotal != null ? <>receita <b>{brl(fTotal)}</b></> : undefined} />
                    </div>
                    <div className="rt-sub">Leads por dia <small>HubSpot · total do ciclo</small></div>
                    <Barras rows={diarioRgv} chave="leads" cor="var(--red)" classe="rt-bars-rgv" />
                  </>
                )}
              </section>

              <section className="rt-card rt-bf">
                <div className="rt-h"><span><i className="dot" style={{ ['--c' as string]: '#FFD43B' }} />Black Friday 10X</span><small /></div>
                {!pode('painel') ? <div className="rt-empty">Sem permissão para ver o painel.</div> : bfQ.error ? <div className="rt-empty">Erro ao ler o Black Friday 10X: {String((bfQ.error as Error).message ?? bfQ.error)}</div> : !bf ? <div className="rt-empty">Carregando…</div> : (
                  <>
                    <div className="rt-hero">
                      <div className="hero-t"><div className="l">Ingressos vendidos</div><div className="v">{n(bf.ingressos)}</div><div className="m"><b>vendas em tempo real</b>{bf.reembolsos ? <> · <b>{n(bf.reembolsos)}</b> reembolso</> : null}</div></div>
                    </div>
                    <div className="rt-kpis rt-kpis-3">
                      <K l="Receita" v={brl(bf.receita)} din />
                      <K l="Investido" v={brl(bf.investido)} din />
                      <K l="CAC ingresso" v={brl(bf.ingressos ? bf.investido / bf.ingressos : null)} din />
                    </div>
                    {vendasPerp}
                    <div className="rt-sub">Ingressos por dia <small>Guru{bf.meta_ate ? ` · investimento Meta até ${fmtD(bf.meta_ate)}` : ''}</small></div>
                    <Barras rows={bf.diario.map((d) => ({ dia: d.dia, ingressos: d.ingressos }) as unknown as Dia)} chave="ingressos" cor="#FFD43B" classe="rt-bars-rgv" />
                    <div className="rt-empty">Inscritos gratuitos ainda ficam só no painel da Lovable.</div>
                  </>
                )}
              </section>
            </>
          )}
        </main>
        <ProximosEventos eventos={lista} fonte={fonteAgenda} />
        {ampliado && (
          <div className="rt-modal" role="dialog" aria-modal="true" aria-label="Detalhamento da Turnê Máquina de Vendas" onClick={() => setAmpliado(false)}>
            <div className="rt-modal-box" onClick={(e) => e.stopPropagation()}>{turne(true)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
