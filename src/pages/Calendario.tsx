import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import EditorEvento, { novoRascunho, type EventoEditavel, type RascunhoEvento } from './calendario/EditorEvento';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Abas, FiltroMulti, PageBody, PageHeader } from '@/components/shared';
import ProximosEventos from './visao-geral/ProximosEventos';
import { CAT_AGENDA, PLANILHA_ID, lerAgendaAoVivo, type EventoAgenda } from './visao-geral/agenda';

/* Calendário R1. A agenda mora na Central (config.agenda_evento): a planilha "R1 | Agenda 2026" (aba Calendário MKT) é importada para o banco e, daí em diante,
   as edições feitas aqui permanecem (a importação só acrescenta o que ainda não existe). Enquanto o banco estiver vazio, a planilha lida ao vivo é o que aparece. */
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const CHAVE = 'r1-agenda-live';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const cor = (c: string) => (CAT_AGENDA[c] || CAT_AGENDA.outros)[0];

export default function Calendario() {
  const hoje = hojeSP();
  const [ref, setRef] = useState(() => { const [a, m] = hoje.split('-'); return { a: +a, m: +m - 1 }; });
  const { pode } = useAuth();
  const qc = useQueryClient();
  const editar = pode('gerenciador');
  const [sheet, setEventos] = useState<EventoAgenda[]>([]);
  const db = useQuery({ queryKey: ['agenda'], queryFn: () => r1Rpc<EventoEditavel[]>('agenda_listar'), retry: false, refetchInterval: 60_000 });
  const doBanco = (db.data?.length ?? 0) > 0;
  const eventos: EventoEditavel[] = doBanco ? db.data! : sheet;
  const [edicao, setEdicao] = useState<RascunhoEvento | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [fonte, setFonte] = useState('carregando…');
  const [erro, setErro] = useState(false);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [dia, setDia] = useState<string | null>(null);
  const [aba, setAba] = useState<'proximos' | 'calendario'>('proximos');

  useEffect(() => {
    let vivo = true;
    try { const c = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (c?.eventos?.length) { setEventos(c.eventos); setFonte('cache do navegador'); } } catch { /* sem cache */ }
    const ler = () => lerAgendaAoVivo().then((ev) => {
      if (!vivo) return;
      try { localStorage.setItem(CHAVE, JSON.stringify({ eventos: ev, gerado: new Date().toISOString() })); } catch { /* sem cache */ }
      setEventos(ev); setErro(false);
      setFonte(`planilha ao vivo · ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`);
    }).catch(() => { if (vivo) setErro(true); });
    ler();
    const t = setInterval(ler, 5 * 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const importar = useMutation({
    mutationFn: async () => { const ev = await lerAgendaAoVivo(); return r1Rpc<number>('agenda_importar', { p_eventos: ev }); },
    onSuccess: (n) => { setMsg(n ? `${n} evento(s) novo(s) trazido(s) da planilha.` : 'A planilha não tem nada novo.'); qc.invalidateQueries({ queryKey: ['agenda'] }); },
    onError: (e: Error) => setMsg(`Não importou: ${e.message}`),
  });
  /* Primeira vez: banco vazio e planilha lida, quem edita importa sozinho. */
  useEffect(() => { if (editar && db.isSuccess && !doBanco && sheet.length > 0 && !importar.isPending && !importar.isSuccess) importar.mutate(); }, [editar, db.isSuccess, doBanco, sheet.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const salvar = useMutation({
    mutationFn: (v: RascunhoEvento) => r1Rpc('agenda_salvar', { p_id: v.id, p_cat: v.cat, p_titulo: v.titulo, p_local: v.local, p_hora: v.hora, p_inicio: v.inicio, p_fim: v.fim }),
    onSuccess: () => { setEdicao(null); setMsg(null); qc.invalidateQueries({ queryKey: ['agenda'] }); },
  });
  const excluir = useMutation({
    mutationFn: (id: number) => r1Rpc('agenda_excluir', { p_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agenda'] }),
  });

  const visiveis = useMemo(() => eventos.filter((e) => !ocultas.has(e.cat)), [eventos, ocultas]);
  const usadas = useMemo(() => Array.from(new Set(eventos.map((e) => e.cat))), [eventos]);
  const selecionadas = useMemo(() => (ocultas.size === 0 ? [] : usadas.filter((c) => !ocultas.has(c))), [ocultas, usadas]);

  // semanas do mês (domingo a sábado), com os dias dos meses vizinhos para completar a grade
  const semanas = useMemo(() => {
    const primeiro = new Date(ref.a, ref.m, 1), ini = new Date(ref.a, ref.m, 1 - primeiro.getDay());
    const fimMes = new Date(ref.a, ref.m + 1, 0), total = Math.ceil((primeiro.getDay() + fimMes.getDate()) / 7) * 7;
    return Array.from({ length: total / 7 }, (_, s) => Array.from({ length: 7 }, (_, d) => new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + s * 7 + d)));
  }, [ref]);
  const doDia = (iso: string) => visiveis.filter((e) => e.inicio <= iso && (e.fim || e.inicio) >= iso);
  const mover = (p: number) => setRef((r) => { const d = new Date(r.a, r.m + p, 1); return { a: d.getFullYear(), m: d.getMonth() }; });
  const selecionados = dia ? doDia(dia) : [];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader titulo="Calendário" subtitulo="Agenda do grupo: turnê, RGV, Clube, Black Friday e agenda do Ricardo" />
      <PageBody>
        <div className="space-y-4">
          <Abas valor={aba} onChange={setAba} itens={[{ valor: 'proximos', rotulo: 'Próximos eventos' }, { valor: 'calendario', rotulo: 'Calendário' }]} />
          {aba === 'calendario' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => mover(-1)} aria-label="Mês anterior" className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center hover:text-foreground text-muted-foreground"><ChevronLeft className="w-4 h-4" /></button>
              <div className="min-w-40 text-center text-lg font-extrabold text-foreground">{MESES[ref.m]} {ref.a}</div>
              <button type="button" onClick={() => mover(1)} aria-label="Próximo mês" className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center hover:text-foreground text-muted-foreground"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <button type="button" onClick={() => { const [a, m] = hoje.split('-'); setRef({ a: +a, m: +m - 1 }); setDia(hoje); }} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-secondary text-foreground">Hoje</button>
            <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
              {doBanco ? <span>agenda da Central</span> : <span>{erro ? 'planilha indisponível, mostrando o último cache' : fonte}</span>}
              {editar && <button type="button" onClick={() => importar.mutate()} disabled={importar.isPending} className="inline-flex items-center gap-1 hover:text-foreground">{importar.isPending ? 'Importando…' : 'Trazer novidades da planilha'}</button>}
              {!doBanco && <a href={`https://docs.google.com/spreadsheets/d/${PLANILHA_ID}/edit`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Planilha <ExternalLink className="w-3 h-3" /></a>}
            </div>
          </div>
          )}
          <FiltroMulti rotulo="Produto" valor={selecionadas}
            opcoes={usadas.map((c) => ({ valor: c, rotulo: (CAT_AGENDA[c] || CAT_AGENDA.outros)[1], cor: cor(c) }))}
            onChange={(v) => setOcultas(new Set(v.length ? usadas.filter((c) => !v.includes(c)) : []))} />

          {aba === 'proximos' && eventos.length > 0 && <ProximosEventos eventos={visiveis} fonte={erro ? 'último cache' : fonte} />}

          {aba === 'calendario' && (eventos.length === 0 ? <p className="text-sm text-muted-foreground">{erro ? 'Não consegui ler a planilha agora. Confira se ela está compartilhada com quem tem o link.' : 'Carregando a agenda…'}</p> : (
            <div className="rounded-xl border border-border overflow-hidden w-full max-w-full">
              <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] bg-secondary/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {SEM.map((s) => <div key={s} className="p-2 text-center">{s}</div>)}
              </div>
              {semanas.map((sem, i) => (
                <div key={i} className="grid grid-cols-[repeat(7,minmax(0,1fr))] border-t border-border">
                  {sem.map((d) => {
                    const iso = ymd(d), fora = d.getMonth() !== ref.m, evs = doDia(iso), ehHoje = iso === hoje;
                    return (
                      <button key={iso} type="button" onClick={() => setDia(iso === dia ? null : iso)} className={`min-h-24 min-w-0 overflow-hidden p-1.5 text-left align-top border-l first:border-l-0 border-border hover:bg-secondary/40 ${fora ? 'opacity-40' : ''} ${iso === dia ? 'bg-secondary/60' : ''}`}>
                        <div className={`text-[11px] font-bold mb-1 ${ehHoje ? 'inline-flex w-5 h-5 items-center justify-center rounded-full bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{d.getDate()}</div>
                        <div className="space-y-0.5">
                          {evs.slice(0, 3).map((e, k) => (
                            <div key={k} className="flex items-center gap-1 text-[10px] leading-tight text-foreground">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cor(e.cat) }} />
                              <span className="truncate">{e.local && e.cat === 'mdv' ? e.local.replace(/ \(.*\)$/, '') : e.titulo}</span>
                            </div>
                          ))}
                          {evs.length > 3 && <div className="text-[10px] text-muted-foreground">+{evs.length - 3} mais</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}

          {aba === 'calendario' && dia && (
            <section className="rounded-xl border border-border p-4 space-y-2">
              <h2 className="text-sm font-extrabold text-foreground">{(() => { const d = new Date(`${dia}T12:00:00`); return `${SEM[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`; })()}</h2>
              {msg && <p className="text-xs text-muted-foreground" role="status">{msg}</p>}
              {selecionados.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum evento neste dia.</p> : (
                <ul className="divide-y divide-border">
                  {selecionados.map((e, k) => (
                    <li key={k} className="flex items-center gap-3 py-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor(e.cat) }} />
                      <span className="font-semibold text-foreground">{e.cat === 'mdv' && e.local ? <Link to={`/central/planejamento?cidade=${encodeURIComponent(e.local.replace(/ \(.*\)$/, ''))}`} title="Editar a cidade e a data da rota" className="hover:underline">{e.titulo}</Link> : e.titulo}</span>
                      <span className="text-muted-foreground">{[e.local, e.hora, e.fim !== e.inicio ? `${e.inicio.split('-').reverse().slice(0, 2).join('/')} a ${e.fim.split('-').reverse().slice(0, 2).join('/')}` : ''].filter(Boolean).join(' · ')}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{(CAT_AGENDA[e.cat] || CAT_AGENDA.outros)[1]}</span>
                      {editar && doBanco && e.id != null && (
                        <span className="flex items-center gap-2 text-[11px]">
                          <button type="button" className="text-primary font-semibold" onClick={() => { salvar.reset(); setEdicao(novoRascunho(dia, e)); }}>editar</button>
                          <button type="button" className="text-red-400" onClick={() => { if (window.confirm(`Excluir "${e.titulo}"?`)) excluir.mutate(e.id!); }}>excluir</button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {editar && doBanco && (edicao
                ? <EditorEvento key={`${edicao.id ?? 'novo'}-${dia}`} valor={edicao} salvando={salvar.isPending} erro={salvar.error ? (salvar.error as Error).message : null} onSalvar={(v) => salvar.mutate(v)} onCancelar={() => setEdicao(null)} />
                : <button type="button" className="text-xs text-primary font-semibold" onClick={() => { salvar.reset(); setEdicao(novoRascunho(dia)); }}>+ Novo evento neste dia</button>)}
            </section>
          )}
        </div>
      </PageBody>
    </div>
  );
}
