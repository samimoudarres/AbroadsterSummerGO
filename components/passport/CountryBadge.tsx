import React from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { colors } from '../../constants/theme';
import type { PassportCountry } from '../../lib/passport/countries';
import { flagImageUrl } from '../../lib/passport/countries';

interface CountryBadgeProps {
  country: PassportCountry;
  unlocked: boolean;
  size?: number;
}

/**
 * Country stamp — real flag image (not regional-indicator letter pairs).
 * Unlocked = full color; locked = muted / grayed out.
 */
export function CountryBadge({
  country,
  unlocked,
  size = 48,
}: CountryBadgeProps) {
  const uri = flagImageUrl(country.key);
  const pad = Math.round(size * 0.12);
  const flagSize = size - pad * 2;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          padding: pad,
          backgroundColor: unlocked ? colors.brandMint : '#E8E8E8',
          opacity: unlocked ? 1 : 0.4,
        },
      ]}
    >
      <Image
        source={{ uri }}
        style={[
          {
            width: flagSize,
            height: flagSize,
            borderRadius: flagSize / 2,
          },
          !unlocked && Platform.OS === 'web'
            ? ({ filter: 'grayscale(1)' } as object)
            : null,
        ]}
        resizeMode="cover"
        accessibilityLabel={`${country.name} flag`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
