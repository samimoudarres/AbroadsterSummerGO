import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import { PHONE_SAFE_INSETS } from '../layout/PhoneShell';
import {
  PRIVACY_POLICY_EFFECTIVE,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_TITLE,
} from '../../lib/legal/privacyPolicy';
import {
  TERMS_OF_USE_EFFECTIVE,
  TERMS_OF_USE_SECTIONS,
  TERMS_OF_USE_TITLE,
} from '../../lib/legal/termsOfUse';

export type LegalDocKind = 'terms' | 'privacy';

type Props = {
  visible: boolean;
  kind: LegalDocKind;
  onClose: () => void;
};

export function LegalDocumentModal({ visible, kind, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const topPad =
    (insets.top > 0 ? insets.top : Platform.OS === 'web' ? PHONE_SAFE_INSETS.top : 12) +
    8;
  const bottomPad =
    (insets.bottom > 0
      ? insets.bottom
      : Platform.OS === 'web'
        ? PHONE_SAFE_INSETS.bottom
        : 12) + 12;

  const title = kind === 'terms' ? TERMS_OF_USE_TITLE : PRIVACY_POLICY_TITLE;
  const effective =
    kind === 'terms' ? TERMS_OF_USE_EFFECTIVE : PRIVACY_POLICY_EFFECTIVE;
  const sections =
    kind === 'terms' ? TERMS_OF_USE_SECTIONS : PRIVACY_POLICY_SECTIONS;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={22} color={colors.black} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: bottomPad + 24 }]}
          showsVerticalScrollIndicator
        >
          <Text style={styles.effective}>
            Effective / Last updated: {effective}
          </Text>
          {sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.heading}>{section.heading}</Text>
              <Text style={styles.paragraph}>{section.body}</Text>
            </View>
          ))}
          <Pressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.black,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: 20, paddingTop: 16 },
  effective: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 18,
  },
  section: { marginBottom: 20 },
  heading: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.black,
    marginBottom: 8,
  },
  paragraph: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: '#333',
  },
  doneBtn: {
    marginTop: 8,
    backgroundColor: colors.brandTeal,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
});
