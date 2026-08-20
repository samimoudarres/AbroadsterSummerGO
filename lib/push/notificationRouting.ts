import { Platform } from 'react-native';
import type { NotificationNav } from '../../components/home/NotificationsScreen';

function dataStr(
  d: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Map Expo / local notification payload → in-app navigation target.
 * Mirrors NotificationsScreen.onTap kind handling.
 */
export function notificationDataToNav(
  raw: Record<string, unknown> | null | undefined,
): NotificationNav | null {
  if (!raw) return null;
  const d = raw;
  const kind = dataStr(d, 'kind') ?? '';
  const actor =
    dataStr(
      d,
      'actorId',
      'actor_id',
      'userId',
      'user_id',
      'fromUserId',
      'from_user_id',
    ) ?? null;

  if (kind === 'dm_message') {
    if (!actor) return null;
    return {
      type: 'dm',
      userId: actor,
      threadId: dataStr(d, 'threadId', 'thread_id'),
    };
  }
  if (kind === 'channel_message') {
    const channelId = dataStr(d, 'channelId', 'channel_id');
    const communityId = dataStr(d, 'communityId', 'community_id');
    const slug = dataStr(d, 'channelSlug', 'channel_slug') || undefined;
    if (channelId && communityId) {
      return { type: 'channel', channelId, communityId, slug };
    }
    return null;
  }
  if (kind === 'post_tagged' || kind === 'post_stamped') {
    const postId = dataStr(d, 'postId', 'post_id');
    return postId ? { type: 'post', postId } : null;
  }
  if (kind === 'friend_added' || kind === 'friend_nearby') {
    return actor ? { type: 'profile', userId: actor } : null;
  }
  if (
    kind === 'album_followed' ||
    kind === 'album_photos_uploaded' ||
    kind === 'trip_invite' ||
    kind === 'trip_invite_reminder' ||
    kind === 'trip_created' ||
    kind === 'trip_confirmed' ||
    kind === 'trip_countdown' ||
    kind === 'trip_invite_accepted' ||
    kind === 'trip_invite_declined' ||
    kind === 'trip_join_accepted' ||
    kind === 'trip_join_declined' ||
    kind === 'trip_join_request'
  ) {
    const tripId = dataStr(d, 'tripId', 'trip_id');
    if (!tripId) return null;
    if (kind === 'album_followed' || kind === 'album_photos_uploaded') {
      return { type: 'album', tripId };
    }
    return { type: 'trip', tripId };
  }
  return null;
}

type NavHandler = (nav: NotificationNav) => void;

/**
 * Listen for notification taps (foreground / background / cold start).
 * Returns unsubscribe.
 */
export function startNotificationResponseRouting(
  onNavigate: NavHandler,
): () => void {
  if (Platform.OS === 'web') return () => {};

  let sub: { remove: () => void } | null = null;
  let cancelled = false;

  (async () => {
    try {
      const Notifications = await import('expo-notifications');
      if (cancelled) return;

      const handle = async (response: {
        notification: { request: { content: { data?: Record<string, unknown> } } };
      }) => {
        const data = response?.notification?.request?.content?.data;
        const nav = notificationDataToNav(
          (data ?? {}) as Record<string, unknown>,
        );
        if (nav) onNavigate(nav);
        try {
          await Notifications.clearLastNotificationResponseAsync?.();
        } catch {
          // older SDKs may not have clear
        }
      };

      const last = await Notifications.getLastNotificationResponseAsync();
      if (!cancelled && last) await handle(last as any);

      sub = Notifications.addNotificationResponseReceivedListener((r) => {
        void handle(r as any);
      });
    } catch {
      // ignore
    }
  })();

  return () => {
    cancelled = true;
    sub?.remove();
  };
}
