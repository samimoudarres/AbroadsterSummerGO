import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/theme';
import type {
  ChannelSlug,
  ChatCommunity,
  ChatProfile,
  DmThread,
  TripChannel,
} from '../../data/chatTypes';
import { chatRepo, subscribeChat } from '../../lib/chat/repository';
import { tripChatTitle } from '../../lib/trips/dates';
import { Avatar } from '../common/Avatar';
import { PHONE_SAFE_INSETS, PHONE_WIDTH } from '../layout/PhoneShell';

const DRAWER_WIDTH = Math.round(PHONE_WIDTH * 0.68);

interface ChannelSidebarProps {
  open: boolean;
  communities: ChatCommunity[];
  activeCommunityId: string | null;
  activeChannelSlug: ChannelSlug;
  activeTripChannelId?: string | null;
  onClose: () => void;
  onSelectChannel: (communityId: string, slug: ChannelSlug) => void;
  onSelectTripChannel?: (channel: TripChannel) => void;
  onOpenDm: (userId: string) => void;
}

export function ChannelSidebar({
  open,
  communities,
  activeCommunityId,
  activeChannelSlug,
  activeTripChannelId,
  onClose,
  onSelectChannel,
  onSelectTripChannel,
  onOpenDm,
}: ChannelSidebarProps) {
  const x = useSharedValue(-DRAWER_WIDTH);
  const insets = useSafeAreaInsets();
  const topPad =
    (insets.top > 0 ? insets.top : Platform.OS === 'web' ? PHONE_SAFE_INSETS.top : 12) +
    8;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatProfile[]>([]);
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [tripChannels, setTripChannels] = useState<TripChannel[]>([]);

  useEffect(() => {
    x.value = withTiming(open ? 0 : -DRAWER_WIDTH, { duration: 220 });
  }, [open, x]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      const list = await chatRepo.listDmThreads();
      const map: Record<string, ChatProfile> = {};
      for (const t of list) {
        const p = await chatRepo.getProfile(t.otherUserId);
        if (p) map[t.otherUserId] = p;
      }
      const trips = await chatRepo.listMyTripChannels();
      if (!cancelled) {
        setThreads(list);
        setProfiles(map);
        setTripChannels(trips);
      }
    };
    load();
    const unsub = subscribeChat(() => {
      load();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const found = await chatRepo.searchUsers(query);
      if (!cancelled) setResults(found);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  if (!open) {
    // still render for animation exit — use opacity gate
  }

  return (
    <View
      style={[styles.overlay, !open && styles.overlayHidden]}
      pointerEvents={open ? 'auto' : 'none'}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.drawer, drawerStyle, { paddingTop: topPad }]}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionTitle}>Channels</Text>
          {communities.map((c) => {
            const isOpen = expanded[c.id] ?? true;
            return (
              <View key={c.id} style={styles.communityBlock}>
                <Pressable
                  style={styles.communityHeader}
                  onPress={() =>
                    setExpanded((e) => ({ ...e, [c.id]: !isOpen }))
                  }
                >
                  <Ionicons
                    name={isOpen ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color={colors.textMuted}
                  />
                  <View style={[styles.dot, { backgroundColor: c.accent }]} />
                  <Text style={styles.communityName} numberOfLines={1}>
                    {c.name}
                  </Text>
                </Pressable>
                {isOpen
                  ? (
                      ['general', 'introductions', 'trips', 'roommates'] as ChannelSlug[]
                    ).map((slug) => {
                      const active =
                        activeCommunityId === c.id && activeChannelSlug === slug;
                      return (
                        <Pressable
                          key={slug}
                          style={[styles.channelRow, active && styles.channelActive]}
                          onPress={() => onSelectChannel(c.id, slug)}
                        >
                          <Text style={styles.hash}>#</Text>
                          <Text
                            style={[
                              styles.channelName,
                              active && styles.channelNameActive,
                            ]}
                          >
                            {slug.charAt(0).toUpperCase() + slug.slice(1)}
                          </Text>
                        </Pressable>
                      );
                    })
                  : null}
              </View>
            );
          })}

          {tripChannels.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Trips</Text>
              {tripChannels.map((ch) => {
                const active = activeTripChannelId === ch.id;
                return (
                  <Pressable
                    key={ch.id}
                    style={[styles.channelRow, active && styles.channelActive]}
                    onPress={() => onSelectTripChannel?.(ch)}
                  >
                    <Ionicons
                      name="airplane"
                      size={14}
                      color={active ? colors.programBlue : colors.openJoin}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.channelName,
                        active && styles.channelNameActive,
                      ]}
                      numberOfLines={1}
                    >
                      {ch.name ||
                        tripChatTitle(ch.destinationCity, ch.destinationCountry)}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          ) : null}

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>AirMail</Text>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search people"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>
          {query.trim()
            ? results.length === 0
              ? (
                  <Text style={styles.emptyAirMail}>No people found</Text>
                )
              : results.map((u) => (
                <Pressable
                  key={u.id}
                  style={styles.dmRow}
                  onPress={() => onOpenDm(u.id)}
                >
                  <Avatar source={u.avatar} size={36} />
                  <Text style={styles.dmName}>{u.fullName}</Text>
                </Pressable>
              ))
            : threads.length === 0
              ? (
                  <Text style={styles.emptyAirMail}>
                    No conversations yet — search someone to start AirMail.
                  </Text>
                )
              : threads.map((t) => {
                const u = profiles[t.otherUserId];
                if (!u) return null;
                return (
                  <Pressable
                    key={t.id}
                    style={styles.dmRow}
                    onPress={() => onOpenDm(u.id)}
                  >
                    <Avatar source={u.avatar} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dmName}>{u.fullName}</Text>
                      {t.lastPreview ? (
                        <Text style={styles.dmPreview} numberOfLines={1}>
                          {t.lastPreview}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

export { DRAWER_WIDTH };

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 90,
    flexDirection: 'row',
  },
  overlayHidden: { opacity: 0 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#F7F7F8',
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 0 },
    elevation: 16,
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  communityBlock: { marginBottom: 12 },
  communityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  communityName: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.black,
    flex: 1,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingLeft: 22,
    borderRadius: 8,
  },
  channelActive: { backgroundColor: 'rgba(0,0,0,0.06)' },
  hash: { color: colors.textMuted, marginRight: 6, fontSize: 15 },
  channelName: { fontSize: 15, color: '#333' },
  channelNameActive: { fontFamily: fonts.bold, color: colors.black },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.black, padding: 0 },
  dmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  dmAvatar: { width: 36, height: 36, borderRadius: 18 },
  dmName: { fontFamily: fonts.bold, fontSize: 15, color: colors.black, flexShrink: 1 },
  dmPreview: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  emptyAirMail: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    paddingVertical: 12,
    paddingHorizontal: 4,
    lineHeight: 18,
  },
});
