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
): Promise<'ok' | 'debounced' | 'failed'> {
  if (!hasSupabase || !supabase) return 'failed';

  const debounce = CLIENT_DEBOUNCE_MS[kind] ?? 0;
  if (debounce > 0) {
    const prev = lastSentAt.get(kind) ?? 0;
    if (Date.now() - prev < debounce) return 'debounced';
  }

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
      return 'failed';
    }
    // Only consume the debounce window on success. A failed first
    // attempt (e.g. the session not being ready yet on first launch)
    // used to silently eat the event for the next 15 minutes — that is
    // how new users lost their day-0 app_open from Nov 17, 2026.
    if (debounce > 0) lastSentAt.set(kind, Date.now());
    return 'ok';
  } catch (e: any) {
    console.warn('record_user_activity', e?.message);
    return 'failed';
  }
}

/** Bind AppState so each foreground resume records an app_open. */
export function startAppOpenTracking(): () => void {
  let lastState: AppStateStatus = AppState.currentState;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const sendLaunchOpen = () => {
    void recordUserActivity('app_open', { source: 'launch' }).then(
      (result) => {
        // One retry shortly after a failed first attempt instead of
        // losing the event for the whole session.
        if (result === 'failed' && retryTimer === undefined) {
          retryTimer = setTimeout(() => {
            retryTimer = undefined;
            void recordUserActivity('app_open', {
              source: 'launch-retry',
            });
          }, 10_000);
        }
      },
    );
  };

  if (lastState === 'active') {
    sendLaunchOpen();
  }

  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active' && lastState !== 'active') {
      void recordUserActivity('app_open', { source: 'foreground' });
    }
    lastState = next;
  });

  return () => {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    sub.remove();
  };
}
