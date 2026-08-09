import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile } from '../../data/chatTypes';
import { chatRepo } from '../../lib/chat/repository';
import { usePhoneTopPad } from '../../lib/layout/safeArea';
import { Avatar } from '../common/Avatar';

interface FriendsListSheetProps {
  visible: boolean;
  userId: string;
  title?: string;
  onClose: () => void;
  onSelectUser: (user: ChatProfile) => void;
}

/** Instagram-style following list for a user's one-way friends. */
export function FriendsListSheet({
  visible,
  userId,
  title = 'Friends',
  onClose,
  onSelectUser,
}: FriendsListSheetProps) {
  const topPad = usePhoneTopPad(0);
  const [friends, setFriends] = useState<ChatProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const list = await chatRepo.listFriendsForUser(userId);
      setFriends(list);
    } catch {
      setFriends([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!visible) return;
    void load();
  }, [visible, load]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.side}>
            <Ionicons name="close" size={26} color={colors.black} />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.side} />
        </View>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brandTeal} />
          </View>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>No friends yet</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onClose();
                  onSelectUser(item);
                }}
              >
                <Avatar source={item.avatar} name={item.fullName} size={48} />
                <View style={styles.meta}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.fullName}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {[item.homeUniversity, item.studyAbroadProgram]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  side: { width: 40, alignItems: 'center' },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.black,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingVertical: 8, paddingBottom: 40 },
  empty: {
    textAlign: 'center',
    marginTop: 48,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  meta: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.black,
  },
  sub: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
});
