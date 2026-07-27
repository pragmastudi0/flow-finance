import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isDemoMode } from '@/lib/supabase.ts';
import { demoGoals, demoContributions } from '@/lib/demo.ts';
import type { SavingsGoal } from '@/types/models.ts';

export function useSavingsGoals() {
  return useQuery({
    queryKey: ['savings-goals'],
    queryFn: async () => {
      if (isDemoMode()) return demoGoals.getAll() as SavingsGoal[];
      const { data, error } = await supabase
        .from('savings_goals_with_progress')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SavingsGoal[];
    },
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (g: { description: string; goal_amount: number; target_date: string }) => {
      if (isDemoMode()) return demoGoals.insert(g);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('No hay sesión activa');
      const { data, error } = await supabase
        .from('savings_goals')
        .insert({ ...g, user_id: auth.user.id })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings-goals'] }),
  });
}

export function useContributeToGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goal_id, amount, occurred_on }: { goal_id: string; amount: number; occurred_on?: string }) => {
      if (isDemoMode()) {
        demoContributions.insert({ goal_id, amount, occurred_on: occurred_on ?? new Date().toISOString().split('T')[0] });
        const goal = demoGoals.getById(goal_id);
        if (goal) {
          const saved = (goal as any).currentSavedAmount ?? 0;
          const newSaved = saved + amount;
          const goalAmt = (goal as any).goalAmount;
          demoGoals.update(goal_id, {
            currentSavedAmount: newSaved,
            remainingAmount: Math.max(0, goalAmt - newSaved),
            progressPct: Math.min(100, (newSaved / goalAmt) * 100),
          });
        }
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('No hay sesión activa');
      const { error } = await supabase.from('savings_contributions').insert({
        goal_id,
        amount,
        occurred_on: occurred_on ?? new Date().toISOString().split('T')[0],
        user_id: auth.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings-goals'] }),
  });
}
