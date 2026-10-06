import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Play, Pause, Save } from 'lucide-react';
import { r1Rpc } from '@/integrations/r1/client';
import UserMenu from '@/components/UserMenu';

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

export default function Gerenciador() {
  const qc = useQueryClient();
  const estado = useQuery({ queryKey: ['gerenciador'], queryFn: () => r1Rpc<Estado>('gerenciador_estado'), refetchInterval: 60_000 });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [edicaoCron, setEdicaoCron] = useState<Record<string, string>>({});
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
      <header className="dashboard-header">
        <div className="flex items-center gap-3">
          <Link to="/central" className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center" title="Voltar"><ArrowLeft className="w-4 h-4 text-primary" /></Link>
          <div>
            <h1 className="text-sm font-extrabold text-foreground tracking-wide">Gerenciador</h1>
            <p className="text-[10px] text-muted-foreground font-medium">Integrações, horários, prazos e logs {d && `· banco ${num(d.banco_mb)} MB · última captura ${fmt(d.ultima_captura)}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => estado.refetch()} disabled={estado.isFetching} className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50" title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${estado.isFetching ? 'animate-spin' : ''}`} />
          </button>
          <UserMenu />
        </div>
      </header>

      <main className="py-6 space-y-6 mx-auto max-w-[1520px] px-4 md:px-8">
        {estado.error && <div className="surface p-4 text-sm text-red-400">{(estado.error as Error).message}</div>}
        {erro && <div className="surface p-3 text-xs text-red-400">{erro}</div>}
        {aviso && <div className="surface p-3 text-xs text-emerald-400">{aviso}</div>}
        {estado.isLoading && <div className="surface p-4 text-sm text-muted-foreground">Carregando…</div>}

        {d && (
          <>
            <Secao titulo="Agendamentos (cron)">
              <table className="w-full text-xs">
                <thead><tr className="text-muted-foreground text-left"><th className="pb-2 font-semibold">Rotina</th><th className="pb-2 font-semibold">Quando (expressão cron, em UTC)</th><th className="pb-2 font-semibold">Última execução</th><th className="pb-2 font-semibold text-right">24h</th><th className="pb-2 font-semibold text-right">Ações</th></tr></thead>
                <tbody>
                  {d.agendamentos.map((a) => (
                    <tr key={a.jobname} className="border-t border-border align-top">
                      <td className="py-2 pr-3">
                        <div className="font-semibold text-foreground flex items-center gap-2">{a.rotulo}
                          <span className={`text-[10px] px-1.5 rounded ${a.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-secondary text-muted-foreground'}`}>{!a.existe ? 'não existe' : a.active ? 'ativo' : 'pausado'}</span>
                        </div>
                        <div className="text-muted-foreground">{a.descricao}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <input value={edicaoCron[a.jobname] ?? a.schedule ?? ''} onChange={(e) => setEdicaoCron({ ...edicaoCron, [a.jobname]: e.target.value })}
                            className="mono w-48 bg-secondary rounded px-2 py-1 text-foreground" />
                          {edicaoCron[a.jobname] !== undefined && edicaoCron[a.jobname] !== a.schedule && (
                            <button title="Salvar horário" onClick={() => { agendamento.mutate({ jobname: a.jobname, schedule: edicaoCron[a.jobname] }); setEdicaoCron((c) => { const n = { ...c }; delete n[a.jobname]; return n; }); }} className="text-primary"><Save className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                        <div className="text-muted-foreground mt-0.5">{explicaCron(a.schedule)}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div>{fmt(a.ultima_execucao)} <span className={STATUS_COR[a.ultimo_status ?? ''] ?? ''}>{a.ultimo_status ?? ''}</span></div>
                        <div className="text-muted-foreground truncate max-w-[260px]" title={a.ultima_msg ?? ''}>{a.ultima_msg}</div>
                      </td>
                      <td className="py-2 text-right mono">{num(a.execucoes_24h)}{a.falhas_24h > 0 && <span className="text-red-400"> ({a.falhas_24h} falhas)</span>}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {a.existe && (
                          <>
                            <button onClick={() => agendamento.mutate({ jobname: a.jobname, active: !a.active })} className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-secondary text-foreground" title={a.active ? 'Pausar' : 'Retomar'}>
                              {a.active ? <><Pause className="w-3.5 h-3.5" /> Pausar</> : <><Play className="w-3.5 h-3.5" /> Retomar</>}
                            </button>
                            <button onClick={() => executar.mutate(a.jobname)} className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-secondary text-primary" title="Executar agora"><Play className="w-3.5 h-3.5" /> Agora</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Secao>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {grupos.map((g) => (
                <Secao key={g} titulo={GRUPO[g] ?? g}>
                  <div className="space-y-2">
                    {d.parametros.filter((p) => p.grupo === g).map((p) => (
                      <div key={p.chave} className="flex items-center gap-3 text-xs">
                        <div className="flex-1">
                          <div className="font-semibold text-foreground">{p.rotulo}</div>
                          <div className="text-muted-foreground">{p.descricao}</div>
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
