import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isDemoMode } from '@/lib/supabase.ts';
import { demoFixedExpenses } from '@/lib/demo.ts';
import type { FixedExpense } from '@/types/models.ts';

export function useFixedExpenses() {
  return useQuery({
    queryKey: ['fixed-expenses'],
    queryFn: async () => {
      if (isDemoMode()) return demoFixedExpenses.getAll() as FixedExpense[];
      const { data, error } = await supabase
        .from('fixed_expenses')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as FixedExpense[];
    },
  });
}

export function useCreateFixedExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fe: {
      description: string;
      amount: number;
      currency: string;
      category: string;
      recurrence: 'installments' | 'subscription';
      start_date: string;
      installments?: number | null;
    }) => {
      if (isDemoMode()) return demoFixedExpenses.insert(fe);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('No hay sesión activa');
      const { data, error } = await supabase
        .from('fixed_expenses')
        .insert({ ...fe, user_id: auth.user.id })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-expenses'] }),
  });
}

export function useToggleFixedExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'cancelled' | 'completed' }) => {
      if (isDemoMode()) { demoFixedExpenses.update(id, { status }); return; }
      const { error } = await supabase.from('fixed_expenses').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-expenses'] }),
  });
}
