/** Notification preference keys (aligned with NotificationsScreen groups). */
export type NotifPrefKey =
  | 'stamps'
  | 'dms'
  | 'channels'
  | 'friends'
  | 'trip_invites'
  | 'trips'
  | 'albums'
  | 'tagged';

export const DEFAULT_NOTIF_PREFS: Record<NotifPrefKey, boolean> = {
  stamps: true,
  dms: true,
  channels: true,
  friends: true,
  trip_invites: true,
  trips: true,
  albums: true,
  tagged: true,
};

export const NOTIF_PREF_LABELS: { key: NotifPrefKey; label: string }[] = [
  { key: 'stamps', label: 'Stamps' },
  { key: 'dms', label: 'Direct messages' },
  { key: 'channels', label: 'Channel messages' },
  { key: 'friends', label: 'Friends' },
  { key: 'trip_invites', label: 'Trip invites' },
  { key: 'trips', label: 'Trips' },
  { key: 'albums', label: 'Albums' },
  { key: 'tagged', label: 'Tagged' },
];

export type OnboardingFlags = {
  first_map_done?: boolean;
  suggested_overlay_done?: boolean;
};

export type UserSettings = {
  notificationPrefs: Record<NotifPrefKey, boolean>;
  onboarding: OnboardingFlags;
  updatedAt: string;
};

export function emptyUserSettings(): UserSettings {
  return {
    notificationPrefs: { ...DEFAULT_NOTIF_PREFS },
    onboarding: {},
    updatedAt: new Date().toISOString(),
  };
}

export function mergeNotifPrefs(
  raw: unknown,
): Record<NotifPrefKey, boolean> {
  const base = { ...DEFAULT_NOTIF_PREFS };
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_NOTIF_PREFS) as NotifPrefKey[]) {
    if (typeof obj[key] === 'boolean') base[key] = obj[key] as boolean;
  }
  return base;
}

export function mergeOnboarding(raw: unknown): OnboardingFlags {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  return {
    first_map_done: Boolean(obj.first_map_done),
    suggested_overlay_done: Boolean(obj.suggested_overlay_done),
  };
}
