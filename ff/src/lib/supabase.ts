import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isDemo = import.meta.env.VITE_DEMO_MODE === 'true' || !url || !anonKey;

export const supabase = createClient(url || 'https://localhost.supabase.co', anonKey || 'placeholder');

export function isDemoMode(): boolean {
  return isDemo;
}

if (isDemo) {
  console.info('⚡ Demo mode — data will not persist across reloads (localStorage only)');
}
