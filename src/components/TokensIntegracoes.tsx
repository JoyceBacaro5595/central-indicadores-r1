import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { R1_URL, r1Headers, r1Rpc } from '@/integrations/r1/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface StatusToken {
  chave: string; rotulo: string; no_cofre: boolean; atualizado_em: string | null; atualizado_por: string | null;
  ultimo_ok: string | null; ultimo_status: string | null; ultimo_erro: string | null; token_provavel: boolean;
}
interface Resultado { ok: boolean; erro?: string; teste?: string; carga_ok?: boolean; carga?: string }

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null);

/** Atualização de tokens das integrações dentro do app, só para quem tem acesso ao Gerenciador (gestor e administrador).
 *  O token vai para a Edge Function integracoes-token, que testa no provedor, grava no cofre do banco e roda a carga de confirmação.
 *  O valor digitado nunca volta para a tela. */
export default function TokensIntegracoes() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tokens-status'], queryFn: () => r1Rpc<StatusToken[]>('integracoes_tokens_status_v1'), refetchInterval: 60_000 });
  const [alvo, setAlvo] = useState<StatusToken | null>(null);
  const [token, setToken] = useState('');
  const [res, setRes] = useState<Resultado | null>(null);

  const salvar = useMutation({
    mutationFn: async (): Promise<Resultado> => {
      const r = await fetch(`${R1_URL}/functions/v1/integracoes-token`, { method: 'POST', headers: await r1Headers(), body: JSON.stringify({ chave: alvo!.chave, token }) });
      return r.json().catch(() => ({ ok: false, erro: `Falha ao falar com o servidor (${r.status})` }));
    },
    onSuccess: (r) => {
      setRes(r);
      if (r.ok) { setToken(''); qc.invalidateQueries({ queryKey: ['tokens-status'] }); qc.invalidateQueries({ queryKey: ['gerenciador'] }); qc.invalidateQueries({ queryKey: ['alertas'] }); }
    },
    onError: (e: Error) => setRes({ ok: false, erro: e.message }),
  });
  const fechar = () => { setAlvo(null); setToken(''); setRes(null); };

  if (q.error) return <p role="alert" className="text-sm text-red-400">Não foi possível carregar os tokens: {(q.error as Error).message}</p>;
  return (
    <>
      <div className="space-y-2">
        {(q.data ?? []).map((t) => {
          const problema = t.token_provavel;
          return (
            <div key={t.chave} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground">{t.rotulo}</div>
                <div className={`text-xs mt-0.5 ${problema ? 'text-red-400' : 'text-emerald-400'}`}>
                  {problema ? `Token expirado ou recusado: ${t.ultimo_erro ?? ''}` : t.ultimo_ok ? `Funcionando · última carga com sucesso ${fmt(t.ultimo_ok)}` : 'Sem carga registrada ainda'}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {t.no_cofre ? `Token do app salvo em ${fmt(t.atualizado_em)}${t.atualizado_por ? ` por ${t.atualizado_por}` : ''}` : 'Usando o token configurado no Supabase (ainda não trocado pelo app)'}
                </div>
              </div>
              <button type="button" onClick={() => { setAlvo(t); setRes(null); setToken(''); }} className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold ${problema ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground hover:border-primary'}`}>
                <KeyRound className="w-3.5 h-3.5" /> Atualizar token
              </button>
            </div>
          );
        })}
        {q.data && q.data.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma integração com token editável pelo app.</p>}
      </div>

      <Dialog open={!!alvo} onOpenChange={(a) => { if (!a) fechar(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar token · {alvo?.rotulo}</DialogTitle>
            <DialogDescription>Cole o token novo. Ele é testado antes de ser salvo, fica guardado no cofre do banco e nunca aparece de volta nesta tela.</DialogDescription>
          </DialogHeader>
          {res?.ok ? (
            <div role="status" className="space-y-2 text-sm">
              <div className="flex items-center gap-2 font-bold text-emerald-400"><CheckCircle2 className="w-5 h-5" /> Token atualizado com sucesso</div>
              <p className="text-muted-foreground">{res.teste}</p>
              <p className={res.carga_ok ? 'text-muted-foreground' : 'text-amber-400'}>{res.carga}</p>
              <button type="button" onClick={fechar} className="rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-xs font-bold">Fechar</button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setRes(null); salvar.mutate(); }} className="space-y-3">
              <input type="password" autoComplete="off" spellCheck={false} aria-label="Token novo" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole o token aqui" className="input-r1 w-full mono" />
              {res && !res.ok && <p role="alert" className="text-sm text-red-400">{res.erro}</p>}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={salvar.isPending || token.trim().length < 20} className="rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-xs font-bold disabled:opacity-40">{salvar.isPending ? 'Testando e salvando…' : 'Testar e salvar'}</button>
                <button type="button" onClick={fechar} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
