import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { REACTIONS } from './MessageBubble';
import { colors, fonts } from '../../constants/theme';

interface ReactionPickerProps {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({ visible, onSelect, onClose }: ReactionPickerProps) {
  if (!visible) return null;
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.bar}>
        {REACTIONS.map((emoji) => (
          <Pressable
            key={emoji}
            style={styles.item}
            onPress={() => {
              onSelect(emoji);
              onClose();
            }}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>Tap an emoji · like iMessage</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  item: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 28 },
  hint: {
    marginTop: 10,
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 4,
  },
});
