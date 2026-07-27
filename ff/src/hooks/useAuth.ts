import { useEffect, useState, useCallback } from 'react';
import { supabase, isDemoMode } from '@/lib/supabase.ts';
import { getDemoUser, seedDemoData, logoutUser, isLoggedIn, getSessionEmail } from '@/lib/demo.ts';
import type { User } from '@supabase/supabase-js';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode()) {
      if (isLoggedIn()) {
        seedDemoData();
        setUser(getDemoUser() as unknown as User);
      }
      setLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export function useRequireAuth() {
  const { user, loading } = useUser();
  const needsAuth = !loading && !user;
  return { user, loading, needsAuth };
}

export function useSignOut() {
  const signOut = useCallback(async () => {
    if (isDemoMode()) {
      logoutUser();
      window.location.href = '/auth';
      return;
    }
    await supabase.auth.signOut();
  }, []);
  return signOut;
}

export { isDemoMode, isLoggedIn, getSessionEmail };
