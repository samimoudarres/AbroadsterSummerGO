import React from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/** iPhone 16 / 17 Pro logical size from Figma frame */
export const PHONE_WIDTH = 402;
export const PHONE_HEIGHT = 874;

/** Matches Dynamic Island / camera cutout + home indicator on modern iPhones */
export const PHONE_SAFE_INSETS = {
  top: 59,
  bottom: 34,
  left: 0,
  right: 0,
};

interface PhoneShellProps {
  children: React.ReactNode;
}

/**
 * Confines the whole app to a phone aspect ratio on desktop web.
 * On a real phone, fills the screen.
 * Provides iPhone-like safe-area insets inside the desktop frame so top UI
 * clears the camera / Dynamic Island region.
 */
export function PhoneShell({ children }: PhoneShellProps) {
  const { width, height } = useWindowDimensions();
  const isNarrow = width <= PHONE_WIDTH + 40;

  if (Platform.OS !== 'web' || isNarrow) {
    return <View style={styles.fill}>{children}</View>;
  }

  const maxW = Math.min(PHONE_WIDTH, width - 48);
  const maxH = Math.min(PHONE_HEIGHT, height - 48);
  const scale = Math.min(maxW / PHONE_WIDTH, maxH / PHONE_HEIGHT);
  const frameW = PHONE_WIDTH * scale;
  const frameH = PHONE_HEIGHT * scale;

  return (
    <View style={styles.desktopBackdrop}>
      <View style={[styles.frameSlot, { width: frameW, height: frameH }]}>
        <View
          style={[
            styles.phone,
            {
              width: PHONE_WIDTH,
              height: PHONE_HEIGHT,
              transform: [{ scale }],
            },
          ]}
        >
          <SafeAreaProvider
            initialMetrics={{
              frame: { x: 0, y: 0, width: PHONE_WIDTH, height: PHONE_HEIGHT },
              insets: PHONE_SAFE_INSETS,
            }}
          >
            {children}
          </SafeAreaProvider>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  desktopBackdrop: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 28,
  },
  phone: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#2A2A2A',
  },
});
