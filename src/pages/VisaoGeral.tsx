import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { usePerpetuo } from '@/hooks/usePerpetuo';
import { ROTA, mesmoEvento } from './maquina-vendas/rota';
import type { CidadeIng } from './maquina-vendas/CidadeCard';
import { lerAgendaAoVivo, type EventoAgenda } from './visao-geral/agenda';
import './visao-geral/painel.css';

/* Visão geral do grupo, página inicial do app (pedido da Joyce, 14/10): o painel "Sala R1 · tempo real" (lp.grupor1.com/realtime)
   com o mesmo layout, cores e cards do HTML original. Os números vêm do banco (Guru, HubSpot, Meta) e a agenda vem da planilha
   "R1 | Agenda 2026" lida ao vivo. Ao clicar em Próximos eventos, a Turnê Máquina de Vendas se amplia com o detalhamento. */

const TZ = 'America/Sao_Paulo';
const DAY = 864e5;
const CAT: Record<string, [string, string]> = { rgv: ['#FE0026', 'Método RGV'], mdv: ['#FF8A1F', 'Turnê MDV'], proc: ['#3D8BFF', 'RGV Processos'], clube: ['#C9A84C', 'Clube R1'], frente: ['#FF4FA3', 'De Frente'], china: ['#2DD4BF', 'Missão China'], bf: ['#FFD43B', 'Black Friday'], online: ['#9B6BFF', 'Ao vivo online'], ricardo: ['#33D17A', 'Agenda do Ricardo'], dono: ['#9AA7B8', 'Dono com Dono'], outros: ['#8C8C8C', 'Outros'] };
const MESC = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const PADRAO = { meta: 250, capacidade: 350 }; /* iguais aos da Máquina de Vendas: valem só quando o evento não tem valor próprio */

const n = (v: number | null | undefined, d = 0) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
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
interface LinhaCanal { cidade: string; mes_evento: string; tipo: 'comum' | 'vip' | 'cortesia'; grupo: 'comercial' | 'cs' | 'seller' | 'social_selling' | 'geral'; ingressos: number; faturamento: number }
interface MetaEvento { cidade: string; mes_evento: string; investimento: number }
type Dia = { dia: string; [k: string]: number | string | null | undefined };

function K({ l, v, m, cls, bar, din }: { l: string; v: string; m?: React.ReactNode; cls?: string; bar?: number | null; din?: boolean }) {
  return (
    <div className="k">
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
      <div><b>{p == null ? '—' : `${p}%`}</b><span>{rot || 'da meta'}</span></div>
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

const GRUPOS: { k: LinhaCanal['grupo']; r: string }[] = [{ k: 'comercial', r: 'Comercial' }, { k: 'cs', r: 'CS' }, { k: 'seller', r: 'Seller' }, { k: 'social_selling', r: 'Social Selling' }, { k: 'geral', r: 'Sem canal' }];

export default function VisaoGeral() {
  const { pode } = useAuth();
  const [agora, setAgora] = useState(() => spNow());
  const [ampliado, setAmpliado] = useState(false);
  const [agenda, setAgenda] = useState<{ eventos: EventoAgenda[]; fonte: string } | null>(null);

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

  const de = mesISO(-1), ate = mesISO(4), INICIO_ANO = '2026-01-01';
  const eventosQ = useQuery({ queryKey: ['vg-eventos', de, ate], queryFn: () => r1Rpc<Evento[]>('eventos_listar', { p_de: de, p_ate: ate }), refetchInterval: 5 * 60_000, enabled: pode('eventos') });
  const metaQ = useQuery({ queryKey: ['vg-meta', de, ate], queryFn: () => r1Rpc<MetaEvento[]>('meta_eventos', { p_de: de, p_ate: ate }), refetchInterval: 15 * 60_000, enabled: pode('eventos') });
  const detalheQ = useQuery({ queryKey: ['vg-cidade-ingressos', INICIO_ANO, ate], queryFn: () => r1Rpc<CidadeIng[]>('mv_cidade_ingressos', { p_de: INICIO_ANO, p_ate: ate }), refetchInterval: 5 * 60_000, enabled: pode('eventos') });
  const canalQ = useQuery({ queryKey: ['vg-ingressos-canal', INICIO_ANO, ate], queryFn: () => r1Rpc<LinhaCanal[]>('mv_ingressos_canal', { p_de: INICIO_ANO, p_ate: ate }), refetchInterval: 5 * 60_000, enabled: pode('eventos'), retry: false });
  const perpBase = usePerpetuo(undefined, undefined, pode('perpetuo'));
  const hojeStr = ymd(agora);
  const ciclo = perpBase.data?.ciclos?.find((c) => c.inicio <= hojeStr && hojeStr <= c.fim) ?? perpBase.data?.ciclos?.[perpBase.data.ciclos.length - 1];
  const perp = usePerpetuo(ciclo?.inicio, hojeStr, pode('perpetuo') && !!ciclo);

  const eventos = eventosQ.data ?? [];
  const rota = useMemo(() => ROTA.cidades.map((c) => {
    const e = eventos.find((x) => mesmoEvento(x, c));
    const data = e?.data_evento ?? c.data;
    return { c, e, data, dias: diasAte(data, hojeStr), cap: e?.capacidade ?? PADRAO.capacidade, meta: e?.meta_ingressos ?? PADRAO.meta, pagos: e?.pagos ?? 0, cort: e?.cortesias ?? 0, real: e?.realizado ?? 0, fat: e?.faturamento ?? 0, metaFat: e?.meta_faturamento ?? 0 };
  }), [eventos, hojeStr]);
  const metaRota = (metaQ.data ?? []).filter((m) => ROTA.cidades.some((c) => mesmoEvento(m, c)));
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
  const cidades = rota.filter((x) => x.data).map((x) => ({ x, d: dt(x.data), dias: Math.round((dt(x.data).getTime() - h0.getTime()) / DAY) })).sort((a, b) => a.d.getTime() - b.d.getTime());
  const cac = vendas > 0 && invRota > 0 ? invRota / vendas : null;
  const pi = pct(vendas, metaIng), pr = pct(receita, metaFat);

  // ---- RGV
  const r = perp.data?.resumo;
  const diarioRgv: Dia[] = (perp.data?.diario ?? []).map((d) => ({ dia: d.data, leads: d.leads_crm ?? 0 }));
  const dCorr = ciclo ? Math.max(0, diasAte(hojeStr, ciclo.inicio) + 1) : null;
  const mediaDia = r?.leads_crm != null && dCorr ? r.leads_crm / dCorr : null;
  const projecao = mediaDia != null && ciclo ? Math.round(mediaDia * ciclo.dias) : null;
  const pMql = r?.leads_crm ? Math.round(((r.mql ?? 0) / r.leads_crm) * 100) : null;

  // ---- selo de atualização
  const atualizado = Math.max(eventosQ.dataUpdatedAt, metaQ.dataUpdatedAt, perp.dataUpdatedAt, detalheQ.dataUpdatedAt);
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
  const porCanal = (tipo: LinhaCanal['tipo'], grupo: LinhaCanal['grupo']) => (canal ? soma(canal.filter((l) => l.tipo === tipo && l.grupo === grupo && rota.some((x) => mesmoEvento(l, x.c))), (l) => l.ingressos) : null);
  const TIPOS: { k: LinhaCanal['tipo']; r: string; total: number | null }[] = [{ k: 'comum', r: 'Ingressos comuns', total: T.comuns }, { k: 'cortesia', r: 'Cortesias', total: T.cort }, { k: 'vip', r: 'VIPs', total: T.vip }];

  const kpisMdv = (
    <>
      <K l="Vendas + cortesias" v={n(vendas)} m={<><b>{pi == null ? '—' : `${pi}%`}</b> de {n(metaIng)} · {n(pagos)} + {n(cortT)}</>} bar={pi} />
      <K l="Receita" v={brl(receita)} din m={<><b>{pr == null ? '—' : `${pr}%`}</b> de {brl(metaFat || null)}</>} bar={pr} />
      <K l="CAC ingresso" v={brl(cac)} din />
      <K l="Investido" v={brl(invRota || null)} din />
    </>
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

        <main className="rt-grid" style={ampliado ? { gridTemplateColumns: '1fr' } : undefined}>
          {!ampliado && (
            <section className="rt-card rt-ev" style={pode('eventos') ? { cursor: 'pointer' } : undefined} role="button" tabIndex={0}
              title="Clique para ampliar o detalhamento da Turnê Máquina de Vendas"
              onClick={() => pode('eventos') && setAmpliado(true)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && pode('eventos')) setAmpliado(true); }}>
              <div className="rt-h"><span>Próximos eventos</span><small>{fonteAgenda} · clique para detalhar a Turnê</small></div>
              {!prox ? <div className="rt-empty">Sem eventos futuros na planilha.</div> : (
                <>
                  <div className="rt-next" style={{ ['--c' as string]: (CAT[prox.cat] || CAT.outros)[0] }}>
                    <div className="tag">Próximo · {(CAT[prox.cat] || CAT.outros)[1]}</div>
                    <div className="t">{prox.titulo}</div>
                    <div className="w">{quando(prox)}{prox.local ? ` · ${prox.local}` : ''}</div>
                    <div className="cd">{aoVivo ? <div><b>AO VIVO</b><span>acontecendo agora</span></div> : cd?.map((c) => <div key={c.r}><b>{c.v}</b><span>{c.r}</span></div>)}</div>
                  </div>
                  <ol className="rt-list">
                    {fut.slice(1, 25).map((e, i) => {
                      const d = dt(e.inicio), c = (CAT[e.cat] || CAT.outros)[0], dd = Math.round((d.getTime() - h0.getTime()) / DAY);
                      return (
                        <li key={`${e.inicio}-${e.titulo}-${i}`}>
                          <div className="d"><b>{String(d.getDate()).padStart(2, '0')}</b><span>{MESC[d.getMonth()]}</span></div>
                          <div className="n"><b><i className="dot" style={{ ['--c' as string]: c }} />{e.titulo}</b><span>{[SEM[d.getDay()] + (e.fim && e.fim !== e.inicio ? ` a ${fmtD(e.fim)}` : ''), e.local, e.hora].filter(Boolean).join(' · ')}</span></div>
                          <div className={`q${dd <= 0 ? ' hoje' : ''}`}>{dd <= 0 ? 'hoje' : dd === 1 ? 'amanhã' : `em ${dd} dias`}</div>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </section>
          )}

          <section className="rt-card rt-mdv">
            <div className="rt-h">
              <span><i className="dot" style={{ ['--c' as string]: '#FF8A1F' }} />Turnê Máquina de Vendas</span>
              {ampliado ? <button type="button" className="rt-voltar" onClick={() => setAmpliado(false)}>‹ Voltar à visão geral</button>
                : <small>{[ROTA.nome, capTotal ? `ocupação ${pct(vendas, capTotal)}%` : ''].filter(Boolean).join(' · ')}</small>}
            </div>
            {!pode('eventos') ? <div className="rt-empty">Sem permissão para ver eventos.</div> : carregandoMdv ? <div className="rt-empty">Carregando…</div> : (
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

                {ampliado && TIPOS.map((t) => (
                  <div key={t.k}>
                    <div className="rt-sub">{t.r} <small>total {n(t.total)} · por canal de venda</small></div>
                    <div className="rt-kpis rt-kpis-5">
                      {GRUPOS.map((g) => <K key={g.k} l={g.r} v={n(porCanal(t.k, g.k))} />)}
                    </div>
                  </div>
                ))}
                {ampliado && !canal && (
                  <div className="rt-empty">{canalQ.isError ? 'A divisão por canal (Comercial, CS, Seller, Social Selling) ainda não existe no banco: aguarda a criação da função de ingressos por canal.' : 'Carregando a divisão por canal…'}</div>
                )}

                <div className="rt-sub">Ocupação por praça <small>(vendas + cortesias) / capacidade · vendas + cortesias · dias p/ evento</small></div>
                {ampliado ? (
                  <div className="rt-cities rt-det">
                    <div className="cty cty-h"><div className="nm">Praça</div><div className="ct">Meta</div><div className="ct">Vendidos</div><div className="ct">Disponíveis</div><div className="ct">Faturamento</div><div className="ct">Comuns</div><div className="ct">Cortesias</div><div className="ct">VIPs</div><div className="dl">Data</div></div>
                    {praca.map((p) => (
                      <div key={p.x.c.cidade} className={`cty${p.x.dias < 0 ? ' past' : ''}`}>
                        <div className="nm">{p.x.c.cidade}</div>
                        <div className="ct">{n(p.x.meta)}</div>
                        <div className="ct">{n(p.d ? p.d.comuns_pagos + p.d.vip_pagos : null)}</div>
                        <div className="ct">{n(p.livres)}</div>
                        <div className="ct">{brl(p.d ? p.d.faturamento : null)}</div>
                        <div className="ct">{n(p.d ? p.d.comuns_pagos : null)}</div>
                        <div className="ct">{n(p.d ? p.d.cortesias : null)}</div>
                        <div className="ct">{n(p.d ? p.d.vip_total : null)}</div>
                        <div className="dl">{fmtD(p.x.data)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rt-cities">
                    {cidades.map(({ x, dias }) => {
                      const p = x.cap ? (x.real / x.cap) * 100 : 0, cor = p >= 60 ? 'var(--green)' : p >= 30 ? 'var(--orange)' : '#ff5c72';
                      return (
                        <div key={x.c.cidade} className={`cty${dias >= 0 && dias <= 7 ? ' soon' : ''}${dias < 0 ? ' past' : ''}`}>
                          <div className="nm">{titulo(x.c.cidade)}</div>
                          <div className="br"><i style={{ width: `${Math.min(100, p)}%`, background: cor }} /></div>
                          <div className="ct">{n(x.real)} <span>/ {n(x.cap)}</span></div>
                          <div className="rit vc">{n(x.pagos)}<span>+{n(x.cort)}</span></div>
                          <div className="dl">{x.real > x.cap && dias >= 0 ? <b className="good">LOTADO</b> : dias < 0 ? 'realizado' : dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `${dias} dias`}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          {!ampliado && (
            <>
              <section className="rt-card rt-rgv">
                <div className="rt-h"><span><i className="dot" style={{ ['--c' as string]: '#FE0026' }} />Método RGV · <b>{ciclo ? ciclo.ciclo.replace(/^RGV\s*/, 'Ciclo ') : 'Ciclo'}</b></span><small>{ciclo && dCorr != null ? `dia ${Math.min(dCorr, ciclo.dias)} de ${ciclo.dias}` : ''}</small></div>
                {!pode('perpetuo') ? <div className="rt-empty">Sem permissão para ver o Perpétuo.</div> : perp.error ? <div className="rt-empty">Erro ao ler o funil: {String((perp.error as Error).message ?? perp.error)}</div> : !r ? <div className="rt-empty">Carregando…</div> : (
                  <>
                    <div className="rt-hero">
                      <Anel p={null} cor="var(--red)" />
                      <div className="hero-t"><div className="l">Leads no ciclo (HubSpot)</div><div className="v">{n(r.leads_crm)}</div><div className="m">meta <b>—</b>{projecao != null ? <> · projeção <b>{n(projecao)}</b></> : null}{mediaDia != null ? <> · <b>{n(mediaDia, 1)}</b>/dia</> : null}</div></div>
                    </div>
                    <div className="rt-kpis rt-kpis-3">
                      <K l="Investido" v={brl(r.investimento)} din />
                      <K l="CPL" v={brl(r.cpl)} din />
                      <K l="MQL" v={n(r.mql)} m={pMql != null ? <><b>{pMql}%</b> dos leads</> : undefined} />
                    </div>
                    <div className="rt-sub">Leads por dia <small>HubSpot · total do ciclo</small></div>
                    <Barras rows={diarioRgv} chave="leads" cor="var(--red)" classe="rt-bars-rgv" />
                  </>
                )}
              </section>

              <section className="rt-card rt-bf">
                <div className="rt-h"><span><i className="dot" style={{ ['--c' as string]: '#FFD43B' }} />Black Friday 10X</span><small /></div>
                <div className="rt-empty">Sem dados do painel Black Friday. Os inscritos (pagos e gratuitos) ainda ficam só no Dashboard da Lovable e não chegam ao banco desta central.</div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
