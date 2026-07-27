import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isDemoMode } from '@/lib/supabase.ts';
import type { ExchangeRateConfig, ExchangeRateEntry } from '@/types/models.ts';

export function useExchangeRateConfig() {
  return useQuery({
    queryKey: ['exchange-rate-config'],
    queryFn: async () => {
      if (isDemoMode()) {
        return {
          id: 'demo',
          sourceUrl: 'https://api.bluelytics.com.ar/v2/latest',
          refreshMinutes: 60,
          lastValue: 1350,
          lastUpdatedAt: new Date().toISOString(),
          lastStatus: 'ok' as const,
          lastError: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as ExchangeRateConfig;
      }
      const { data, error } = await supabase
        .from('exchange_rate_configs')
        .select('*')
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data as ExchangeRateConfig | null;
    },
  });
}

export function useSaveExchangeRateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: { source_url: string; refresh_minutes: number }) => {
      if (isDemoMode()) return;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('No hay sesión activa');
      const { error } = await supabase.from('exchange_rate_configs').upsert(
        { ...cfg, user_id: auth.user.id },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exchange-rate-config'] }),
  });
}

export function useExchangeRateHistory() {
  return useQuery({
    queryKey: ['exchange-rate-history'],
    queryFn: async () => {
      if (isDemoMode()) {
        const history: ExchangeRateEntry[] = [];
        const now = new Date();
        for (let i = 0; i < 10; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          history.push({
            id: `demo-${i}`,
            capturedAt: d.toISOString(),
            status: 'ok' as const,
            rateBuy: 1300 + Math.random() * 100,
            rateSell: 1320 + Math.random() * 100,
            errorMessage: null,
          });
        }
        return history;
      }
      const { data, error } = await supabase
        .from('exchange_rate_history')
        .select('*')
        .order('captured_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as ExchangeRateEntry[];
    },
  });
}
