import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { r1Rpc } from '@/integrations/r1/client';
import { PageHeader } from '@/components/shared';
import AtualizarPeriodo from '@/components/AtualizarPeriodo';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface Parametro { chave: string; valor: number; rotulo: string; descricao: string | null; grupo: string; atualizado_em: string }
interface Agendamento {
  jobname: string; rotulo: string; descricao: string | null; fonte: string; schedule: string | null; active: boolean | null; existe: boolean;
  ultima_execucao: string | null; ultimo_status: string | null; ultima_msg: string | null; duracao_s: number | null; execucoes_24h: number; falhas_24h: number;
}
interface Fonte { fonte: string; entidade: string; escopo: string; modo: string; status: string; registros: number; paginas: number; erro: string | null; atualizado_em: string }
interface Log { id: number; fonte: string; entidade: string; tipo_carga: string; status: string; linhas_lidas: number | null; janela_inicio: string | null; janela_fim: string | null; iniciado_em: string; finalizado_em: string | null; mensagem_erro: string | null }
interface Cobertura { mes: string; transacoes: number; aprovadas: number; ultima_captura: string }
interface CargaMensal { mes: string; status: string; chamadas: number; lidas: number | null; versoes_novas: number | null; iniciado_em: string | null; finalizado_em: string | null; erro: string | null }
interface Historico { quando: string; quem: string | null; tipo: string; chave: string; antes: unknown; depois: unknown }
interface Estado {
  agora: string; banco_mb: number; ultima_captura: string | null; parametros: Parametro[]; agendamentos: Agendamento[];
  fontes: Fonte[]; logs: Log[]; cobertura: Cobertura[]; carga_mensal: CargaMensal[]; historico: Historico[];
}

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const num = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR');
const GRUPO: Record<string, string> = { horarios: 'Horários de atualização', prazos: 'Prazos e timers', geral: 'Geral' };
const STATUS_COR: Record<string, string> = {
  succeeded: 'text-emerald-400', sucesso: 'text-emerald-400', concluido: 'text-emerald-400',
  failed: 'text-red-400', erro: 'text-red-400', parcial: 'text-amber-400', em_andamento: 'text-amber-400', pendente: 'text-muted-foreground',
};

/** Explica uma expressão cron (minuto hora * * *) em português, só para os casos simples. */
function explicaCron(s: string | null): string {
  if (!s) return '';
  const [min, hora] = s.split(' ');
  const utc2br = (h: string) => h.split(',').map((p) => {
    const [a, b] = p.split('-').map(Number);
    const c = (x: number) => ((x - 3 + 24) % 24).toString().padStart(2, '0');
    return b === undefined || isNaN(b) ? `${c(a)}h` : `${c(a)}h–${c(b)}h`;
  }).join(', ');
  if (hora === '*' && min.startsWith('*/')) return `a cada ${min.slice(2)} min`;
  if (hora === '*') return `todo dia às hh:${min.padStart(2, '0')}`;
  if (min.startsWith('*/')) return `a cada ${min.slice(2)} min, ${utc2br(hora)} (Brasília)`;
  return `minuto ${min} de ${utc2br(hora)} (Brasília)`;
}

function Secao({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="surface p-4 overflow-x-auto">
      <div className="flex items-center justify-between"><span className="section-label">{titulo}</span>{acao}</div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

interface Observacao { tipo: string; chave: string; observacoes: string }
function Observacoes({ tipo, chave, texto, aoSalvar }: { tipo: string; chave: string; texto: string; aoSalvar: () => void }) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () => r1Rpc('gerenciador_observacao_salvar', { p_tipo: tipo, p_chave: chave, p_observacoes: rascunho ?? texto }),
    onSuccess: () => { setRascunho(null); aoSalvar(); },
  });
  return <details className="mt-2 text-xs" title={texto || 'Adicione uma explicação para este ajuste'}>
    <summary className="cursor-pointer text-muted-foreground">Observações</summary>
    <textarea aria-label="Observações" maxLength={2000} value={rascunho ?? texto} onChange={e => setRascunho(e.target.value)} className="mt-2 w-full min-w-48 bg-secondary rounded p-2 text-foreground" />
    <button disabled={salvar.isPending || rascunho === null || rascunho === texto} onClick={() => salvar.mutate()} className="text-primary disabled:opacity-30">{salvar.isPending ? 'Salvando…' : 'Salvar observações'}</button>
    {salvar.error && <p role="alert" className="text-red-400">{(salvar.error as Error).message}</p>}
  </details>;
}

export default function Gerenciador() {
  const qc = useQueryClient();
  const notas = useQuery({ queryKey: ['gerenciador-observacoes'], queryFn: () => r1Rpc<Observacao[]>('gerenciador_observacoes') });
  const observacoes = (tipo: string, chave: string) => <Observacoes tipo={tipo} chave={chave} texto={notas.data?.find(n => n.tipo === tipo && n.chave === chave)?.observacoes ?? ''} aoSalvar={() => { qc.invalidateQueries({ queryKey: ['gerenciador-observacoes'] }); qc.invalidateQueries({ queryKey: ['gerenciador'] }); }} />;
  const estado = useQuery({ queryKey: ['gerenciador'], queryFn: () => r1Rpc<Estado>('gerenciador_estado'), refetchInterval: 60_000 });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [edicaoParam, setEdicaoParam] = useState<Record<string, string>>({});
  const invalidar = () => qc.invalidateQueries({ queryKey: ['gerenciador'] });

  const agendamento = useMutation({
    mutationFn: (v: { jobname: string; schedule?: string; active?: boolean }) =>
      r1Rpc('gerenciador_agendamento_atualizar', { p_jobname: v.jobname, p_schedule: v.schedule ?? null, p_active: v.active ?? null }),
    onSuccess: () => { setErro(null); setAviso('Agendamento atualizado.'); invalidar(); },
    onError: (e: Error) => { setAviso(null); setErro(e.message); },
  });
  const parametro = useMutation({
    mutationFn: (v: { chave: string; valor: number }) => r1Rpc('gerenciador_parametro_atualizar', { p_chave: v.chave, p_valor: v.valor }),
    onSuccess: () => { setErro(null); setAviso('Parâmetro salvo e aplicado nos agendamentos.'); invalidar(); },
    onError: (e: Error) => { setAviso(null); setErro(e.message); },
  });
  const executar = useMutation({
    mutationFn: (jobname: string) => r1Rpc('gerenciador_executar_agora', { p_jobname: jobname }),
    onSuccess: () => { setErro(null); setAviso('Disparado agora; o resultado aparece nos logs em alguns minutos.'); setTimeout(invalidar, 4000); },
    onError: (e: Error) => { setAviso(null); setErro(e.message); },
  });

  const d = estado.data;
  const grupos = d ? Array.from(new Set(d.parametros.map((p) => p.grupo))) : [];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo="Gerenciador"
        subtitulo={<>Integrações, horários, prazos e logs {d && `· banco ${num(d.banco_mb)} MB · última captura ${fmt(d.ultima_captura)}`}</>}
        acoes={<AtualizarPeriodo aoConcluir={() => estado.refetch()} />}
        onAtualizar={() => estado.refetch()}
        atualizando={estado.isFetching}
      />

      <main className="py-6 space-y-6 mx-auto max-w-[1520px] px-4 md:px-8">
        {estado.error && <div className="surface p-4 text-sm text-red-400">{(estado.error as Error).message}</div>}
        {erro && <div className="surface p-3 text-xs text-red-400">{erro}</div>}
        {aviso && <div className="surface p-3 text-xs text-emerald-400">{aviso}</div>}
        {estado.isLoading && <div className="surface p-4 text-sm text-muted-foreground">Carregando…</div>}

        {d && (
          <>
            {notas.error && <p role="alert" className="text-red-400">Não foi possível carregar Observações: {(notas.error as Error).message}</p>}
            <Secao titulo="Limites das integrações">
              <div className="text-sm" title={notas.data?.find(n => n.chave === 'hubspot_historico_lote')?.observacoes}>HubSpot · até 50 negócios por lote com histórico</div>
              {observacoes('limite', 'hubspot_historico_lote')}
            </Secao>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {d.agendamentos.map(a => <CardSincronizacao key={a.jobname} a={a} logs={d.logs.filter(l => l.fonte === a.fonte)} observacoes={observacoes('agendamento', a.jobname)} ocupado={agendamento.isPending || executar.isPending} salvar={v => agendamento.mutate(v)} executar={() => executar.mutate(a.jobname)} />)}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {grupos.map((g) => (
                <Secao key={g} titulo={GRUPO[g] ?? g}>
                  <div className="space-y-2">
                    {d.parametros.filter((p) => p.grupo === g).map((p) => (
                      <div key={p.chave} className="flex items-center gap-3 text-xs">
                        <div className="flex-1">
                          <div className="font-semibold text-foreground">{p.rotulo}</div>
                          <div className="text-muted-foreground">{p.descricao}</div>
                          {observacoes('parametro', p.chave)}
                        </div>
                        <input type="number" value={edicaoParam[p.chave] ?? String(p.valor)} onChange={(e) => setEdicaoParam({ ...edicaoParam, [p.chave]: e.target.value })}
                          className="mono w-20 bg-secondary rounded px-2 py-1 text-right text-foreground" />
                        <button disabled={edicaoParam[p.chave] === undefined || Number(edicaoParam[p.chave]) === p.valor}
                          onClick={() => { parametro.mutate({ chave: p.chave, valor: Number(edicaoParam[p.chave]) }); setEdicaoParam((c) => { const n = { ...c }; delete n[p.chave]; return n; }); }}
                          className="text-primary disabled:opacity-30" title="Salvar"><Save className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </Secao>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Secao titulo="Cobertura da Guru por mês (pedidos distintos)">
                <table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground"><th className="pb-2 font-semibold text-left">Mês</th><th className="pb-2 font-semibold text-right">Transações</th><th className="pb-2 font-semibold text-right">Aprovadas</th><th className="pb-2 font-semibold text-right">Última captura</th></tr></thead>
                  <tbody>{d.cobertura.map((c) => (
                    <tr key={c.mes} className="border-t border-border"><td className="py-1.5">{c.mes}</td><td className="py-1.5 text-right mono">{num(c.transacoes)}</td><td className="py-1.5 text-right mono">{num(c.aprovadas)}</td><td className="py-1.5 text-right mono">{fmt(c.ultima_captura)}</td></tr>
                  ))}</tbody>
                </table>
              </Secao>
              <Secao titulo="Estado por fonte">
                <table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground text-left"><th className="pb-2 font-semibold">Fonte</th><th className="pb-2 font-semibold">Escopo</th><th className="pb-2 font-semibold">Status</th><th className="pb-2 font-semibold text-right">Registros</th><th className="pb-2 font-semibold text-right">Atualizado</th></tr></thead>
                  <tbody>{d.fontes.map((f) => (
                    <tr key={`${f.fonte}-${f.entidade}-${f.escopo}`} className="border-t border-border">
                      <td className="py-1.5">{f.fonte} · {f.entidade}</td><td className="py-1.5 mono">{f.escopo || f.modo}</td>
                      <td className={`py-1.5 ${STATUS_COR[f.status] ?? ''}`} title={f.erro ?? ''}>{f.status}{f.erro && ' ⚠'}</td>
                      <td className="py-1.5 text-right mono">{num(f.registros)}</td><td className="py-1.5 text-right mono">{fmt(f.atualizado_em)}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {d.carga_mensal.length > 0 && (
                  <div className="mt-4">
                    <span className="section-label">Carga de 2026 mês a mês</span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {d.carga_mensal.map((m) => (
                        <span key={m.mes} title={m.erro ?? `${num(m.lidas)} lidas`} className={`text-[10px] px-2 py-0.5 rounded bg-secondary ${STATUS_COR[m.status] ?? ''}`}>{m.mes.slice(0, 7)} · {m.status}{m.lidas != null && ` · ${num(m.lidas)}`}</span>
                      ))}
                    </div>
                  </div>
                )}
              </Secao>
            </div>

            <Secao titulo="Últimas cargas (log de ingestão)">
              <table className="w-full text-xs">
                <thead><tr className="text-muted-foreground text-left"><th className="pb-2 font-semibold">Início</th><th className="pb-2 font-semibold">Fonte</th><th className="pb-2 font-semibold">Tipo</th><th className="pb-2 font-semibold">Janela</th><th className="pb-2 font-semibold">Status</th><th className="pb-2 font-semibold text-right">Linhas</th><th className="pb-2 font-semibold">Erro</th></tr></thead>
                <tbody>{d.logs.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-1.5 mono">{fmt(l.iniciado_em)}</td><td className="py-1.5">{l.fonte} · {l.entidade}</td><td className="py-1.5">{l.tipo_carga}</td>
                    <td className="py-1.5 mono">{l.janela_inicio ?? ''}{l.janela_fim ? ` → ${l.janela_fim}` : ''}</td>
                    <td className={`py-1.5 ${STATUS_COR[l.status] ?? ''}`}>{l.status}</td><td className="py-1.5 text-right mono">{num(l.linhas_lidas)}</td>
                    <td className="py-1.5 text-red-400 truncate max-w-[280px]" title={l.mensagem_erro ?? ''}>{l.mensagem_erro}</td>
                  </tr>
                ))}</tbody>
              </table>
            </Secao>

            {d.historico.length > 0 && (
              <Secao titulo="Alterações feitas no gerenciador">
                <table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground text-left"><th className="pb-2 font-semibold">Quando</th><th className="pb-2 font-semibold">Quem</th><th className="pb-2 font-semibold">O quê</th><th className="pb-2 font-semibold">De</th><th className="pb-2 font-semibold">Para</th></tr></thead>
                  <tbody>{d.historico.map((h, i) => (
                    <tr key={i} className="border-t border-border"><td className="py-1.5 mono">{fmt(h.quando)}</td><td className="py-1.5">{h.quem ?? '—'}</td><td className="py-1.5">{h.tipo} · {h.chave}</td><td className="py-1.5 mono">{h.antes == null ? '' : JSON.stringify(h.antes)}</td><td className="py-1.5 mono">{h.depois == null ? '' : JSON.stringify(h.depois)}</td></tr>
                  ))}</tbody>
                </table>
              </Secao>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function horarioSimples(schedule: string | null) {
  const campos = (schedule ?? '').trim().split(/\s+/);
  if (campos.length !== 5 || campos.slice(2).some(v => v !== '*')) return null;
  const [minuto, horas] = campos;
  if (horas === '*' && (minuto === '0' || minuto === '*/15' || minuto === '*/30')) return { inicio: 0, fim: 23, intervalo: minuto === '0' ? 60 : Number(minuto.slice(2)) };
  return null;
}
function cronHorario(inicio: number, fim: number, intervalo: number) {
  const horas: number[] = [];
  const total = ((fim - inicio + 24) % 24) + 1;
  for (let i = 0; i < total; i += intervalo >= 60 ? intervalo / 60 : 1) horas.push((inicio + i + 3) % 24);
  return `${intervalo < 60 ? '*/' + intervalo : '0'} ${horas.length === 24 ? '*' : horas.join(',')} * * *`;
}
function CardSincronizacao({ a, logs, observacoes, ocupado, salvar, executar }: { a: Agendamento; logs: Log[]; observacoes: React.ReactNode; ocupado: boolean; salvar: (v: { jobname: string; schedule?: string; active?: boolean }) => void; executar: () => void }) {
  const [rascunho, setRascunho] = useState<{ inicio: number; fim: number; intervalo: number } | null>(null);
  const [cronAvancado, setCronAvancado] = useState<string | null>(null);
  const [duracao, setDuracao] = useState<string | null>(null);
  const [logAberto, setLogAberto] = useState(false);
  const [logSelecionado, setLogSelecionado] = useState<Log | null>(null);
  const intervaloValido = duracao === null || /^\d{2}:\d{2}:00$/.test(duracao) && (() => { const [h, m] = duracao.split(':').map(Number); const n = h * 60 + m; return m < 60 && n > 0 && (n < 60 ? 60 % n === 0 : n % 60 === 0 && 24 % (n / 60) === 0); })();
  const atual = rascunho ?? horarioSimples(a.schedule);
  const alterar = (campo: 'inicio' | 'fim' | 'intervalo', valor: number) => setRascunho({ ...(atual ?? { inicio: 0, fim: 23, intervalo: 60 }), [campo]: valor });
  return <section className="surface p-5 space-y-4">
    <h2 className="text-base font-bold">Sincronização · {a.rotulo}</h2>
    <div className="flex items-center justify-between gap-3"><label htmlFor={`auto-${a.jobname}`} className="text-sm">Auto-sync</label><input id={`auto-${a.jobname}`} type="checkbox" role="switch" checked={!!a.active} disabled={!a.existe || ocupado} onChange={e => salvar({ jobname: a.jobname, active: e.target.checked })} className="w-5 h-5 accent-[hsl(var(--primary))]" /></div>
    {a.descricao && <p className="text-xs text-muted-foreground">{a.descricao}</p>}
    <p className="text-xs text-muted-foreground">{a.existe ? (a.active ? 'Automático ativo' : 'Automático pausado') : 'Rotina ainda não cadastrada'} · {explicaCron(a.schedule)}</p>
    {atual ? <div className="grid grid-cols-3 gap-2"><label className="text-xs">Início<input type="number" min={0} max={23} value={atual.inicio} onChange={e => alterar('inicio', Number(e.target.value))} className="input-r1 mt-1 w-full" /></label><label className="text-xs">Fim<input type="number" min={0} max={23} value={atual.fim} onChange={e => alterar('fim', Number(e.target.value))} className="input-r1 mt-1 w-full" /></label><label className="text-xs">Tempo de atualização<input aria-label={`Tempo de atualização ${a.rotulo}`} placeholder="01:00:00" value={duracao ?? `${Math.floor(atual.intervalo / 60).toString().padStart(2, '0')}:${(atual.intervalo % 60).toString().padStart(2, '0')}:00`} onChange={e => { const v = e.target.value; setDuracao(v); if (/^\d{2}:\d{2}:00$/.test(v)) { const [h,m] = v.split(':').map(Number); alterar('intervalo', h * 60 + m); } }} className="input-r1 mt-1 w-full mono" /></label></div> : <p className="text-xs text-muted-foreground">Horário personalizado. Para substituir por uma rotina diária, <button type="button" className="text-primary underline" onClick={() => setRascunho({ inicio: 0, fim: 23, intervalo: 60 })}>configurar horário</button>.</p>}
    {!intervaloValido && <p role="alert" className="text-xs text-red-400">Use HH:MM:00. Intervalos em minutos precisam dividir 60; intervalos em horas precisam dividir 24. Ex.: 00:01:00, 00:15:00, 01:00:00 ou 02:00:00.</p>}
    <p className="text-[11px] text-muted-foreground">Horários de Brasília · fim inclusivo. O agendamento é salvo em UTC.</p>
    <div className="flex flex-wrap gap-2"><button type="button" disabled={!a.existe || ocupado || !rascunho || !intervaloValido || rascunho.inicio < 0 || rascunho.inicio > 23 || rascunho.fim < 0 || rascunho.fim > 23 || !Number.isInteger(rascunho.inicio) || !Number.isInteger(rascunho.fim)} onClick={() => { if (rascunho) salvar({ jobname: a.jobname, schedule: cronHorario(rascunho.inicio, rascunho.fim, rascunho.intervalo) }); }} className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold disabled:opacity-40">Salvar</button><button type="button" disabled={!a.existe || ocupado} onClick={executar} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-40">Sincronizar agora</button></div>
    {observacoes}
    <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Configuração avançada</summary><label className="block mt-2">Expressão cron em UTC<input aria-label={`Cron ${a.rotulo}`} value={cronAvancado ?? a.schedule ?? ''} onChange={e => setCronAvancado(e.target.value)} className="input-r1 w-full mt-1 mono" /></label><button type="button" disabled={!a.existe || ocupado || cronAvancado === null || cronAvancado === a.schedule} onClick={() => { if (cronAvancado !== null) salvar({ jobname: a.jobname, schedule: cronAvancado }); }} className="text-primary mt-2 disabled:opacity-40">Salvar cron</button></details>
    <div className="border-t border-border pt-3"><button type="button" onClick={() => { setLogSelecionado(null); setLogAberto(true); }} className="font-semibold text-xs underline">Abrir log de atualização</button><p className="text-[11px] text-muted-foreground mt-1">Última execução {fmt(a.ultima_execucao)} · <span className={STATUS_COR[a.ultimo_status ?? '']}>{a.ultimo_status || 'Sem execução'}</span></p>{a.ultima_msg && <p className="text-xs break-words mt-1">{a.ultima_msg}</p>}<ul className="space-y-2 max-h-48 overflow-y-auto mt-3">{logs.slice(0, 5).map(l => <li key={l.id} className="text-[11px] border-t border-border pt-2"><button type="button" className="underline mr-2" onClick={() => { setLogSelecionado(l); setLogAberto(true); }}>Detalhes</button><span>{fmt(l.iniciado_em)} · {l.linhas_lidas == null ? 'Quantidade não disponível' : num(l.linhas_lidas) + ' registros'}</span><span className={`ml-2 ${STATUS_COR[l.status] ?? ''}`}>{l.status}</span>{l.mensagem_erro && <p className="text-red-400 mt-1 break-words">{l.mensagem_erro}</p>}</li>)}</ul></div>
    <Dialog open={logAberto} onOpenChange={setLogAberto}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Atualização · {a.rotulo}</DialogTitle><DialogDescription>Resultado do agendamento e registros disponíveis da fonte.</DialogDescription></DialogHeader>
        <dl className="text-sm space-y-2">
          <div><dt className="font-semibold">Status</dt><dd>{logSelecionado?.status ?? a.ultimo_status ?? 'Sem execução'}</dd></div>
          <div><dt className="font-semibold">Início</dt><dd>{fmt(logSelecionado?.iniciado_em ?? a.ultima_execucao)}</dd></div>
          <div><dt className="font-semibold">Fim</dt><dd>{fmt(logSelecionado?.finalizado_em)}</dd></div>
          <div><dt className="font-semibold">Registros carregados</dt><dd>{logSelecionado?.linhas_lidas == null ? 'Quantidade não informada pelo log' : num(logSelecionado.linhas_lidas)}</dd></div>
          <div><dt className="font-semibold">Entidade / carga</dt><dd>{logSelecionado ? `${logSelecionado.entidade} · ${logSelecionado.tipo_carga}` : 'Selecione uma execução da fonte abaixo'}</dd></div>
          <div><dt className="font-semibold">Período carregado</dt><dd>{logSelecionado?.janela_inicio ?? 'Não informado'} → {logSelecionado?.janela_fim ?? 'Não informado'}</dd></div>
          <div><dt className="font-semibold">Mensagem / motivo da falha</dt><dd className="break-words whitespace-pre-wrap">{logSelecionado?.mensagem_erro ?? a.ultima_msg ?? 'Nenhuma mensagem registrada'}</dd></div>
        </dl>
        {!logSelecionado && <p className="text-xs text-muted-foreground">O sucesso do agendamento confirma o disparo. A conclusão da coleta deve ser conferida no log da fonte.</p>}
        <ul className="text-xs space-y-2">{logs.map(l => <li key={l.id}><button type="button" className="underline" onClick={() => setLogSelecionado(l)}>{fmt(l.iniciado_em)} · {l.entidade} · {l.status}</button></li>)}</ul>
        <button type="button" disabled={!a.existe || ocupado} onClick={executar} className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-40">Sincronizar novamente</button>
        <p className="text-xs text-muted-foreground">Executa a configuração atual dessa rotina; não altera o período de uma execução anterior.</p>
      </DialogContent>
    </Dialog>
  </section>;
}
