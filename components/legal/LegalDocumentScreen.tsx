import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
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
import type { LegalDocKind } from './LegalDocumentModal';

type Props = { kind: LegalDocKind };

/** Full-screen legal doc for /terms and /privacy (web + deep links). */
export function LegalDocumentScreen({ kind }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad =
    (insets.top > 0 ? insets.top : Platform.OS === 'web' ? PHONE_SAFE_INSETS.top : 12) +
    8;
  const bottomPad =
    (insets.bottom > 0
      ? insets.bottom
      : Platform.OS === 'web'
        ? PHONE_SAFE_INSETS.bottom
        : 12) + 24;

  const title = kind === 'terms' ? TERMS_OF_USE_TITLE : PRIVACY_POLICY_TITLE;
  const effective =
    kind === 'terms' ? TERMS_OF_USE_EFFECTIVE : PRIVACY_POLICY_EFFECTIVE;
  const sections =
    kind === 'terms' ? TERMS_OF_USE_SECTIONS : PRIVACY_POLICY_SECTIONS;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <Stack.Screen options={{ headerShown: false, title }} />
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.black} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomPad }]}
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.black,
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
});
