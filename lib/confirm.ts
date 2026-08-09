import { Alert, Platform } from 'react-native';

/** Confirm dialog that works on web (Alert.alert buttons often don't). */
export function confirmChoice(
  title: string,
  message: string,
  confirmLabel = 'OK',
  destructive = true,
): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
