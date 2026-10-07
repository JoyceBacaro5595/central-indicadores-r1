import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Plus, Save, FlaskConical } from 'lucide-react';
import { r1Rpc } from '@/integrations/r1/client';
import { PageHeader } from '@/components/shared';

interface Regra { id: number; dimensao: 'linha' | 'tipo' | 'canal'; prioridade: number; campo: 'produto' | 'oferta' | 'ambos'; padrao: string; valor: string; ativo: boolean; observacao: string | null; atualizado_em: string }
interface Historico { quando: string; quem: string | null; chave: string; antes: Partial<Regra> | null; depois: Partial<Regra> | null }
interface Lista { versao: number; cortesia_valor_zero: number; regras: Regra[]; historico: Historico[] }
interface Conflito { produto_id: string; produto_nome: string; oferta_nome: string | null; dimensoes: string; linha: string; tipo_ingresso: string; canal: string; transacoes: number; ingressos: number | null; ultima_venda: string }
type Teste = Record<string, { valor: string | null; conflito: boolean; regras: { id: number; prioridade: number; valor: string; padrao: string }[] } | null>;

const DIM: Record<string, string> = { linha: 'Linha (rota / produto)', tipo: 'Tipo de ingresso', canal: 'Canal de venda' };
const CAMPO: Record<string, string> = { produto: 'nome do produto', oferta: 'nome da oferta', ambos: 'produto ou oferta' };
const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const vazia = (dimensao: Regra['dimensao']): Omit<Regra, 'id' | 'atualizado_em'> => ({ dimensao, prioridade: 100, campo: 'produto', padrao: '', valor: '', ativo: true, observacao: '' });

function LinhaRegra({ r, aoSalvar, salvando }: { r: Omit<Regra, 'id' | 'atualizado_em'> & { id?: number }; aoSalvar: (v: Omit<Regra, 'id' | 'atualizado_em'> & { id?: number }) => void; salvando: boolean }) {
  const [v, setV] = useState(r);
  const mudou = JSON.stringify(v) !== JSON.stringify(r);
  const cls = 'bg-secondary rounded px-2 py-1 text-foreground';
  return (
    <tr className={`border-t border-border align-top ${!v.ativo ? 'opacity-50' : ''}`}>
      <td className="py-1.5 pr-2"><input type="number" value={v.prioridade} onChange={(e) => setV({ ...v, prioridade: Number(e.target.value) })} className={`${cls} mono w-16 text-right`} /></td>
      <td className="py-1.5 pr-2">
        <select value={v.campo} onChange={(e) => setV({ ...v, campo: e.target.value as Regra['campo'] })} className={cls}>
          {Object.entries(CAMPO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </td>
      <td className="py-1.5 pr-2"><input value={v.padrao} onChange={(e) => setV({ ...v, padrao: e.target.value })} placeholder="expressão (ex.: SELLER|TALITA)" className={`${cls} mono w-full min-w-[220px]`} /></td>
      <td className="py-1.5 pr-2"><input value={v.valor} onChange={(e) => setV({ ...v, valor: e.target.value })} placeholder="resultado" className={`${cls} w-full min-w-[150px] font-semibold`} /></td>
      <td className="py-1.5 pr-2"><input value={v.observacao ?? ''} onChange={(e) => setV({ ...v, observacao: e.target.value })} placeholder="observação" className={`${cls} w-full min-w-[160px]`} /></td>
      <td className="py-1.5 pr-2 text-center"><input type="checkbox" checked={v.ativo} onChange={(e) => setV({ ...v, ativo: e.target.checked })} /></td>
      <td className="py-1.5 text-right">
        <button disabled={!mudou || salvando || !v.padrao || !v.valor} onClick={() => aoSalvar(v)} className="text-primary disabled:opacity-30" title="Salvar"><Save className="w-4 h-4" /></button>
      </td>
    </tr>
  );
}

export default function Regras() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ['regras'], queryFn: () => r1Rpc<Lista>('segmentacao_regras_listar') });
  const conflitos = useQuery({ queryKey: ['conflitos'], queryFn: () => r1Rpc<Conflito[]>('segmentacao_conflitos'), staleTime: 5 * 60_000 });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [novas, setNovas] = useState<Record<string, boolean>>({});
  const [tProduto, setTProduto] = useState('');
  const [tOferta, setTOferta] = useState('');
  const [teste, setTeste] = useState<Teste | null>(null);

  const salvar = useMutation({
    mutationFn: (v: Omit<Regra, 'id' | 'atualizado_em'> & { id?: number }) => r1Rpc('segmentacao_regra_salvar', {
      p_id: v.id ?? null, p_dimensao: v.dimensao, p_prioridade: v.prioridade, p_campo: v.campo, p_padrao: v.padrao, p_valor: v.valor, p_ativo: v.ativo, p_observacao: v.observacao || null,
    }),
    onSuccess: () => { setErro(null); setAviso('Regra salva. O painel recalcula em até 15 minutos (ou use "Agora" em Recalcular, no Gerenciador).'); setNovas({}); qc.invalidateQueries({ queryKey: ['regras'] }); qc.invalidateQueries({ queryKey: ['conflitos'] }); },
    onError: (e: Error) => { setAviso(null); setErro(e.message); },
  });
  const testar = useMutation({
    mutationFn: () => r1Rpc<Teste>('segmentacao_testar', { p_produto: tProduto, p_oferta: tOferta || null }),
    onSuccess: (r) => { setErro(null); setTeste(r); },
    onError: (e: Error) => setErro(e.message),
  });

  const d = lista.data;
  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo="Regras de segmentação"
        subtitulo={<>Como o nome do produto e da oferta viram linha, tipo e canal {d && `· versão ${d.versao}`}</>}
        onAtualizar={() => { lista.refetch(); conflitos.refetch(); }}
        atualizando={lista.isFetching}
      />

      <main className="py-6 space-y-6 mx-auto max-w-[1520px] px-4 md:px-8">
        {lista.error && <div className="surface p-4 text-sm text-red-400">{(lista.error as Error).message}</div>}
        {erro && <div className="surface p-3 text-xs text-red-400">{erro}</div>}
        {aviso && <div className="surface p-3 text-xs text-emerald-400">{aviso}</div>}
        <div className="surface p-4 text-xs text-muted-foreground space-y-1">
          <p>Cada regra é uma expressão procurada no nome do produto (sem acentos, em maiúsculas) ou no nome da oferta. Vence a regra de <b>menor prioridade</b>; a de prioridade 999 é o padrão. Quando duas regras ativas com resultados diferentes batem no mesmo pedido, ele recebe a <b>flag de conflito</b> e aparece na lista abaixo.</p>
          <p>Toda alteração sobe a versão e fica registrada com quem mudou. Ajustes manuais por produto (tabela de ajustes) continuam valendo acima das regras.</p>
        </div>

        <section className="surface p-4">
          <span className="section-label">Testar um nome</span>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); testar.mutate(); }} className="flex flex-wrap items-end gap-2 mt-2 text-xs">
            <label className="flex-1 min-w-[240px]">Produto<input value={tProduto} onChange={(e) => setTProduto(e.target.value)} className="w-full bg-secondary rounded px-2 py-1 text-foreground mt-0.5" placeholder="ex.: MÁQUINA DE VENDAS PRESENCIAL - CURITIBA 14H" /></label>
            <label className="flex-1 min-w-[200px]">Oferta<input value={tOferta} onChange={(e) => setTOferta(e.target.value)} className="w-full bg-secondary rounded px-2 py-1 text-foreground mt-0.5" placeholder="ex.: LOTE 2 - SS" /></label>
            <button type="submit" disabled={!tProduto || testar.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50"><FlaskConical className="w-3.5 h-3.5" /> Testar</button>
          </form>
          {teste && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-xs">
              {(['linha', 'tipo', 'canal'] as const).map((k) => (
                <div key={k} className="bg-secondary rounded p-2">
                  <div className="text-muted-foreground">{DIM[k]}</div>
                  <div className="font-bold text-foreground">{teste[k]?.valor ?? '—'} {teste[k]?.conflito && <span className="text-amber-400">⚠ conflito</span>}</div>
                  <div className="text-muted-foreground mono">{teste[k]?.regras.map((r) => `#${r.id} (${r.prioridade}) ${r.valor}`).join(' · ') || 'só o padrão'}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {d && (['linha', 'tipo', 'canal'] as const).map((dim) => (
          <section key={dim} className="surface p-4 overflow-x-auto">
            <div className="flex items-center justify-between">
              <span className="section-label">{DIM[dim]}</span>
              <button onClick={() => setNovas({ ...novas, [dim]: true })} className="flex items-center gap-1 text-xs text-primary font-semibold"><Plus className="w-3.5 h-3.5" /> Nova regra</button>
            </div>
            <table className="w-full mt-2 text-xs">
              <thead><tr className="text-muted-foreground text-left"><th className="pb-1 font-semibold">Prior.</th><th className="pb-1 font-semibold">Onde procurar</th><th className="pb-1 font-semibold">Expressão</th><th className="pb-1 font-semibold">Resultado</th><th className="pb-1 font-semibold">Observação</th><th className="pb-1 font-semibold text-center">Ativa</th><th></th></tr></thead>
              <tbody>
                {d.regras.filter((r) => r.dimensao === dim).map((r) => <LinhaRegra key={`${r.id}-${r.atualizado_em}`} r={r} aoSalvar={(v) => salvar.mutate(v)} salvando={salvar.isPending} />)}
                {novas[dim] && <LinhaRegra r={vazia(dim)} aoSalvar={(v) => salvar.mutate(v)} salvando={salvar.isPending} />}
              </tbody>
            </table>
          </section>
        ))}

        <section className="surface p-4 overflow-x-auto">
          <span className="section-label">Conflitos (produtos em que mais de uma regra bate)</span>
          {conflitos.isLoading && <p className="text-xs text-muted-foreground mt-2">Calculando…</p>}
          {conflitos.data?.length === 0 && <p className="text-xs text-emerald-400 mt-2">Nenhum conflito com as regras atuais.</p>}
          {conflitos.data && conflitos.data.length > 0 && (
            <table className="w-full mt-2 text-xs">
              <thead><tr className="text-muted-foreground text-left"><th className="pb-1 font-semibold">Produto</th><th className="pb-1 font-semibold">Oferta</th><th className="pb-1 font-semibold">Em</th><th className="pb-1 font-semibold">Ficou como</th><th className="pb-1 font-semibold text-right">Pedidos</th><th className="pb-1 font-semibold text-right">Ingressos</th><th className="pb-1 font-semibold text-right">Última venda</th></tr></thead>
              <tbody>{conflitos.data.map((c, i) => (
                <tr key={i} className="border-t border-border"><td className="py-1.5">{c.produto_nome}</td><td className="py-1.5">{c.oferta_nome ?? '—'}</td><td className="py-1.5 text-amber-400">{c.dimensoes}</td><td className="py-1.5">{c.linha} · {c.tipo_ingresso} · {c.canal}</td><td className="py-1.5 text-right mono">{c.transacoes}</td><td className="py-1.5 text-right mono">{c.ingressos ?? 0}</td><td className="py-1.5 text-right mono">{c.ultima_venda}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>

        {d && d.historico.length > 0 && (
          <section className="surface p-4 overflow-x-auto">
            <span className="section-label">Histórico de alterações</span>
            <table className="w-full mt-2 text-xs">
              <thead><tr className="text-muted-foreground text-left"><th className="pb-1 font-semibold">Quando</th><th className="pb-1 font-semibold">Quem</th><th className="pb-1 font-semibold">Regra</th><th className="pb-1 font-semibold">Antes</th><th className="pb-1 font-semibold">Depois</th></tr></thead>
              <tbody>{d.historico.map((h, i) => {
                const r = (x: Partial<Regra> | null) => (x ? `${x.dimensao} ${x.prioridade} · ${x.campo} ~ ${x.padrao} → ${x.valor}${x.ativo === false ? ' (inativa)' : ''}` : 'nova');
                return <tr key={i} className="border-t border-border"><td className="py-1.5 mono">{fmt(h.quando)}</td><td className="py-1.5">{h.quem ?? '—'}</td><td className="py-1.5">{h.chave}</td><td className="py-1.5 mono">{r(h.antes)}</td><td className="py-1.5 mono">{r(h.depois)}</td></tr>;
              })}</tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}
