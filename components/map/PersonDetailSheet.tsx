import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { UserProfile } from '../../data/types';
import { Avatar } from '../common/Avatar';

interface PersonDetailSheetProps {
  visible: boolean;
  user: UserProfile | null;
  cityName: string;
  upcomingLabel?: string;
  onClose: () => void;
  onViewProfile: () => void;
  onMessage: () => void;
}

/** In-tree overlay (not RN Modal) so it stays inside the phone frame. */
export function PersonDetailSheet({
  visible,
  user,
  cityName,
  upcomingLabel,
  onClose,
  onViewProfile,
  onMessage,
}: PersonDetailSheetProps) {
  if (!visible || !user) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Avatar source={user.avatar} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.fullName}</Text>
            <Text style={styles.meta}>{user.homeUniversity}</Text>
            <Text style={styles.meta}>{user.studyAbroadProgram}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <Text style={styles.section}>
          📍 Currently in {cityName || user.locationLabel}
        </Text>

        <Text style={styles.heading}>Upcoming trips</Text>
        <Text style={styles.body}>
          {upcomingLabel ? `✈️ ${upcomingLabel}` : 'None right now'}
        </Text>

        <Text style={styles.heading}>Trips in plan</Text>
        <Text style={styles.body}>—</Text>

        <Text style={styles.heading}>Past trips</Text>
        <Text style={styles.body}>—</Text>

        <View style={styles.actions}>
          <Pressable style={styles.primaryBtn} onPress={onViewProfile}>
            <Text style={styles.primaryText}>View Profile</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onMessage}>
            <Text style={styles.secondaryText}>Message</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 80,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 10,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  section: {
    fontFamily: fonts.bold,
    fontSize: 14,
    marginBottom: 12,
  },
  heading: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    marginTop: 8,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.programBlue,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: fonts.extraBold,
    color: colors.black,
  },
});
