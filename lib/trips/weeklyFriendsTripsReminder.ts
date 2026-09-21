import { Platform } from 'react-native';
import { ensureNotificationPermission } from './push';

/** Stable id so we can cancel/reschedule without stacking duplicates. */
export const WEEKLY_FRIENDS_TRIPS_NOTIF_ID = 'abroadster-weekly-friends-trips';

/**
 * Schedule a repeating local notification every Monday at 12:00 device-local time.
 * Tap opens Trips → this weekend’s friend trips (see notificationRouting).
 * On-device only — no Node cron / server scheduler required.
 */
export async function ensureWeeklyFriendsTripsReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const ok = await ensureNotificationPermission();
    if (!ok) return;
    const Notifications = await import('expo-notifications');

    // Drop any prior copy of this reminder (idempotent on each cold start).
    try {
      await Notifications.cancelScheduledNotificationAsync(
        WEEKLY_FRIENDS_TRIPS_NOTIF_ID,
      );
    } catch {
      // may not exist yet
    }

    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_FRIENDS_TRIPS_NOTIF_ID,
      content: {
        title: 'Where’s everyone going?',
        body: 'See where your friends are traveling this weekend',
        data: {
          kind: 'friends_weekend_trips',
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        // Expo: 1 = Sunday … 2 = Monday
        weekday: 2,
        hour: 12,
        minute: 0,
      },
    });
  } catch {
    // Permission / OS scheduling failures should never block the app.
  }
}
