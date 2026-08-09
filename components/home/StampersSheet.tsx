import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile } from '../../data/chatTypes';
import { chatRepo } from '../../lib/chat/repository';
import { Avatar } from '../common/Avatar';

interface StampersSheetProps {
  visible: boolean;
  postId: string | null;
  onClose: () => void;
  onOpenProfile: (user: ChatProfile) => void;
}

/** Instagram-style list of people who stamped a post. */
export function StampersSheet({
  visible,
  postId,
  onClose,
  onOpenProfile,
}: StampersSheetProps) {
  const [loading, setLoading] = useState(false);
  const [stampers, setStampers] = useState<ChatProfile[]>([]);

  useEffect(() => {
    if (!visible || !postId) {
      setStampers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const rows = await chatRepo.listPostStampers(postId);
        if (!cancelled) setStampers(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, postId]);

  if (!visible || !postId) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>Stamps</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.programBlue} />
          </View>
        ) : stampers.length === 0 ? (
          <Text style={styles.empty}>No stamps yet</Text>
        ) : (
          <ScrollView style={{ maxHeight: 420 }}>
            {stampers.map((user) => (
              <Pressable
                key={user.id}
                style={styles.row}
                onPress={() => {
                  onClose();
                  onOpenProfile(user);
                }}
              >
                <Avatar source={user.avatar} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{user.fullName}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {user.studyAbroadProgram || user.homeUniversity}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 130,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.black,
  },
  loading: { paddingVertical: 40, alignItems: 'center' },
  empty: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 28,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.black,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
