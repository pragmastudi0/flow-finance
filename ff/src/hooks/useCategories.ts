import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isDemoMode } from '@/lib/supabase.ts';
import { demoCategories, demoLearnings } from '@/lib/demo.ts';
import type { Category, CategoryLearning } from '@/types/models.ts';
import type { TxType } from '@/domain/categories.ts';

export function useUserCategories(type?: TxType) {
  return useQuery({
    queryKey: ['user-categories', type],
    queryFn: async () => {
      if (isDemoMode()) {
        let items = demoCategories.getAll() as Category[];
        if (type) items = items.filter((c) => c.type === type);
        return items;
      }
      let query = supabase.from('flowfinance_categories').select('*');
      if (type) query = query.eq('type', type);
      const { data, error } = await query;
      if (error) throw error;
      return data as Category[];
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cat: { name: string; icon: string; color: string; type: TxType }) => {
      if (isDemoMode()) return demoCategories.insert(cat);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('No hay sesión activa');
      const { data, error } = await supabase.from('flowfinance_categories').insert({ ...cat, user_id: auth.user.id }).select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-categories'] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode()) { demoCategories.remove(id); return; }
      const { error } = await supabase.from('flowfinance_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-categories'] }),
  });
}

export function useCategoryLearnings(type?: TxType) {
  return useQuery({
    queryKey: ['category-learnings', type],
    queryFn: async () => {
      if (isDemoMode()) {
        let items = demoLearnings.getAll() as CategoryLearning[];
        if (type) items = items.filter((l) => l.type === type);
        return items;
      }
      let query = supabase.from('flowfinance_category_learnings').select('*');
      if (type) query = query.eq('type', type);
      const { data, error } = await query;
      if (error) throw error;
      return data as CategoryLearning[];
    },
  });
}

export function useSaveLearning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (l: { keyword: string; category: string; type: TxType }) => {
      if (isDemoMode()) { demoLearnings.insert(l); return; }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('No hay sesión activa');
      const { error } = await supabase.from('flowfinance_category_learnings').upsert(
        { ...l, user_id: auth.user.id },
        { onConflict: 'user_id, type, lower(keyword)' },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['category-learnings'] }),
  });
}
