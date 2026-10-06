import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HubspotDaily {
  date: string;
  inscricoes: number;
  qualificados: number;
}

export interface HubspotDistGrupo {
  campanhas: { name: string; value: number }[];
  publicos: { name: string; value: number }[];
  criativos: { name: string; value: number }[];
}

export interface HubspotPagina {
  name: string;
  leads: number;
  mql: number;
}

export interface HubspotData {
  inscricoes: number;
  qualificados: number;
  semResposta: number;
  taxaQualificacao: number;
  faixas: Record<string, number>;
  daily: HubspotDaily[];
  distTodos?: HubspotDistGrupo;
  distMql?: HubspotDistGrupo;
  distAbaixo100k?: HubspotDistGrupo;
  distCargos?: { name: string; value: number }[];
  distCargosMql?: { name: string; value: number }[];
  paginas?: HubspotPagina[];
}

async function fetchHubspotData(startDate?: string, endDate?: string): Promise<HubspotData> {
  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  const queryString = new URLSearchParams(params).toString();

  const { data: sessionData } = await supabase.auth.getSession();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-hubspot-data?${queryString}`, {
    headers: {
      'Authorization': `Bearer ${sessionData?.session?.access_token || anonKey}`,
      'apikey': anonKey,
    },
  });

  if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
  return res.json();
}

export function useHubspotData(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['hubspot-data', startDate, endDate],
    queryFn: () => fetchHubspotData(startDate, endDate),
    refetchInterval: 30 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
