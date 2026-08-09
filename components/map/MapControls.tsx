import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { MapLayerFilter, MapStyleMode } from '../../data/types';

const CONTROL_TEAL = colors.openJoin;

interface MapControlsProps {
  topInset?: number;
  styleMode: MapStyleMode;
  layerFilter: MapLayerFilter;
  showLayerMenu: boolean;
  onToggleStyle: () => void;
  onToggleLayerMenu: () => void;
  onSelectLayer: (layer: MapLayerFilter) => void;
  onRecenter: () => void;
  onCreateTrip: () => void;
}

const LAYERS: { id: MapLayerFilter; label: string }[] = [
  { id: 'all', label: 'All pins' },
  { id: 'here', label: 'Currently here' },
  { id: 'upcoming', label: 'Upcoming trips' },
  { id: 'planning', label: 'Planning trips' },
  { id: 'programs', label: 'Study programs' },
];

export function MapControls({
  topInset = 56,
  styleMode,
  layerFilter,
  showLayerMenu,
  onToggleStyle,
  onToggleLayerMenu,
  onSelectLayer,
  onRecenter,
  onCreateTrip,
}: MapControlsProps) {
  return (
    <>
      <View style={[styles.topRight, { top: topInset }]}>
        <Pressable style={styles.roundBtn} onPress={onToggleLayerMenu} hitSlop={8}>
          <MaterialIcons name="layers" size={22} color={CONTROL_TEAL} />
        </Pressable>
        <Pressable style={styles.roundBtn} onPress={onRecenter} hitSlop={8}>
          <MaterialIcons name="my-location" size={20} color={CONTROL_TEAL} />
        </Pressable>
        <Pressable style={styles.roundBtn} onPress={onToggleStyle} hitSlop={8}>
          <MaterialIcons
            name={styleMode === 'regular' ? 'satellite' : 'map'}
            size={20}
            color={CONTROL_TEAL}
          />
        </Pressable>
        {/* Create trip — stacked under satellite, not floating mid-screen */}
        <Pressable
          style={[styles.roundBtn, styles.createBtn]}
          onPress={onCreateTrip}
          hitSlop={8}
        >
          <MaterialIcons name="add" size={26} color={colors.white} />
        </Pressable>
      </View>

      {showLayerMenu && (
        <View style={[styles.menu, { top: topInset }]}>
          <Text style={styles.menuTitle}>Map layers</Text>
          {LAYERS.map((layer) => {
            const active = layerFilter === layer.id;
            return (
              <Pressable
                key={layer.id}
                style={styles.menuRow}
                onPress={() => onSelectLayer(layer.id)}
              >
                <Text style={styles.menuCheck}>{active ? '✓' : ''}</Text>
                <Text style={[styles.menuLabel, active && styles.menuLabelOn]}>
                  {layer.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  topRight: {
    position: 'absolute',
    right: 12,
    gap: 10,
    zIndex: 20,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  createBtn: {
    backgroundColor: colors.brandCoral,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  menu: {
    position: 'absolute',
    left: 12,
    width: 200,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    zIndex: 25,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  menuCheck: {
    width: 18,
    fontFamily: fonts.bold,
    color: colors.programBlue,
  },
  menuLabel: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.black,
  },
  menuLabelOn: {
    fontFamily: fonts.bold,
  },
});
