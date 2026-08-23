import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase, isDemoMode } from '@/lib/supabase.ts';
import { demoCategories, demoLearnings } from '@/lib/demo.ts';
import { toCategory, toCategoryLearning } from '@/lib/mappers.ts';
import { fold, type TxType } from '@/domain/categories.ts';

export type CategoryErrorCode =
  | 'duplicate'
  | 'tooLong'
  | 'auth'
  | 'offline'
  | 'unknown';

export class CategoryError extends Error {
  constructor(readonly code: CategoryErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CategoryError';
  }
}

/**
 * Classify by SQLSTATE, never by message text: the constraints in 0001_init
 * are what fail here, and their codes are stable while the wording that comes
 * back is not (it is localized by the server and names the index, not the
 * problem). PostgREST leaves `code` empty when the request never reached the
 * database, which is the offline case.
 */
export function toCategoryError(error: PostgrestError): CategoryError {
  switch (error.code) {
    case '23505': // categories_unique_name
      return new CategoryError('duplicate', error.message);
    case '23514': // name length check
      return new CategoryError('tooLong', error.message);
    case '42501': // row level security
    case 'PGRST301': // expired JWT
      return new CategoryError('auth', error.message);
    case '':
    case undefined:
      return new CategoryError('offline', error.message);
    default:
      return new CategoryError('unknown', error.message);
  }
}

export function useUserCategories(type?: TxType) {
  return useQuery({
    queryKey: ['user-categories', type],
    queryFn: async () => {
      if (isDemoMode()) {
        let items = demoCategories.getAll().map(toCategory);
        if (type) items = items.filter((c) => c.type === type);
        return items;
      }
      let query = supabase.from('flowfinance_categories').select('*');
      if (type) query = query.eq('type', type);
      const { data, error } = await query;
      if (error) throw toCategoryError(error);
      return (data ?? []).map(toCategory);
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    // React Query pauses mutations while the browser reports itself offline,
    // which here means a spinner that never resolves and a write that may fire
    // much later, unannounced. Attempt it instead: the failure is immediate and
    // becomes a message the user can act on.
    networkMode: 'always',
    mutationFn: async (cat: { name: string; icon: string; color: string; type: TxType }) => {
      if (isDemoMode()) {
        // The demo store has no constraints, so it used to accept duplicates
        // that production rejects — the one mode where the bug was invisible.
        const taken = demoCategories
          .getAll()
          .some((c) => c.type === cat.type && fold(c.name ?? '') === fold(cat.name));
        if (taken) throw new CategoryError('duplicate');
        return demoCategories.insert(cat);
      }
      // `getSession` reads the stored session; `getUser` would spend a network
      // round trip on it, and with no connection that call retries internally
      // and leaves the button spinning instead of reporting the outage. RLS is
      // what actually enforces ownership, either way.
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user.id;
      if (!userId) throw new CategoryError('auth');
      const { data, error } = await supabase
        .from('flowfinance_categories')
        .insert({ ...cat, user_id: userId })
        .select('id')
        .single();
      if (error) throw toCategoryError(error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-categories'] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: async (id: string) => {
      if (isDemoMode()) { demoCategories.remove(id); return; }
      const { error } = await supabase.from('flowfinance_categories').delete().eq('id', id);
      if (error) throw toCategoryError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-categories'] }),
  });
}

export function useCategoryLearnings(type?: TxType) {
  return useQuery({
    queryKey: ['category-learnings', type],
    queryFn: async () => {
      if (isDemoMode()) {
        let items = demoLearnings.getAll().map(toCategoryLearning);
        if (type) items = items.filter((l) => l.type === type);
        return items;
      }
      let query = supabase.from('flowfinance_category_learnings').select('*');
      if (type) query = query.eq('type', type);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(toCategoryLearning);
    },
  });
}

/** What a saved rule looked like before, so undo can put it back. */
export interface SavedLearning {
  id: string;
  keyword: string;
  /** The category this keyword pointed at before, or null when it is new. */
  previousCategory: string | null;
}

/**
 * Teach the parser that `keyword` means `category` from now on.
 *
 * Read-then-write rather than an upsert on purpose: `category_learnings_unique`
 * is an index over an expression (`lower(keyword)`), and PostgREST's
 * `on_conflict` takes plain column names, so the inference clause this needs
 * cannot be expressed through it. The extra read also tells us what the rule
 * used to say, which is what makes undo exact.
 */
export function useSaveLearning() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: async (l: {
      keyword: string;
      category: string;
      type: TxType;
    }): Promise<SavedLearning> => {
      const keyword = l.keyword.trim();
      if (!keyword) throw new CategoryError('unknown');

      if (isDemoMode()) {
        const existing = demoLearnings
          .getAll()
          .find((x) => x.type === l.type && fold(x.keyword ?? '') === fold(keyword));
        if (existing) {
          demoLearnings.update(existing.id, { category: l.category });
          return { id: existing.id, keyword, previousCategory: existing.category ?? null };
        }
        const created = demoLearnings.insert({ ...l, keyword });
        return { id: created.id, keyword, previousCategory: null };
      }

      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user.id;
      if (!userId) throw new CategoryError('auth');

      // `ilike` rather than `eq` so a rule stored with different casing is still
      // found — the unique index compares `lower(keyword)`. Keywords are folded
      // to letters and digits before they get here, so there is no pattern
      // character to escape.
      const { data: existing, error: readError } = await supabase
        .from('flowfinance_category_learnings')
        .select('id, category')
        .eq('type', l.type)
        .ilike('keyword', keyword)
        .maybeSingle();
      if (readError) throw toCategoryError(readError);

      if (existing) {
        const { error } = await supabase
          .from('flowfinance_category_learnings')
          .update({ category: l.category })
          .eq('id', existing.id);
        if (error) throw toCategoryError(error);
        return { id: existing.id, keyword, previousCategory: existing.category ?? null };
      }

      const { data, error } = await supabase
        .from('flowfinance_category_learnings')
        .insert({ ...l, keyword, user_id: userId })
        .select('id')
        .single();
      if (error) throw toCategoryError(error);
      return { id: data.id, keyword, previousCategory: null };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['category-learnings'] }),
  });
}

/** Drops a rule — how undo reverts a keyword that was learned just now. */
export function useDeleteLearning() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: async (id: string) => {
      if (isDemoMode()) { demoLearnings.remove(id); return; }
      const { error } = await supabase
        .from('flowfinance_category_learnings')
        .delete()
        .eq('id', id);
      if (error) throw toCategoryError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['category-learnings'] }),
  });
}
