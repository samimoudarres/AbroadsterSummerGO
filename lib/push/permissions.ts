import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ensureNotificationPermission, presentLocalNotification } from '../trips/push';

export { ensureNotificationPermission, presentLocalNotification };

function projectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)
      ?.extra?.eas?.projectId
  );
}

/** Native OS notification permission + Expo push token registration. */
export async function requestAndRegisterPush(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const granted = await ensureNotificationPermission();
  if (!granted) return false;

  try {
    const Notifications = await import('expo-notifications');
    const opts: { projectId?: string } = {};
    const pid = projectId();
    if (pid) opts.projectId = pid;

    const tokenResult = await Notifications.getExpoPushTokenAsync(
      Object.keys(opts).length ? opts : undefined,
    );
    const token = tokenResult?.data;
    if (!token) return true;

    const { chatRepo } = await import('../chat/repository');
    await chatRepo.registerPushToken(token, Platform.OS);
    return true;
  } catch {
    // Permission granted but token unavailable (e.g. Expo Go / missing EAS project)
    return true;
  }
}

/** Request native location permission (iOS/Android system dialog). */
export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const Location = await import('expo-location');
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return true;
    const asked = await Location.requestForegroundPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

/**
 * After first account creation: request notifications
 * (native system dialog). Location is not required — map pins use profile host city.
 */
export async function requestLaunchPermissions(): Promise<void> {
  await requestAndRegisterPush();
}
