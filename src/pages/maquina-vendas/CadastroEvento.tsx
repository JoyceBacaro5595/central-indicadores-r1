import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Target } from 'lucide-react';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface EventoCad { id: number; cidade: string; mes_evento: string; data_evento: string | null; capacidade: number | null; meta_ingressos: number | null; meta_faturamento?: number | null }

const campo = 'bg-secondary rounded px-2 py-1.5 text-foreground text-sm w-full';
const mesRot = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const numOuNulo = (v: string) => (v.trim() === '' ? null : Number(v));

/** Cadastrar evento e cadastrar meta, só para quem tem o recurso gerenciador; usa as mesmas funções da página Eventos. */
export default function CadastroEvento({ eventos }: { eventos: EventoCad[] }) {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<'evento' | 'meta' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [cidade, setCidade] = useState(''); const [mes, setMes] = useState(new Date().toISOString().slice(0, 7)); const [data, setData] = useState(''); const [cap, setCap] = useState('350'); const [metaIng, setMetaIng] = useState('');
  const [evId, setEvId] = useState(''); const [mIng, setMIng] = useState(''); const [mFat, setMFat] = useState(''); const [mCap, setMCap] = useState('');
  const atualizar = () => { qc.invalidateQueries({ queryKey: ['mv-eventos'] }); qc.invalidateQueries({ queryKey: ['mv-eventos-hist'] }); };
  const fechar = () => { setAberto(null); setErro(null); };

  const criar = useMutation({
    mutationFn: () => r1Rpc('evento_criar', { p_linha: 'MÁQUINA DE VENDAS PRESENCIAL', p_cidade: cidade.trim(), p_mes_evento: `${mes}-01`, p_data_evento: data || null, p_capacidade: numOuNulo(cap), p_meta_ingressos: numOuNulo(metaIng) }),
    onSuccess: () => { atualizar(); setCidade(''); setData(''); setMetaIng(''); fechar(); },
    onError: (e: Error) => setErro(e.message),
  });
  const ev = eventos.find((e) => String(e.id) === evId);
  const salvarMeta = useMutation({
    mutationFn: () => r1Rpc('evento_salvar', { p_id: ev!.id, p_data_evento: ev!.data_evento, p_local: null, p_capacidade: numOuNulo(mCap) ?? ev!.capacidade, p_meta_ingressos: numOuNulo(mIng) ?? ev!.meta_ingressos, p_meta_faturamento: numOuNulo(mFat) ?? ev!.meta_faturamento ?? null, p_observacao: null, p_ativo: true }),
    onSuccess: () => { atualizar(); setEvId(''); setMIng(''); setMFat(''); setMCap(''); fechar(); },
    onError: (e: Error) => setErro(e.message),
  });

  if (!pode('gerenciador')) return null;
  const botao = 'flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border border-border bg-secondary/40 text-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2';
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={botao} onClick={() => setAberto('evento')}><Plus className="w-3.5 h-3.5" aria-hidden="true" />Cadastrar evento</button>
        <button type="button" className={botao} onClick={() => setAberto('meta')}><Target className="w-3.5 h-3.5" aria-hidden="true" />Cadastrar meta</button>
      </div>

      <Dialog open={aberto === 'evento'} onOpenChange={(o) => !o && fechar()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cadastrar evento</DialogTitle><DialogDescription>Cria o evento na Máquina de Vendas presencial. Ele passa a valer também na página Eventos.</DialogDescription></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); criar.mutate(); }} className="space-y-3">
            <label className="block text-xs text-muted-foreground">Cidade<input required value={cidade} onChange={(e) => setCidade(e.target.value)} className={campo} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-muted-foreground">Mês<input required type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={campo} /></label>
              <label className="block text-xs text-muted-foreground">Data do evento<input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} /></label>
              <label className="block text-xs text-muted-foreground">Capacidade<input type="number" min={0} value={cap} onChange={(e) => setCap(e.target.value)} className={campo} /></label>
              <label className="block text-xs text-muted-foreground">Meta de ingressos<input type="number" min={0} value={metaIng} onChange={(e) => setMetaIng(e.target.value)} className={campo} /></label>
            </div>
            {erro && <p role="alert" className="text-xs text-red-400">{erro}</p>}
            <button type="submit" disabled={criar.isPending} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{criar.isPending ? 'Criando…' : 'Criar evento'}</button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={aberto === 'meta'} onOpenChange={(o) => !o && fechar()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cadastrar meta</DialogTitle><DialogDescription>Escolha o evento e informe as metas. Campos em branco mantêm o valor atual.</DialogDescription></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (ev) salvarMeta.mutate(); }} className="space-y-3">
            <label className="block text-xs text-muted-foreground">Evento
              <select required value={evId} onChange={(e) => setEvId(e.target.value)} className={campo}>
                <option value="">Selecione…</option>
                {eventos.map((e) => <option key={e.id} value={e.id}>{e.cidade} · {mesRot(e.mes_evento)}</option>)}
              </select>
            </label>
            {ev && <p className="text-[11px] text-muted-foreground">Hoje: meta de {ev.meta_ingressos ?? '—'} ingressos, capacidade {ev.capacidade ?? '—'}{ev.meta_faturamento ? `, faturamento R$ ${ev.meta_faturamento.toLocaleString('pt-BR')}` : ''}.</p>}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-muted-foreground">Meta de ingressos<input type="number" min={0} value={mIng} onChange={(e) => setMIng(e.target.value)} className={campo} /></label>
              <label className="block text-xs text-muted-foreground">Capacidade<input type="number" min={0} value={mCap} onChange={(e) => setMCap(e.target.value)} className={campo} /></label>
              <label className="block text-xs text-muted-foreground col-span-2">Meta de faturamento (R$)<input type="number" min={0} step="0.01" value={mFat} onChange={(e) => setMFat(e.target.value)} className={campo} /></label>
            </div>
            {erro && <p role="alert" className="text-xs text-red-400">{erro}</p>}
            <button type="submit" disabled={salvarMeta.isPending || !ev} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{salvarMeta.isPending ? 'Salvando…' : 'Salvar meta'}</button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
