import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isDemoMode } from '@/lib/supabase.ts';
import { demoTransactions, getDemoUser } from '@/lib/demo.ts';
import type { Transaction } from '@/types/models.ts';

interface TransactionFilter {
  type?: 'expense' | 'income';
  startDate?: string;
  endDate?: string;
  category?: string;
  limit?: number;
}

function filterDemo(filter: TransactionFilter): Transaction[] {
  let items = demoTransactions.getAll() as Transaction[];
  if (filter.type) items = items.filter((t) => t.type === filter.type);
  if (filter.startDate) items = items.filter((t) => t.occurredOn >= filter.startDate!);
  if (filter.endDate) items = items.filter((t) => t.occurredOn <= filter.endDate!);
  if (filter.category) items = items.filter((t) => t.category === filter.category);
  items.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt));
  if (filter.limit) items = items.slice(0, filter.limit);
  return items;
}

export function useTransactions(filter: TransactionFilter = {}) {
  return useQuery({
    queryKey: ['transactions', filter],
    queryFn: async () => {
      if (isDemoMode()) return filterDemo(filter);
      let query = supabase
        .from('transactions')
        .select('*')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (filter.type) query = query.eq('type', filter.type);
      if (filter.startDate) query = query.gte('occurred_on', filter.startDate);
      if (filter.endDate) query = query.lte('occurred_on', filter.endDate);
      if (filter.category) query = query.eq('category', filter.category);
      if (filter.limit) query = query.limit(filter.limit);
      const { data, error } = await query;
      if (error) throw error;
      return data as Transaction[];
    },
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tx: {
      type: 'expense' | 'income';
      amount: number;
      currency: string;
      fx_rate: number;
      category: string;
      description: string;
      occurred_on: string;
      raw_input?: string;
      calculation?: string;
    }) => {
      if (isDemoMode()) {
        const user = getDemoUser();
        if (!user) throw new Error('No hay sesión activa');
        return demoTransactions.insert({
          ...tx,
          user_id: user.id,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        });
      }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error('No hay sesión activa');
      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...tx, user_id: auth.user.id })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode()) { demoTransactions.remove(id); return; }
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<Omit<Transaction, 'id' | 'createdAt' | 'user_id'>>) => {
      if (isDemoMode()) { demoTransactions.update(id, data); return; }
      const { error } = await supabase.from('transactions').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
