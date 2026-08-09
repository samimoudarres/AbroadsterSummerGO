import { Platform } from 'react-native';

/** Request OS notification permission (iOS / Android). Safe no-op on web. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

/** Fire a local OS notification (used when album follow / join events happen on-device). */
export async function presentLocalNotification(input: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const ok = await ensureNotificationPermission();
    if (!ok) return;
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        data: input.data ?? {},
      },
      trigger: null,
    });
  } catch {
    // ignore — in-app notification still stored
  }
}
