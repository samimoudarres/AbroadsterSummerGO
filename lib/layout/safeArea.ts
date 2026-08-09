import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PHONE_SAFE_INSETS } from '../../components/layout/PhoneShell';

/** Top inset that clears the Dynamic Island / notch on device + web phone frame. */
export function usePhoneTopPad(extra = 0): number {
  const insets = useSafeAreaInsets();
  const top =
    insets.top > 0
      ? insets.top
      : Platform.OS === 'web'
        ? PHONE_SAFE_INSETS.top
        : 44;
  return top + extra;
}

/** Bottom clearance for the tab bar (row + home indicator). */
export function useBottomNavClearance(): number {
  const insets = useSafeAreaInsets();
  const bottom =
    insets.bottom > 0
      ? insets.bottom
      : Platform.OS === 'web'
        ? PHONE_SAFE_INSETS.bottom
        : 8;
  return 60 + bottom;
}
