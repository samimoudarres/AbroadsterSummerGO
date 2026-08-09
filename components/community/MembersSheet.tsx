import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile } from '../../data/chatTypes';
import { chatRepo, isOwnSender } from '../../lib/chat/repository';
import { Avatar } from '../common/Avatar';

interface MembersSheetProps {
  visible: boolean;
  title: string;
  communityId: string | null;
  memberIds?: string[];
  onClose: () => void;
  onSelectUser: (user: ChatProfile) => void;
}

export function MembersSheet({
  visible,
  title,
  communityId,
  memberIds,
  onClose,
  onSelectUser,
}: MembersSheetProps) {
  const [members, setMembers] = useState<ChatProfile[]>([]);
  const [friendMap, setFriendMap] = useState<Record<string, boolean>>({});
  const [meId, setMeId] = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const me = await chatRepo.getMe();
      let list: ChatProfile[] = [];
      if (memberIds) {
        const profiles = await Promise.all(memberIds.map((id) => chatRepo.getProfile(id)));
        list = profiles.filter(Boolean) as ChatProfile[];
      } else if (communityId) {
        list = await chatRepo.getCommunityMembers(communityId);
      }
      const flags: Record<string, boolean> = {};
      await Promise.all(
        list.map(async (u) => {
          flags[u.id] = await chatRepo.isFriend(u.id);
        }),
      );
      if (!cancelled) {
        setMeId(me.id);
        setMembers(list);
        setFriendMap(flags);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, communityId, memberIds]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: 420 }}>
          {members.map((user) => {
            const isMe = isOwnSender(user.id, meId);
            const isFriend = friendMap[user.id];
            return (
              <View key={user.id} style={styles.row}>
                <Pressable
                  style={styles.userHit}
                  onPress={() => onSelectUser(user)}
                >
                  <Avatar source={user.avatar} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{user.fullName}</Text>
                    <Text style={styles.meta}>
                      {user.homeUniversity} · {user.studyAbroadProgram}
                    </Text>
                  </View>
                </Pressable>
                {!isMe ? (
                  isFriend ? (
                    <View style={styles.friendBtn}>
                      <Text style={styles.friendText}>Friend</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.addBtn}
                      onPress={async () => {
                        await chatRepo.addFriend(user.id);
                        setFriendMap((m) => ({ ...m, [user.id]: true }));
                      }}
                    >
                      <Text style={styles.addText}>+Add</Text>
                    </Pressable>
                  )
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 92,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    marginTop: 8,
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { fontFamily: fonts.extraBold, fontSize: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  userHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontFamily: fonts.bold, fontSize: 15 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  addBtn: {
    backgroundColor: colors.programBlue,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addText: { color: colors.white, fontFamily: fonts.bold, fontSize: 13 },
  friendBtn: {
    backgroundColor: '#E8E8E8',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  friendText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 13 },
});
