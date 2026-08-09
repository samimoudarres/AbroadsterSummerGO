import { hasSupabase } from './supabase';

/**
 * Demo/seed content is for offline local development only.
 *
 * When Supabase is configured, seed users/DMs/trips must NEVER merge into a
 * real signed-in account — new accounts start empty from the backend.
 *
 * Opt-in only: EXPO_PUBLIC_DEMO_SEED=1
 * Force off:   EXPO_PUBLIC_DEMO_SEED=0
 */
export function allowDemoSeedMerge(): boolean {
  const flag = (process.env.EXPO_PUBLIC_DEMO_SEED || '').trim();
  if (flag === '0') return false;
  if (flag === '1') return true;

  // Live Supabase app → never inject seed into product UX
  if (hasSupabase) return false;

  if (typeof __DEV__ !== 'undefined' && !__DEV__) return false;
  return true;
}
