import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Download } from 'lucide-react';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import UserMenu from '@/components/UserMenu';

interface Presenca {
  linha: string | null; cidade: string; mes_evento: string; data_evento: string | null; evento_id: number | null;
  esperados: number; presentes: number; convidados: number; cancelados: number; presentes_cortesia: number; presentes_vip: number;
  taxa_presenca: number | null; atualizado_em: string | null;
}
interface Resumo {
  cidade: string; mes_evento: string; data_evento: string | null; esperados: number; presentes: number; nao_chegaram: number;
  sem_participante: number; cancelados: number; por_tipo: { tipo: string; esperados: number; presentes: number }[] | null; atualizado_em: string | null;
}
interface Linha {
  participante: string | null; email_comprador: string | null; status: string; tipo: string | null; produto: string | null;
  checkin_visto_em: string | null; ingressos_do_comprador: number;
}
type Situacao = 'ausentes' | 'presentes' | 'cancelados' | 'sem_participante' | 'todos';

const num = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR');
const mesLabel = (d: string) => { const [y, m] = d.split('-'); return `${m}/${y}`; };
const dataBR = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const horaBR = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const mesISO = (offset: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7) + '-01'; };
const STATUS: Record<string, string> = { checked_in: 'Presente', assigned: 'Não chegou', invited: 'Convidado, não chegou', canceled: 'Cancelado', open: 'Sem participante' };
const SITUACOES: { k: Situacao; r: string }[] = [
  { k: 'ausentes', r: 'Ainda não chegaram' }, { k: 'presentes', r: 'Presentes' }, { k: 'sem_participante', r: 'Sem participante' }, { k: 'cancelados', r: 'Cancelados' }, { k: 'todos', r: 'Todos (sem cancelados)' },
];

function csv(linhas: Linha[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cab = ['participante', 'email_comprador', 'situacao', 'tipo', 'produto', 'checkin_visto_em', 'ingressos_do_comprador'];
  const corpo = linhas.map((l) => [l.participante, l.email_comprador, STATUS[l.status] ?? l.status, l.tipo, l.produto, l.checkin_visto_em, l.ingressos_do_comprador].map(esc).join(';'));
  return '﻿' + [cab.join(';'), ...corpo].join('\n');
}

export default function Checkins() {
  const { pode } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [de, setDe] = useState(mesISO(-2));
  const [ate, setAte] = useState(mesISO(2));
  const cidade = sp.get('cidade');
  const mes = sp.get('mes');
  const [situacao, setSituacao] = useState<Situacao>('ausentes');
  const veNomes = pode('dados_pessoais');

  const eventos = useQuery({ queryKey: ['presenca', de, ate], queryFn: () => r1Rpc<Presenca[]>('presenca_eventos', { p_inicio: de, p_fim: ate }), refetchInterval: 60_000 });
  const resumo = useQuery({ queryKey: ['checkins-resumo', cidade, mes], enabled: !!cidade && !!mes, refetchInterval: 60_000, queryFn: () => r1Rpc<Resumo[]>('checkins_resumo', { p_cidade: cidade, p_mes: mes }).then((r) => r[0]) });
  const lista = useQuery({ queryKey: ['checkins-lista', cidade, mes, situacao], enabled: !!cidade && !!mes && veNomes, refetchInterval: 60_000, queryFn: () => r1Rpc<Linha[]>('checkins_lista', { p_cidade: cidade, p_mes: mes, p_situacao: situacao }) });

  const [busca, setBusca] = useState('');
  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const l = lista.data ?? [];
    return q ? l.filter((x) => (x.participante ?? '').toLowerCase().includes(q) || (x.email_comprador ?? '').toLowerCase().includes(q)) : l;
  }, [lista.data, busca]);

  const baixar = () => {
    const blob = new Blob([csv(filtrada)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `checkins-${cidade}-${mes?.slice(0, 7)}-${situacao}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const r = resumo.data;
  const taxa = r && r.esperados > 0 ? ((100 * r.presentes) / r.esperados).toFixed(0) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="dashboard-header">
        <div className="flex items-center gap-3">
          <Link to="/central/eventos" className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center" title="Voltar"><ArrowLeft className="w-4 h-4 text-primary" /></Link>
          <div>
            <h1 className="text-sm font-extrabold text-foreground tracking-wide">Check-ins</h1>
            <p className="text-[10px] text-muted-foreground font-medium">Esperados, presentes, quem ainda não chegou e cancelados · e-tickets da Guru{r?.atualizado_em ? ` · lido ${horaBR(r.atualizado_em)}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={de.slice(0, 7)} onChange={(e) => setDe(`${e.target.value}-01`)} className="mono text-xs bg-secondary rounded px-2 py-1 text-foreground" />
          <span className="text-xs text-muted-foreground">a</span>
          <input type="month" value={ate.slice(0, 7)} onChange={(e) => setAte(`${e.target.value}-01`)} className="mono text-xs bg-secondary rounded px-2 py-1 text-foreground" />
          <button onClick={() => { eventos.refetch(); resumo.refetch(); lista.refetch(); }} className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary" title="Atualizar"><RefreshCw className={`w-4 h-4 ${eventos.isFetching || lista.isFetching ? 'animate-spin' : ''}`} /></button>
          <UserMenu />
        </div>
      </header>

      <main className="py-6 space-y-6 mx-auto max-w-[1520px] px-4 md:px-8">
        {eventos.error && <div className="surface p-4 text-sm text-red-400">{(eventos.error as Error).message}</div>}

        <section className="surface p-4 overflow-x-auto">
          <span className="section-label">Eventos (clique para ver os check-ins)</span>
          <table className="w-full mt-3 text-xs">
            <thead><tr className="text-muted-foreground text-left">
              <th className="pb-2 font-semibold">Evento</th><th className="pb-2 font-semibold">Data</th><th className="pb-2 font-semibold text-right">Esperados</th><th className="pb-2 font-semibold text-right">Presentes</th><th className="pb-2 font-semibold text-right">Não chegaram</th><th className="pb-2 font-semibold text-right">Cancelados</th><th className="pb-2 font-semibold text-right">Presença</th>
            </tr></thead>
            <tbody>
              {eventos.isLoading && <tr><td colSpan={7} className="py-3 text-muted-foreground">Carregando…</td></tr>}
              {!eventos.isLoading && (eventos.data ?? []).length === 0 && <tr><td colSpan={7} className="py-3 text-muted-foreground">Nenhum e-ticket no período.</td></tr>}
              {(eventos.data ?? []).map((e) => {
                const sel = e.cidade === cidade && e.mes_evento === mes;
                return (
                  <tr key={`${e.cidade}-${e.mes_evento}`} className={`border-t border-border cursor-pointer hover:bg-secondary/40 ${sel ? 'bg-primary/5' : ''}`} onClick={() => setSp({ cidade: e.cidade, mes: e.mes_evento })}>
                    <td className="py-2"><div className="font-semibold text-foreground">{e.cidade}</div><div className="text-muted-foreground">{mesLabel(e.mes_evento)}</div></td>
                    <td className="py-2 mono">{dataBR(e.data_evento)}</td>
                    <td className="py-2 text-right mono">{num(e.esperados)}</td>
                    <td className="py-2 text-right mono font-bold text-foreground">{num(e.presentes)}</td>
                    <td className="py-2 text-right mono">{num(e.esperados - e.presentes)}</td>
                    <td className="py-2 text-right mono">{num(e.cancelados)}</td>
                    <td className="py-2 text-right mono">{e.taxa_presenca != null ? `${e.taxa_presenca}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {cidade && mes && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="kpi-card"><div className="kpi-label">{cidade} · {mesLabel(mes)}</div><div className="kpi-value mono">{r ? dataBR(r.data_evento) : '…'}</div><div className="text-[10px] text-muted-foreground mt-1">data do evento</div></div>
              <div className="kpi-card"><div className="kpi-label">Esperados</div><div className="kpi-value mono">{r ? num(r.esperados) : '…'}</div><div className="text-[10px] text-muted-foreground mt-1">{r?.sem_participante ? `${num(r.sem_participante)} ainda sem participante` : 'e-tickets não cancelados'}</div></div>
              <div className="kpi-card"><div className="kpi-label">Presentes</div><div className="kpi-value mono text-emerald-400">{r ? num(r.presentes) : '…'}</div><div className="text-[10px] text-muted-foreground mt-1">{taxa != null ? `${taxa}% de presença` : ''}</div></div>
              <div className="kpi-card"><div className="kpi-label">Ainda não chegaram</div><div className="kpi-value mono text-amber-400">{r ? num(r.nao_chegaram) : '…'}</div></div>
              <div className="kpi-card"><div className="kpi-label">Cancelados</div><div className="kpi-value mono">{r ? num(r.cancelados) : '…'}</div></div>
            </div>

            {r?.por_tipo && r.por_tipo.length > 0 && (
              <section className="surface p-4">
                <span className="section-label">Por tipo de ingresso</span>
                <div className="flex flex-wrap gap-4 mt-3 text-xs">
                  {r.por_tipo.map((t) => (
                    <div key={t.tipo} className="min-w-[140px]"><div className="text-muted-foreground">{t.tipo}</div><div className="mono text-foreground font-bold">{num(t.presentes)} <span className="text-muted-foreground font-normal">/ {num(t.esperados)}{t.esperados ? ` · ${((100 * t.presentes) / t.esperados).toFixed(0)}%` : ''}</span></div></div>
                  ))}
                </div>
              </section>
            )}

            <section className="surface p-4 overflow-x-auto">
              <div className="flex flex-wrap items-center gap-2">
                <span className="section-label">Lista de participantes</span>
                <div className="flex gap-1 ml-auto">
                  {SITUACOES.map((s) => (
                    <button key={s.k} onClick={() => setSituacao(s.k)} className={`px-2 py-1 rounded text-[11px] font-semibold ${situacao === s.k ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>{s.r}</button>
                  ))}
                </div>
                {veNomes && <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou e-mail" className="bg-secondary rounded px-2 py-1 text-xs text-foreground w-48" />}
                {veNomes && <button onClick={baixar} disabled={!filtrada.length} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-secondary text-foreground disabled:opacity-50" title="Baixar CSV"><Download className="w-3.5 h-3.5" /> CSV</button>}
              </div>
              {!veNomes && <p className="text-xs text-muted-foreground mt-3">Seu perfil vê os totais, mas não a lista com nomes e e-mails (recurso "dados pessoais").</p>}
              {veNomes && (
                <table className="w-full mt-3 text-xs">
                  <thead><tr className="text-muted-foreground text-left">
                    <th className="pb-2 font-semibold">Participante</th><th className="pb-2 font-semibold">E-mail do comprador</th><th className="pb-2 font-semibold">Situação</th><th className="pb-2 font-semibold">Tipo</th><th className="pb-2 font-semibold">Check-in visto</th><th className="pb-2 font-semibold text-right">Ingressos do comprador</th>
                  </tr></thead>
                  <tbody>
                    {lista.isLoading && <tr><td colSpan={6} className="py-3 text-muted-foreground">Carregando…</td></tr>}
                    {lista.error && <tr><td colSpan={6} className="py-3 text-red-400">{(lista.error as Error).message}</td></tr>}
                    {!lista.isLoading && filtrada.length === 0 && <tr><td colSpan={6} className="py-3 text-muted-foreground">Ninguém nesta situação.</td></tr>}
                    {filtrada.map((l, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1.5 font-semibold text-foreground">{l.participante ?? <span className="text-muted-foreground font-normal">sem nome</span>}</td>
                        <td className="py-1.5 mono">{l.email_comprador ?? '—'}</td>
                        <td className="py-1.5">{STATUS[l.status] ?? l.status}</td>
                        <td className="py-1.5">{l.tipo ?? '—'}</td>
                        <td className="py-1.5 mono">{l.status === 'checked_in' ? horaBR(l.checkin_visto_em) : '—'}</td>
                        <td className="py-1.5 text-right mono">{num(l.ingressos_do_comprador)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-[10px] text-muted-foreground mt-3">"Check-in visto" é o momento em que a leitura da Guru encontrou o ingresso como presente (a lista é relida a cada ~20 min; no dia do evento, o item 14 do backlog vai acelerar para 1 min). Até {num(5000)} linhas por lista.</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
