/**
 * Lightweight client → Supabase activity pings for the admin dashboard.
 * Failures are silent — never block the app experience.
 */
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { hasSupabase, supabase } from '../supabase';

export type ActivityKind =
  | 'app_open'
  | 'home_feed'
  | 'notifications_open'
  | 'create_post'
  | 'stamp'
  | 'message_send';

const lastSentAt = new Map<string, number>();
const CLIENT_DEBOUNCE_MS: Record<ActivityKind, number> = {
  app_open: 15 * 60 * 1000,
  home_feed: 20 * 60 * 1000,
  notifications_open: 10 * 60 * 1000,
  create_post: 0,
  stamp: 0,
  message_send: 0,
};

export async function recordUserActivity(
  kind: ActivityKind,
  meta: Record<string, unknown> = {},
): Promise<void> {
  if (!hasSupabase || !supabase) return;

  const debounce = CLIENT_DEBOUNCE_MS[kind] ?? 0;
  if (debounce > 0) {
    const prev = lastSentAt.get(kind) ?? 0;
    if (Date.now() - prev < debounce) return;
  }
  lastSentAt.set(kind, Date.now());

  try {
    const { error } = await supabase.rpc('record_user_activity', {
      p_kind: kind,
      p_meta: {
        ...meta,
        platform: Platform.OS,
      },
    });
    if (error) {
      // Table/RPC may not be applied yet — ignore.
      console.warn('record_user_activity', error.message);
    }
  } catch (e: any) {
    console.warn('record_user_activity', e?.message);
  }
}

/** Bind AppState so each foreground resume records an app_open. */
export function startAppOpenTracking(): () => void {
  let lastState: AppStateStatus = AppState.currentState;
  if (lastState === 'active') {
    void recordUserActivity('app_open', { source: 'launch' });
  }

  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active' && lastState !== 'active') {
      void recordUserActivity('app_open', { source: 'foreground' });
    }
    lastState = next;
  });

  return () => {
    sub.remove();
  };
}
