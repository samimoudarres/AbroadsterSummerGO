import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';

export interface DestinationMapPreviewProps {
  latitude: number | null;
  longitude: number | null;
  pinLabel?: string;
}

/** Native stub — full Mapbox preview is web-first like the rest of the map. */
export default function DestinationMapPreview({
  pinLabel,
}: DestinationMapPreviewProps) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="map" size={28} color={colors.programBlue} />
      <Text style={styles.text}>
        {pinLabel ? `Pinned: ${pinLabel}` : 'Select a city to preview the map'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 168,
    borderRadius: 18,
    backgroundColor: '#E8EEF5',
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
