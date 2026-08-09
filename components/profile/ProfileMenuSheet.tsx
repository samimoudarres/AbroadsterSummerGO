import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND_TEAL, colors, fonts } from '../../constants/theme';

export type ProfileMenuItem = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

interface ProfileMenuSheetProps {
  visible: boolean;
  title?: string;
  items: ProfileMenuItem[];
  onClose: () => void;
}

/** Web-safe action sheet (Alert.alert often does nothing on web). */
export function ProfileMenuSheet({
  visible,
  title,
  items,
  onClose,
}: ProfileMenuSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.stack} pointerEvents="box-none">
          <View style={styles.sheet}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {items.map((item, i) => (
              <Pressable
                key={item.key}
                style={[
                  styles.row,
                  (i > 0 || title) && styles.rowBorder,
                ]}
                onPress={() => {
                  onClose();
                  setTimeout(() => item.onPress(), 50);
                }}
              >
                {item.icon ? (
                  <Ionicons
                    name={item.icon}
                    size={22}
                    color={item.destructive ? colors.brandCoral : BRAND_TEAL}
                  />
                ) : null}
                <Text
                  style={[
                    styles.label,
                    item.destructive && styles.labelDestructive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: 12,
    paddingBottom: 20,
  },
  stack: {
    gap: 8,
  },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: 18,
    overflow: 'hidden',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  label: {
    fontFamily: fonts.regular,
    fontSize: 17,
    color: colors.black,
  },
  labelDestructive: {
    color: colors.brandCoral,
    fontFamily: fonts.bold,
  },
  cancel: {
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.black,
  },
});
