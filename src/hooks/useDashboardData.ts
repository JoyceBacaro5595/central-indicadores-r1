import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DailyData {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks?: number;
  reach: number;
  landingPageViews: number;
  initiateCheckout: number;
  purchases: number;
}

export interface BreakdownEntry {
  name: string;
  spend: number;
  purchases: number;
  impressions?: number;
  clicks?: number;
  linkClicks?: number;
  landingPageViews?: number;
  leads?: number;
  cpm?: number;
  ctr?: number;
}

export interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  reach: number;
  landingPageViews: number;
  initiateCheckout: number;
  purchases: number;
  ctr: number;
  cpc: number;
  cpm: number;
  costPerPurchase: number;
  connectRate: number;
  conversionRate: number;
  costPerLPV: number;
  costPerIC: number;
  txConvCheckout: number;
  txConvPV: number;
}

export interface CreativeCardData {
  leads?: number;
  id: string;
  name: string;
  campaignName: string;
  spend: number;
  clicks: number;
  impressions: number;
  purchases: number;
  costPerResult: number;
  cpm: number;
  ctr: number;
  thumbnailUrl: string;
  previewUrl: string;
  videoUrl?: string;
  status: string;
}

export interface PaginaMeta {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
}

export interface DashboardData {
  daily: DailyData[];
  totals: Totals;
  campaigns: BreakdownEntry[];
  audiences: BreakdownEntry[];
  creatives: BreakdownEntry[];
  creativeCards: CreativeCardData[];
  paginas?: PaginaMeta[];
}

async function fetchDashboardData(startDate?: string, endDate?: string, campaignNameFilter?: string): Promise<DashboardData> {
  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (campaignNameFilter) params.campaignNameFilter = campaignNameFilter;

  const queryString = new URLSearchParams(params).toString();
  const fnUrl = queryString
    ? `fetch-dashboard-data?${queryString}`
    : 'fetch-dashboard-data';

  // Use supabase.functions.invoke but pass query params via headers workaround
  // Actually, invoke doesn't support query params natively, so we call the URL directly
  const { data: sessionData } = await supabase.auth.getSession();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-dashboard-data?${queryString}`, {
    headers: {
      'Authorization': `Bearer ${sessionData?.session?.access_token || anonKey}`,
      'apikey': anonKey,
    },
  });

  if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
  return res.json();
}

export function useDashboardData(startDate?: string, endDate?: string, campaignNameFilter?: string) {
  return useQuery({
    queryKey: ['dashboard-data', startDate, endDate, campaignNameFilter],
    queryFn: () => fetchDashboardData(startDate, endDate, campaignNameFilter),
    refetchInterval: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}
