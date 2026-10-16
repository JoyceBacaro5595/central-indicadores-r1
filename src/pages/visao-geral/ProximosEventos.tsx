import { useEffect, useState } from 'react';
import { CAT_AGENDA, type EventoAgenda } from './agenda';
import './painel.css';

/* Card "Próximos eventos" (antes na Sala R1): contagem regressiva do próximo evento e a lista dos seguintes. Agora é a primeira aba do Calendário. */
const TZ = 'America/Sao_Paulo';
const DAY = 864e5;
const MESC = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const cat = (c: string) => CAT_AGENDA[c] || CAT_AGENDA.outros;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dt = (s: string) => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
const fmtD = (s: string) => { const d = dt(s); return `${String(d.getDate()).padStart(2, '0')}/${MESC[d.getMonth()]}`; };
const quando = (e: EventoAgenda) => { const d = dt(e.inicio); return `${SEM[d.getDay()]}, ${d.getDate()} ${MESC[d.getMonth()]}${e.fim && e.fim !== e.inicio ? ` a ${fmtD(e.fim)}` : ''}${e.hora ? ` · ${e.hora}` : ''}`; };
const hora = (e: EventoAgenda) => { const m = /(\d{1,2})h(\d{2})?/.exec(e.hora || ''); return m ? [+m[1], +(m[2] || 0)] : [9, 0]; };
/* "agora" é sempre a hora de São Paulo (campos locais = relógio de SP) */
function spNow() {
  const p: Record<string, number> = {};
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()).forEach((x) => { if (x.type !== 'literal') p[x.type] = +x.value; });
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

export default function ProximosEventos({ eventos, fonte }: { eventos: EventoAgenda[]; fonte: string }) {
  const [agora, setAgora] = useState(() => spNow());
  useEffect(() => { const t = setInterval(() => setAgora(spNow()), 1000); return () => clearInterval(t); }, []);
  const h0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fut = eventos.filter((e) => (e.fim || e.inicio) >= ymd(h0)).sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
  const prox = fut[0];
  let cd: { v: string; r: string }[] | null = null; let aoVivo = false;
  if (prox) {
    const hm = hora(prox), alvo = dt(prox.inicio); alvo.setHours(hm[0], hm[1]);
    const ms = alvo.getTime() - agora.getTime(), fimMs = dt(prox.fim || prox.inicio).getTime() + DAY;
    if (ms <= 0) aoVivo = agora.getTime() < fimMs;
    else { const s = Math.floor(ms / 1e3); cd = ([[Math.floor(s / 86400), 'dias'], [Math.floor((s % 86400) / 3600), 'horas'], [Math.floor((s % 3600) / 60), 'min'], [s % 60, 'seg']] as [number, string][]).map(([v, r]) => ({ v: String(v).padStart(2, '0'), r })); }
  }
  return (
    <div className="rt-wrap" style={{ minHeight: 0, background: 'transparent' }}>
      <section className="rt-card rt-ev" style={{ fontSize: 'calc(var(--u) * 1.15)', maxWidth: 760, height: 'auto' }}>
        <div className="rt-h"><span>Próximos eventos</span><small>{fonte}</small></div>
        {!prox ? <div className="rt-empty">Sem eventos futuros na planilha.</div> : (
          <>
            <div className="rt-next" style={{ ['--c' as string]: cat(prox.cat)[0] }}>
              <div className="tag">Próximo · {cat(prox.cat)[1]}</div>
              <div className="t">{prox.titulo}</div>
              <div className="w">{quando(prox)}{prox.local ? ` · ${prox.local}` : ''}</div>
              <div className="cd">{aoVivo ? <div><b>AO VIVO</b><span>acontecendo agora</span></div> : cd?.map((c) => <div key={c.r}><b>{c.v}</b><span>{c.r}</span></div>)}</div>
            </div>
            <ol className="rt-list" style={{ overflow: 'visible', flex: 'none' }}>
              {fut.slice(1, 25).map((e, i) => {
                const d = dt(e.inicio), dd = Math.round((d.getTime() - h0.getTime()) / DAY);
                return (
                  <li key={`${e.inicio}-${e.titulo}-${i}`}>
                    <div className="d"><b>{String(d.getDate()).padStart(2, '0')}</b><span>{MESC[d.getMonth()]}</span></div>
                    <div className="n"><b><i className="dot" style={{ ['--c' as string]: cat(e.cat)[0] }} />{e.titulo}</b><span>{[SEM[d.getDay()] + (e.fim && e.fim !== e.inicio ? ` a ${fmtD(e.fim)}` : ''), e.local, e.hora].filter(Boolean).join(' · ')}</span></div>
                    <div className={`q${dd <= 0 ? ' hoje' : ''}`}>{dd <= 0 ? 'hoje' : dd === 1 ? 'amanhã' : `em ${dd} dias`}</div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}
