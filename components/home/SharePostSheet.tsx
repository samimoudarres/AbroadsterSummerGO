import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/theme';
import type {
  ChatProfile,
  ChatTarget,
  FeedPost,
  TripChannel,
} from '../../data/chatTypes';
import { chatRepo } from '../../lib/chat/repository';
import { formatTripNames } from '../../lib/trips/dates';
import { Avatar } from '../common/Avatar';

type ShareTripRow = {
  channel: TripChannel;
  members: ChatProfile[];
};

type ShareTarget =
  | { kind: 'friend'; profile: ChatProfile }
  | { kind: 'trip'; trip: ShareTripRow };

interface SharePostSheetProps {
  post: FeedPost | null;
  visible: boolean;
  onClose: () => void;
  onShared: (target?: ChatTarget) => void;
}

export function SharePostSheet({
  post,
  visible,
  onClose,
  onShared,
}: SharePostSheetProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<ChatProfile[]>([]);
  const [trips, setTrips] = useState<ShareTripRow[]>([]);
  const [selected, setSelected] = useState<ShareTarget[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSelected([]);
    (async () => {
      const [ids, channels] = await Promise.all([
        chatRepo.getFriendIds(),
        chatRepo.listMyTripChannels(),
      ]);
      const profiles = (
        await Promise.all(ids.map((id) => chatRepo.getProfile(id)))
      ).filter(Boolean) as ChatProfile[];
      setFriends(profiles);

      const tripRows: ShareTripRow[] = [];
      for (const channel of channels) {
        const trip = await chatRepo.getTrip(channel.tripId);
        const memberIds = trip?.memberIds?.length
          ? trip.memberIds
          : [];
        const members = (
          await Promise.all(memberIds.map((id) => chatRepo.getProfile(id)))
        ).filter(Boolean) as ChatProfile[];
        tripRows.push({ channel, members });
      }
      setTrips(tripRows);
    })();
  }, [visible]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const friendItems: ShareTarget[] = friends
      .filter(
        (p) =>
          !q ||
          p.fullName.toLowerCase().includes(q) ||
          p.firstName.toLowerCase().includes(q) ||
          (p.studyAbroadProgram ?? '').toLowerCase().includes(q) ||
          (p.homeUniversity ?? '').toLowerCase().includes(q),
      )
      .map((profile) => ({ kind: 'friend' as const, profile }));
    const tripItems: ShareTarget[] = trips
      .filter((t) => {
        if (!q) return true;
        const names = t.members.map((m) => m.firstName).join(' ').toLowerCase();
        return (
          t.channel.name.toLowerCase().includes(q) ||
          t.channel.destinationCity.toLowerCase().includes(q) ||
          names.includes(q)
        );
      })
      .map((trip) => ({ kind: 'trip' as const, trip }));
    return [...friendItems, ...tripItems];
  }, [friends, trips, query]);

  const toggle = (item: ShareTarget) => {
    setSelected((prev) => {
      const key =
        item.kind === 'friend'
          ? `f-${item.profile.id}`
          : `t-${item.trip.channel.id}`;
      const exists = prev.some((s) =>
        s.kind === 'friend'
          ? `f-${s.profile.id}` === key
          : `t-${s.trip.channel.id}` === key,
      );
      if (exists) {
        return prev.filter((s) =>
          s.kind === 'friend'
            ? `f-${s.profile.id}` !== key
            : `t-${s.trip.channel.id}` !== key,
        );
      }
      return [...prev, item];
    });
  };

  const isSelected = (item: ShareTarget) =>
    selected.some((s) =>
      item.kind === 'friend'
        ? s.kind === 'friend' && s.profile.id === item.profile.id
        : s.kind === 'trip' && s.trip.channel.id === item.trip.channel.id,
    );

  const send = async () => {
    if (!post || !selected.length || sending) return;
    setSending(true);
    try {
      let lastTrip: ChatTarget | undefined;
      for (const s of selected) {
        if (s.kind === 'friend') {
          const thread = await chatRepo.openDm(s.profile.id);
          await chatRepo.sharePostToChat(post.id, {
            type: 'dm',
            threadId: thread.id,
            otherUserId: s.profile.id,
          });
        } else {
          const target: ChatTarget = {
            type: 'trip_channel',
            channelId: s.trip.channel.id,
            tripId: s.trip.channel.tripId,
          };
          await chatRepo.sharePostToChat(post.id, target);
          lastTrip = target;
        }
      }
      onShared(lastTrip);
    } finally {
      setSending(false);
    }
  };

  const schoolLine = (p: ChatProfile) => {
    const abroad = (p.studyAbroadProgram || '').trim();
    const home = (p.homeUniversity || '').trim();
    if (abroad && home) return `${abroad} · ${home}`;
    return abroad || home || 'Friend';
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Share post</Text>
          {post ? (
            <Text style={styles.preview} numberOfLines={1}>
              {post.locationLabel}
              {post.caption ? ` · ${post.caption}` : ''}
            </Text>
          ) : null}
          <TextInput
            style={styles.search}
            placeholder="Search friends or trips"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
          />
          <FlatList
            data={items}
            keyExtractor={(item) =>
              item.kind === 'friend'
                ? `f-${item.profile.id}`
                : `t-${item.trip.channel.id}`
            }
            style={styles.list}
            renderItem={({ item }) => {
              const sel = isSelected(item);
              if (item.kind === 'friend') {
                return (
                  <Pressable style={styles.row} onPress={() => toggle(item)}>
                    <Avatar source={item.profile.avatar} size={44} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{item.profile.fullName}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {schoolLine(item.profile)}
                      </Text>
                    </View>
                    <View style={[styles.check, sel && styles.checkOn]} />
                  </Pressable>
                );
              }
              const members = item.trip.members.slice(0, 3);
              const names = formatTripNames(
                item.trip.members.map((m) => m.firstName),
              );
              return (
                <Pressable style={styles.row} onPress={() => toggle(item)}>
                  <View style={styles.tripAvatars}>
                    {members.length ? (
                      members.map((m, i) => (
                        <View
                          key={m.id}
                          style={[styles.tripAv, i > 0 && { marginLeft: -12 }]}
                        >
                          <Avatar source={m.avatar} size={i === 0 ? 44 : 32} />
                        </View>
                      ))
                    ) : (
                      <View style={styles.tripAvatarFallback}>
                        <Text style={styles.tripAvatarText}>
                          {item.trip.channel.destinationCity
                            .slice(0, 1)
                            .toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.trip.channel.name}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {names || 'Trip chat'}
                    </Text>
                  </View>
                  <View style={[styles.check, sel && styles.checkOn]} />
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>No friends or trip chats yet.</Text>
            }
          />
          <Pressable
            style={[
              styles.send,
              (!selected.length || sending) && styles.sendDisabled,
            ]}
            disabled={!selected.length || sending}
            onPress={send}
          >
            {sending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.sendText}>
                Send{selected.length ? ` (${selected.length})` : ''}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '72%',
    paddingHorizontal: 16,
    zIndex: 2,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    marginTop: 10,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.black,
    marginBottom: 4,
  },
  preview: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 10,
  },
  search: {
    backgroundColor: colors.searchTrack,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.regular,
    fontSize: 15,
    marginBottom: 8,
  },
  list: { flexGrow: 0, maxHeight: 320 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.black },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  tripAvatars: {
    width: 56,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripAv: {
    borderWidth: 2,
    borderColor: colors.white,
    borderRadius: 22,
  },
  tripAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.groupAvatarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripAvatarText: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.openJoin,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#ccc',
  },
  checkOn: {
    backgroundColor: colors.openJoin,
    borderColor: colors.openJoin,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    paddingVertical: 24,
    fontFamily: fonts.regular,
  },
  send: {
    marginTop: 12,
    backgroundColor: colors.openJoin,
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.45 },
  sendText: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 16,
  },
});
