import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GuruDailyEntry {
  date: string;
  vendas: number;
  faturamento: number;
}

export interface GuruTotals {
  faturamento: number;
  vendas: number;
  produtos: number;
  clientesNovos: number;
  reembolsos: number;
  totalLiquido: number;
  ticketMedio: number;
  lucroMedio: number;
  daily: GuruDailyEntry[];
  kit?: { vendas: number; faturamento: number; ticketMedio: number };
}

async function fetchGuruData(startDate?: string, endDate?: string): Promise<GuruTotals> {
  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  const queryString = new URLSearchParams(params).toString();
  const { data: sessionData } = await supabase.auth.getSession();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-guru-data?${queryString}`, {
    headers: {
      'Authorization': `Bearer ${sessionData?.session?.access_token || anonKey}`,
      'apikey': anonKey,
    },
  });

  if (!res.ok) throw new Error(`Failed to fetch Guru data: ${res.statusText}`);
  return res.json();
}

export function useGuruData(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['guru-data', startDate, endDate],
    queryFn: () => fetchGuruData(startDate, endDate),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });
}
