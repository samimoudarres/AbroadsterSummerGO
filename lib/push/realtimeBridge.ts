import { Platform } from 'react-native';
import { presentLocalNotification } from '../trips/push';
import { supabase } from '../supabase';
import { notifyChatListeners } from '../chat/repository';

type NotifRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
};

let started = false;
let channel: { unsubscribe: () => void } | null = null;
const seenIds = new Set<string>();

/**
 * Subscribe to new notifications for the signed-in user.
 * Shows a native OS banner and refreshes the in-app inbox badge.
 * Remote Expo push (when token registered) covers fully-killed app state.
 */
export function startNotificationRealtimeBridge(userId: string): () => void {
  if (Platform.OS === 'web' || !userId || started) {
    return () => {};
  }
  const client = supabase;
  if (!client) return () => {};

  started = true;
  seenIds.clear();

  const ch = client
    .channel(`notif-push:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as NotifRow;
        if (!row?.id || seenIds.has(row.id)) return;
        seenIds.add(row.id);
        if (seenIds.size > 200) {
          const first = seenIds.values().next().value;
          if (first) seenIds.delete(first);
        }
        notifyChatListeners();
        void presentLocalNotification({
          title: row.title,
          body: row.body ?? '',
          data: { ...(row.data ?? {}), kind: row.kind, notification_id: row.id },
        });
      },
    )
    .subscribe();

  channel = {
    unsubscribe: () => {
      void client.removeChannel(ch);
    },
  };

  return () => {
    channel?.unsubscribe();
    channel = null;
    started = false;
  };
}
