import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Status compartilhado de "no ar" para páginas e criativos.
 * Guarda no banco (Lovable Cloud) e usa localStorage como cache imediato.
 */
export function useChecklistStatus(
  prefixo: string,
  storageKey: string,
  padrao: Record<string, boolean> = {}
) {
  const [status, setStatus] = useState<Record<string, boolean>>(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (salvo && typeof salvo === 'object') return { ...padrao, ...salvo };
    } catch {
      /* ignore */
    }
    return padrao;
  });

  // Carrega do banco
  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data, error } = await supabase
        .from('checklist_status')
        .select('chave, no_ar')
        .like('chave', `${prefixo}:%`);
      if (!ativo || error || !data) return;
      const remoto: Record<string, boolean> = {};
      for (const row of data) {
        remoto[row.chave.slice(prefixo.length + 1)] = row.no_ar;
      }
      setStatus((atual) => {
        const next = { ...atual, ...remoto };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    })();
    return () => {
      ativo = false;
    };
  }, [prefixo, storageKey]);

  const toggle = useCallback(
    (key: string) => {
      let novoValor = false;
      setStatus((s) => {
        novoValor = !s[key];
        const next = { ...s, [key]: novoValor };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      void supabase
        .from('checklist_status')
        .upsert(
          { chave: `${prefixo}:${key}`, no_ar: novoValor, updated_at: new Date().toISOString() },
          { onConflict: 'chave' }
        );
    },
    [prefixo, storageKey]
  );

  return { status, toggle };
}
