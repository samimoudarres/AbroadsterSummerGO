import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND_TEAL, colors } from '../../constants/theme';
import {
  ABROADSTER_HEADER_ICON,
  AbroadsterTopBar,
} from '../common/AbroadsterTopBar';

interface AuthStepHeaderProps {
  onBack?: () => void;
  progress?: number; // 0–1
}

/** Same full teal Abroadster header as profile / home. */
export function AuthStepHeader({ onBack, progress }: AuthStepHeaderProps) {
  return (
    <View style={styles.wrap}>
      <AbroadsterTopBar
        left={
          onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              style={styles.back}
              accessibilityLabel="Back"
            >
              <Ionicons
                name="chevron-back"
                size={28}
                color={ABROADSTER_HEADER_ICON}
              />
            </Pressable>
          ) : (
            <View style={styles.back} />
          )
        }
      />
      {typeof progress === 'number' ? (
        <View style={styles.trackWrap}>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` },
              ]}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: BRAND_TEAL,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackWrap: {
    backgroundColor: BRAND_TEAL,
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.white,
    borderRadius: 2,
  },
});
