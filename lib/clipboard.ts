import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

/** Copy text to the system clipboard. Returns true on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
