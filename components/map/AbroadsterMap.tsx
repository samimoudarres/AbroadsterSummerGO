import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AbroadsterMapProps } from './mapTypes';

/**
 * Native fallback. Full interactive Mapbox runs on web for this sprint
 * (native Mapbox needs a custom Expo dev client + secret token).
 */
export default function AbroadsterMap(_props: AbroadsterMapProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Open on web for the live Mapbox map</Text>
      <Text style={styles.sub}>
        Run `npm run web` to use the full interactive Abroadster map.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDE5EA',
    padding: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: {
    fontSize: 13,
    color: '#7C7C7C',
    textAlign: 'center',
  },
});
