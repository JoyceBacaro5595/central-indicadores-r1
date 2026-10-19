import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface EventoCad { id: number; cidade: string; mes_evento: string; data_evento: string | null; capacidade: number | null; meta_ingressos: number | null; meta_faturamento?: number | null; local?: string | null; observacao?: string | null }

const campo = 'bg-secondary rounded px-2 py-1.5 text-foreground text-sm w-full disabled:opacity-60';
const mesRot = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const numOuNulo = (v: string) => (v.trim() === '' ? null : Number(v));
const txt = (v: number | null | undefined) => (v == null ? '' : String(v));

/** Cadastro único de evento e meta (só para quem tem o recurso gerenciador): cria um evento novo ou ajusta um existente. */
export default function CadastroEvento({ eventos }: { eventos: EventoCad[] }) {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [evId, setEvId] = useState('novo');
  const [cidade, setCidade] = useState(''); const [mes, setMes] = useState(new Date().toISOString().slice(0, 7)); const [data, setData] = useState('');
  const [cap, setCap] = useState('350'); const [metaIng, setMetaIng] = useState(''); const [metaFat, setMetaFat] = useState('');
  const existente = eventos.find((e) => String(e.id) === evId);

  const escolher = (id: string) => {
    setEvId(id); setErro(null);
    const e = eventos.find((x) => String(x.id) === id);
    if (e) { setCidade(e.cidade); setMes(e.mes_evento.slice(0, 7)); setData(e.data_evento ?? ''); setCap(txt(e.capacidade)); setMetaIng(txt(e.meta_ingressos)); setMetaFat(txt(e.meta_faturamento)); }
    else { setCidade(''); setData(''); setCap('350'); setMetaIng(''); setMetaFat(''); }
  };
  const fechar = () => { setAberto(false); setErro(null); };

  const salvar = useMutation({
    mutationFn: async () => {
      const capacidade = numOuNulo(cap); const metaIngressos = numOuNulo(metaIng); const metaFaturamento = numOuNulo(metaFat);
      let id = existente?.id;
      if (!existente) {
        const novo = await r1Rpc<{ id: number }>('evento_criar', { p_linha: 'MÁQUINA DE VENDAS PRESENCIAL', p_cidade: cidade.trim(), p_mes_evento: `${mes}-01`, p_data_evento: data || null, p_capacidade: capacidade, p_meta_ingressos: metaIngressos });
        id = novo.id;
        if (metaFaturamento == null) return;
      }
      await r1Rpc('evento_salvar', { p_id: id, p_data_evento: data || null, p_local: existente?.local ?? null, p_capacidade: capacidade, p_meta_ingressos: metaIngressos, p_meta_faturamento: metaFaturamento, p_observacao: existente?.observacao ?? null, p_ativo: true });
    },
    onSuccess: () => { toast.success('Salvo com sucesso'); qc.invalidateQueries({ queryKey: ['mv-eventos'] }); qc.invalidateQueries({ queryKey: ['mv-eventos-hist'] }); qc.invalidateQueries({ queryKey: ['eventos'] }); escolher('novo'); fechar(); },
    onError: (e: Error) => setErro(e.message),
  });

  if (!pode('gerenciador')) return null;
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border border-border bg-secondary/40 text-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2"><Plus className="w-3.5 h-3.5" aria-hidden="true" />Cadastrar evento e meta</button>
      <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cadastrar evento e meta</DialogTitle><DialogDescription>Crie um evento novo ou escolha um existente para ajustar data, capacidade e metas. Vale também na página Eventos.</DialogDescription></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="space-y-3">
            <label className="block text-xs text-muted-foreground">Evento
              <select value={evId} onChange={(e) => escolher(e.target.value)} className={campo}>
                <option value="novo">Novo evento</option>
                {eventos.map((e) => <option key={e.id} value={e.id}>{e.cidade} · {mesRot(e.mes_evento)}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-muted-foreground col-span-2">Cidade<input required value={cidade} onChange={(e) => setCidade(e.target.value)} disabled={!!existente} className={campo} /></label>
              <label className="block text-xs text-muted-foreground">Mês<input required type="month" value={mes} onChange={(e) => setMes(e.target.value)} disabled={!!existente} className={campo} /></label>
              <label className="block text-xs text-muted-foreground">Data do evento<input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} /></label>
              <label className="block text-xs text-muted-foreground">Capacidade<input type="number" min={0} value={cap} onChange={(e) => setCap(e.target.value)} className={campo} /></label>
              <label className="block text-xs text-muted-foreground">Meta de ingressos<input type="number" min={0} value={metaIng} onChange={(e) => setMetaIng(e.target.value)} className={campo} /></label>
              <label className="block text-xs text-muted-foreground col-span-2">Meta de faturamento (R$)<input type="number" min={0} step="0.01" value={metaFat} onChange={(e) => setMetaFat(e.target.value)} className={campo} /></label>
            </div>
            {erro && <p role="alert" className="text-xs text-red-400">{erro}</p>}
            <button type="submit" disabled={salvar.isPending} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{salvar.isPending ? 'Salvando…' : existente ? 'Salvar alterações' : 'Criar evento'}</button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
