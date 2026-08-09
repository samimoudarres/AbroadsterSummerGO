import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BRAND_TEAL, colors } from '../../constants/theme';
import { usePhoneTopPad } from '../../lib/layout/safeArea';

const BRAND_LOGO = require('../../assets/brand/abroadster-logo.png');

/** Exact Figma / logo header teal. */
export const ABROADSTER_HEADER_TEAL = BRAND_TEAL;

/** White icon color used on the Figma teal header. */
export const ABROADSTER_HEADER_ICON = colors.white;

/** Figma logo frame size on 375pt artboard (node 156:202). */
const LOGO_W = 162;
const LOGO_H = 51;
/** Figma content row under status (~88 − status). */
const ROW_H = 56;

interface AbroadsterTopBarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pixel-faithful Abroadster brand header from Figma (Instagram Main top bar).
 * Teal fills the status/safe area; logo + actions sit below the Dynamic Island.
 */
export function AbroadsterTopBar({ left, right, style }: AbroadsterTopBarProps) {
  const topPad = usePhoneTopPad(0);

  return (
    <View style={[styles.header, { paddingTop: topPad }, style]}>
      <View style={styles.row}>
        <View style={styles.side}>{left ?? null}</View>
        <View style={styles.logoSlot} pointerEvents="none">
          <Image
            source={BRAND_LOGO}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Abroadster"
          />
        </View>
        <View style={[styles.side, styles.sideRight]}>{right ?? null}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: ABROADSTER_HEADER_TEAL,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#A6A6AA',
    zIndex: 5,
  },
  row: {
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    position: 'relative',
  },
  side: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 2,
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  logoSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_W,
    height: LOGO_H,
  },
});
