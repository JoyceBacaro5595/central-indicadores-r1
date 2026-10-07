import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Download, Check, X, Phone, Undo2 } from 'lucide-react';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/shared';

interface Resumo {
  na_fila: number; valor_na_fila: number; contatados: number; recuperados: number; descartados: number; ja_compraram_depois: number; horas_parametro: number;
  por_cidade: { cidade: string | null; mes_evento: string | null; na_fila: number; valor: number }[] | null;
}
interface Pedido {
  transacao_id: string; status: string; criado_em: string; horas_pendente: number; produto_nome: string; cidade_evento: string | null; mes_evento: string | null;
  tipo_ingresso: string | null; canal: string | null; qtd_ingressos: number; valor_bruto: number; metodo_pagamento: string; parcelas: number | null; cupom: string | null;
  nome_contato: string | null; email: string | null; telefone: string | null; cidade_comprador: string | null; uf_comprador: string | null;
  utm_source: string | null; utm_campaign: string | null; ja_comprou_depois: boolean; situacao: string; observacao: string | null; situacao_em: string | null;
}
type Situacao = 'pendente' | 'contatado' | 'recuperado' | 'descartado' | 'todos';

const num = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR');
const brl = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesLabel = (d: string | null) => { if (!d) return '—'; const [y, m] = d.split('-'); return `${m}/${y}`; };
const quando = (d: string | null) => (d ? new Date(d + (d.endsWith('Z') || d.includes('+') ? '' : 'Z')).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const STATUS: Record<string, string> = { waiting_payment: 'Aguardando pagamento', expired: 'Expirado', unpaid: 'Não pago' };
const PAG: Record<string, string> = { pix: 'Pix', credit_card: 'Cartão', billet: 'Boleto', free: 'Gratuito' };
const SIT: Record<string, string> = { pendente: 'Na fila', contatado: 'Contatado', recuperado: 'Recuperado', descartado: 'Descartado' };
const SITUACOES: { k: Situacao; r: string }[] = [{ k: 'pendente', r: 'Na fila' }, { k: 'contatado', r: 'Contatados' }, { k: 'recuperado', r: 'Recuperados' }, { k: 'descartado', r: 'Descartados' }, { k: 'todos', r: 'Todos' }];

const tel = (t: string | null) => (t ? t.replace(/\D/g, '') : '');
const whats = (p: Pedido) => {
  const d = tel(p.telefone); if (!d) return null;
  const n = d.startsWith('55') ? d : `55${d}`;
  const nome = (p.nome_contato ?? '').split(' ')[0];
  const msg = `Olá${nome ? `, ${nome}` : ''}! Vi que você iniciou a compra do ingresso ${p.produto_nome} e o pagamento não foi concluído. Posso te ajudar a finalizar?`;
  return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
};

function csv(l: Pedido[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cab = ['pedido', 'criado_em', 'horas_pendente', 'status', 'produto', 'cidade', 'mes_evento', 'tipo', 'canal', 'qtd', 'valor', 'pagamento', 'nome', 'email', 'telefone', 'cidade_comprador', 'uf', 'utm_source', 'utm_campaign', 'situacao', 'observacao'];
  const corpo = l.map((p) => [p.transacao_id, p.criado_em, p.horas_pendente, STATUS[p.status] ?? p.status, p.produto_nome, p.cidade_evento, p.mes_evento, p.tipo_ingresso, p.canal, p.qtd_ingressos, p.valor_bruto, PAG[p.metodo_pagamento] ?? p.metodo_pagamento, p.nome_contato, p.email, p.telefone, p.cidade_comprador, p.uf_comprador, p.utm_source, p.utm_campaign, SIT[p.situacao] ?? p.situacao, p.observacao].map(esc).join(';'));
  return '﻿' + [cab.join(';'), ...corpo].join('\n');
}

export default function Recuperacao() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [situacao, setSituacao] = useState<Situacao>('pendente');
  const [cidade, setCidade] = useState<string>('');
  const [recomprados, setRecomprados] = useState(false);
  const [busca, setBusca] = useState('');
  const [obs, setObs] = useState<Record<string, string>>({});
  const veDados = pode('dados_pessoais');

  const resumo = useQuery({ queryKey: ['recuperacao-resumo'], queryFn: () => r1Rpc<Resumo[]>('recuperacao_resumo').then((r) => r[0]), refetchInterval: 5 * 60_000 });
  const fila = useQuery({ queryKey: ['recuperacao-fila', situacao, cidade, recomprados], queryFn: () => r1Rpc<Pedido[]>('recuperacao_fila', { p_situacao: situacao, p_cidade: cidade || null, p_incluir_recomprados: recomprados }), refetchInterval: 5 * 60_000 });
  const marcar = useMutation({
    mutationFn: (v: { id: string; situacao: string; observacao?: string | null }) => r1Rpc('recuperacao_marcar', { p_transacao_id: v.id, p_situacao: v.situacao, p_observacao: v.observacao ?? null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recuperacao-fila'] }); qc.invalidateQueries({ queryKey: ['recuperacao-resumo'] }); },
  });

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const l = fila.data ?? [];
    return q ? l.filter((p) => [p.nome_contato, p.email, p.produto_nome, p.transacao_id].some((x) => (x ?? '').toLowerCase().includes(q))) : l;
  }, [fila.data, busca]);
  const cidades = useMemo(() => Array.from(new Set((resumo.data?.por_cidade ?? []).map((c) => c.cidade).filter(Boolean) as string[])).sort(), [resumo.data]);

  const baixar = () => {
    const blob = new Blob([csv(lista)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `recuperacao-${situacao}${cidade ? `-${cidade}` : ''}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const r = resumo.data;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo="Recuperação de carrinho"
        subtitulo={`Pedidos expirados ou aguardando pagamento há mais de ${r?.horas_parametro ?? 4} h · eventos deste mês em diante · últimos 90 dias`}
        onAtualizar={() => { resumo.refetch(); fila.refetch(); }}
        atualizando={fila.isFetching}
      />

      <main className="py-6 space-y-6 mx-auto max-w-[1520px] px-4 md:px-8">
        {(resumo.error || fila.error) && <div className="surface p-4 text-sm text-red-400">{((resumo.error ?? fila.error) as Error).message}</div>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="kpi-card"><div className="kpi-label">Na fila</div><div className="kpi-value mono">{r ? num(r.na_fila) : '…'}</div><div className="text-[10px] text-muted-foreground mt-1">{r ? brl(r.valor_na_fila) : ''} em pedidos</div></div>
          <div className="kpi-card"><div className="kpi-label">Contatados</div><div className="kpi-value mono">{r ? num(r.contatados) : '…'}</div></div>
          <div className="kpi-card"><div className="kpi-label">Recuperados</div><div className="kpi-value mono text-emerald-400">{r ? num(r.recuperados) : '…'}</div><div className="text-[10px] text-muted-foreground mt-1">marcados pela equipe</div></div>
          <div className="kpi-card"><div className="kpi-label">Compraram depois</div><div className="kpi-value mono">{r ? num(r.ja_compraram_depois) : '…'}</div><div className="text-[10px] text-muted-foreground mt-1">mesmo e-mail e produto, pedido aprovado depois; saem da fila sozinhos</div></div>
          <div className="kpi-card"><div className="kpi-label">Descartados</div><div className="kpi-value mono">{r ? num(r.descartados) : '…'}</div></div>
        </div>

        {r?.por_cidade && r.por_cidade.length > 0 && (
          <section className="surface p-4">
            <span className="section-label">Fila por evento</span>
            <div className="flex flex-wrap gap-2 mt-3">
              {r.por_cidade.map((c) => (
                <button key={`${c.cidade}-${c.mes_evento}`} onClick={() => setCidade(cidade === c.cidade ? '' : (c.cidade ?? ''))} className={`text-left px-3 py-2 rounded-lg text-xs ${cidade === c.cidade ? 'bg-primary/15 text-primary' : 'bg-secondary hover:bg-secondary/70'}`}>
                  <div className="font-semibold">{c.cidade ?? 'Sem cidade'} <span className="text-muted-foreground font-normal">{mesLabel(c.mes_evento)}</span></div>
                  <div className="mono">{num(c.na_fila)} · {brl(c.valor)}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="surface p-4 overflow-x-auto">
          <div className="flex flex-wrap items-center gap-2">
            <span className="section-label">Pedidos</span>
            <div className="flex gap-1 ml-auto">
              {SITUACOES.map((s) => <button key={s.k} onClick={() => setSituacao(s.k)} className={`px-2 py-1 rounded text-[11px] font-semibold ${situacao === s.k ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>{s.r}</button>)}
            </div>
            <select value={cidade} onChange={(e) => setCidade(e.target.value)} className="bg-secondary rounded px-2 py-1 text-xs text-foreground">
              <option value="">Todas as cidades</option>
              {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="text-[11px] text-muted-foreground flex items-center gap-1"><input type="checkbox" checked={recomprados} onChange={(e) => setRecomprados(e.target.checked)} /> incluir quem já comprou depois</label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, e-mail, produto" className="bg-secondary rounded px-2 py-1 text-xs text-foreground w-52" />
            <button onClick={baixar} disabled={!lista.length} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-secondary text-foreground disabled:opacity-50"><Download className="w-3.5 h-3.5" /> CSV</button>
          </div>
          {!veDados && <p className="text-xs text-muted-foreground mt-3">Seu perfil vê a fila com nome e e-mail mascarados e sem telefone (recurso "dados pessoais").</p>}
          <table className="w-full mt-3 text-xs">
            <thead><tr className="text-muted-foreground text-left">
              <th className="pb-2 font-semibold">Pedido</th><th className="pb-2 font-semibold">Comprador</th><th className="pb-2 font-semibold">Evento</th><th className="pb-2 font-semibold text-right">Valor</th><th className="pb-2 font-semibold">Pagamento</th><th className="pb-2 font-semibold">Origem</th><th className="pb-2 font-semibold">Situação</th><th className="pb-2 font-semibold">Ações</th>
            </tr></thead>
            <tbody>
              {fila.isLoading && <tr><td colSpan={8} className="py-3 text-muted-foreground">Carregando…</td></tr>}
              {!fila.isLoading && lista.length === 0 && <tr><td colSpan={8} className="py-3 text-muted-foreground">Nenhum pedido nesta situação.</td></tr>}
              {lista.map((p) => {
                const w = veDados ? whats(p) : null;
                return (
                  <tr key={p.transacao_id} className={`border-t border-border align-top ${p.ja_comprou_depois ? 'opacity-60' : ''}`}>
                    <td className="py-2"><div className="mono text-foreground">{quando(p.criado_em)}</div><div className="text-muted-foreground">{STATUS[p.status] ?? p.status} · há {num(p.horas_pendente)} h</div><div className="text-muted-foreground mono">{p.transacao_id}</div></td>
                    <td className="py-2"><div className="font-semibold text-foreground">{p.nome_contato ?? '—'}</div><div className="mono">{p.email ?? '—'}</div>{p.telefone && <div className="mono">{p.telefone}</div>}{(p.cidade_comprador || p.uf_comprador) && <div className="text-muted-foreground">{[p.cidade_comprador, p.uf_comprador].filter(Boolean).join(' / ')}</div>}</td>
                    <td className="py-2"><div className="text-foreground">{p.cidade_evento ?? '—'} <span className="text-muted-foreground">{mesLabel(p.mes_evento)}</span></div><div className="text-muted-foreground">{p.tipo_ingresso ?? ''}{p.canal ? ` · ${p.canal}` : ''} · {num(p.qtd_ingressos)} ingr.</div><div className="text-muted-foreground truncate max-w-[220px]" title={p.produto_nome}>{p.produto_nome}</div></td>
                    <td className="py-2 text-right mono">{brl(p.valor_bruto)}{p.cupom && <div className="text-muted-foreground">cupom {p.cupom}</div>}</td>
                    <td className="py-2">{PAG[p.metodo_pagamento] ?? p.metodo_pagamento}{p.parcelas && p.parcelas > 1 ? ` ${p.parcelas}x` : ''}</td>
                    <td className="py-2 text-muted-foreground">{p.utm_source ?? '—'}{p.utm_campaign && <div className="truncate max-w-[160px]" title={p.utm_campaign}>{p.utm_campaign}</div>}</td>
                    <td className="py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${p.situacao === 'recuperado' ? 'bg-emerald-500/15 text-emerald-400' : p.situacao === 'contatado' ? 'bg-amber-500/15 text-amber-400' : p.situacao === 'descartado' ? 'bg-secondary text-muted-foreground' : 'bg-primary/15 text-primary'}`}>{SIT[p.situacao]}</span>{p.ja_comprou_depois && <div className="text-[10px] text-emerald-400 mt-1">comprou depois</div>}{p.observacao && <div className="text-muted-foreground mt-1 max-w-[180px]">{p.observacao}</div>}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {w && <a href={w} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 text-[11px] font-semibold" title="Abrir WhatsApp"><Phone className="w-3 h-3" /> WhatsApp</a>}
                        {p.situacao !== 'contatado' && <button onClick={() => marcar.mutate({ id: p.transacao_id, situacao: 'contatado', observacao: obs[p.transacao_id] ?? p.observacao })} className="px-2 py-1 rounded bg-secondary text-[11px] font-semibold text-foreground" title="Marcar como contatado">Contatado</button>}
                        {p.situacao !== 'recuperado' && <button onClick={() => marcar.mutate({ id: p.transacao_id, situacao: 'recuperado', observacao: obs[p.transacao_id] ?? p.observacao })} className="flex items-center gap-1 px-2 py-1 rounded bg-secondary text-[11px] font-semibold text-foreground" title="Marcar como recuperado"><Check className="w-3 h-3" /> Recuperado</button>}
                        {p.situacao !== 'descartado' && <button onClick={() => marcar.mutate({ id: p.transacao_id, situacao: 'descartado', observacao: obs[p.transacao_id] ?? p.observacao })} className="flex items-center gap-1 px-2 py-1 rounded bg-secondary text-[11px] font-semibold text-muted-foreground" title="Descartar"><X className="w-3 h-3" /></button>}
                        {p.situacao !== 'pendente' && <button onClick={() => marcar.mutate({ id: p.transacao_id, situacao: 'pendente', observacao: null })} className="flex items-center gap-1 px-2 py-1 rounded bg-secondary text-[11px] text-muted-foreground" title="Voltar para a fila"><Undo2 className="w-3 h-3" /></button>}
                      </div>
                      <input value={obs[p.transacao_id] ?? ''} onChange={(e) => setObs({ ...obs, [p.transacao_id]: e.target.value })} placeholder="observação" className="mt-1 bg-secondary rounded px-2 py-0.5 text-[11px] text-foreground w-40" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-muted-foreground mt-3">Entram na fila pedidos com qualquer forma de pagamento que expiraram ou seguem aguardando há mais de {r?.horas_parametro ?? 4} h (prazo editável no Gerenciador, parâmetro "recuperacao_horas"). Quem fez um pedido aprovado depois, com o mesmo e-mail e produto, sai da fila automaticamente. Eventos já passados não entram. Os pedidos vêm da Guru a cada hora; use "Atualizar período agora" na Central para antecipar.</p>
        </section>
      </main>
    </div>
  );
}
