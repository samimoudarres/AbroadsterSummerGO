import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatNotification, ChatProfile } from '../../data/chatTypes';
import { chatRepo, initChat, subscribeChat } from '../../lib/chat/repository';
import { timeAgo } from '../../lib/feed/timeAgo';
import { toImageSource } from '../../lib/images';
import { usePhoneTopPad } from '../../lib/layout/safeArea';
import type { SuggestedAccount } from '../../lib/social/suggestAccounts';
import { Avatar } from '../common/Avatar';

export type NotificationNav =
  | { type: 'profile'; userId: string }
  | { type: 'album'; tripId: string }
  | { type: 'trip'; tripId: string }
  | { type: 'map' }
  | { type: 'post'; postId: string }
  | { type: 'dm'; userId: string; threadId?: string | null }
  | {
      type: 'channel';
      channelId: string;
      communityId: string;
      slug?: string;
    };

interface NotificationsScreenProps {
  onClose: () => void;
  onNavigate: (nav: NotificationNav) => void;
}

/** Collapsed preview size per group (Instagram-style). */
const PREVIEW_COUNT = 3;
const SUGGESTED_PREVIEW = 5;

type GroupDef = {
  id: string;
  title: string;
  kinds: string[];
};

const GROUPS: GroupDef[] = [
  {
    id: 'messages',
    title: 'Messages',
    kinds: ['dm_message', 'channel_message'],
  },
  { id: 'stamps', title: 'Stamps', kinds: ['post_stamped'] },
  { id: 'tagged', title: 'Tagged', kinds: ['post_tagged'] },
  {
    id: 'friends',
    title: 'Friends',
    kinds: ['friend_added', 'friend_nearby'],
  },
  {
    id: 'invites',
    title: 'Trip invites',
    kinds: [
      'trip_invite',
      'trip_invite_reminder',
      'trip_join_request',
      'trip_invite_accepted',
      'trip_invite_declined',
      'trip_invite_cancelled',
      'trip_join_accepted',
      'trip_join_declined',
    ],
  },
  {
    id: 'trips',
    title: 'Trips',
    kinds: ['trip_created', 'trip_confirmed', 'trip_countdown'],
  },
  { id: 'albums', title: 'Albums', kinds: ['album_followed', 'album_photos_uploaded'] },
];

type ListRow =
  | { type: 'header'; key: string; title: string; count: number }
  | { type: 'item'; key: string; notif: ChatNotification }
  | {
      type: 'more';
      key: string;
      groupId: string;
      remaining: number;
      expanded: boolean;
    };

function actorId(n: ChatNotification): string {
  const d = n.data ?? {};
  return (
    (d.fromUserId as string) ||
    (d.from_user_id as string) ||
    (d.ownerId as string) ||
    (d.owner_id as string) ||
    (d.inviterId as string) ||
    (d.inviter_id as string) ||
    (d.requesterId as string) ||
    (d.requester_id as string) ||
    ''
  );
}

function dataStr(d: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

function groupForKind(kind: string): GroupDef {
  return (
    GROUPS.find((g) => g.kinds.includes(kind)) ?? {
      id: 'other',
      title: 'Other',
      kinds: [],
    }
  );
}

/** Kinds that should show a small media thumbnail (Instagram-style). */
function wantsMediaPreview(kind: string): boolean {
  return [
    'post_tagged',
    'post_stamped',
    'album_followed',
    'album_photos_uploaded',
    'trip_invite',
    'trip_invite_reminder',
    'trip_join_request',
    'trip_join_accepted',
    'trip_created',
    'trip_confirmed',
    'trip_countdown',
  ].includes(kind);
}

async function resolveNotifPreview(
  n: ChatNotification,
): Promise<string | null> {
  const d = n.data ?? {};
  const postId = dataStr(d, 'postId', 'post_id');
  const tripId = dataStr(d, 'tripId', 'trip_id');
  try {
    if (postId) {
      const post = await chatRepo.getPost(postId);
      const url = post?.photoUrls?.[0];
      return typeof url === 'string' ? url : null;
    }
    if (tripId) {
      const trip = await chatRepo.getTrip(tripId);
      const url = trip?.albumPreviewUrls?.[0];
      if (typeof url === 'string' && url) return url;
      const photos = await chatRepo.getTripAlbumPhotos(tripId);
      const first = photos[0]?.imageUrl;
      return typeof first === 'string' ? first : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function NotificationsScreen({
  onClose,
  onNavigate,
}: NotificationsScreenProps) {
  const topPad = usePhoneTopPad(0);
  const [items, setItems] = useState<ChatNotification[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewsRef = React.useRef(previews);
  previewsRef.current = previews;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Locally resolved invite/join actions so buttons disappear after respond */
  const [resolved, setResolved] = useState<Record<string, 'accepted' | 'declined'>>(
    {},
  );
  const [suggested, setSuggested] = useState<SuggestedAccount[]>([]);
  const [suggestedExpanded, setSuggestedExpanded] = useState(false);
  const [suggestedBusy, setSuggestedBusy] = useState<string | null>(null);
  const [suggestedAdded, setSuggestedAdded] = useState<Record<string, boolean>>(
    {},
  );

  const loadSuggested = useCallback(async () => {
    try {
      const list = await chatRepo.suggestAccounts(40);
      setSuggested(list);
    } catch {
      setSuggested([]);
    }
  }, []);

  const hydratePreviews = useCallback(async (list: ChatNotification[]) => {
    const need = list.filter(
      (n) => wantsMediaPreview(n.kind) && !previewsRef.current[n.id],
    );
    if (!need.length) return;
    const entries = await Promise.all(
      need.map(async (n) => {
        const url = await resolveNotifPreview(n);
        return url ? ([n.id, url] as const) : null;
      }),
    );
    const next: Record<string, string> = {};
    for (const e of entries) {
      if (e) next[e[0]] = e[1];
    }
    if (Object.keys(next).length) {
      setPreviews((prev) => ({ ...prev, ...next }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await initChat();
      const list = await chatRepo.getNotifications();
      if (cancelled) return;
      setItems(list);
      const ids = [...new Set(list.map(actorId).filter(Boolean))];
      const map: Record<string, ChatProfile> = {};
      await Promise.all(
        ids.map(async (id) => {
          const p = await chatRepo.getProfile(id);
          if (p) map[id] = p;
        }),
      );
      if (!cancelled) setProfiles((prev) => ({ ...prev, ...map }));
      if (!cancelled) void hydratePreviews(list);
      await loadSuggested();
    };
    void load();
    const unsub = subscribeChat(() => {
      void load();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [loadSuggested, hydratePreviews]);

  const markOneRead = useCallback(async (n: ChatNotification) => {
    if (n.readAt) return;
    setItems((prev) =>
      prev.map((x) =>
        x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
      ),
    );
    try {
      await chatRepo.markNotificationsRead([n.id]);
    } catch {
      // keep optimistic local read
    }
  }, []);

  const rows = useMemo(() => {
    const byGroup = new Map<string, ChatNotification[]>();
    for (const n of items) {
      const g = groupForKind(n.kind);
      const list = byGroup.get(g.id) ?? [];
      list.push(n);
      byGroup.set(g.id, list);
    }

    const order = [...GROUPS.map((g) => g.id), 'other'];
    const out: ListRow[] = [];

    for (const id of order) {
      const all = byGroup.get(id);
      if (!all?.length) continue;
      all.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const title = GROUPS.find((g) => g.id === id)?.title ?? 'Other';
      const isExpanded = Boolean(expanded[id]);
      const visible = isExpanded ? all : all.slice(0, PREVIEW_COUNT);
      const remaining = all.length - visible.length;

      out.push({
        type: 'header',
        key: `h-${id}`,
        title,
        count: all.length,
      });
      for (const n of visible) {
        out.push({ type: 'item', key: n.id, notif: n });
      }
      if (all.length > PREVIEW_COUNT) {
        out.push({
          type: 'more',
          key: `m-${id}`,
          groupId: id,
          remaining: isExpanded ? 0 : remaining,
          expanded: isExpanded,
        });
      }
    }
    return out;
  }, [items, expanded]);

  const onTap = (n: ChatNotification) => {
    void markOneRead(n);
    const d = (n.data ?? {}) as Record<string, unknown>;
    if (n.kind === 'dm_message') {
      const uid = actorId(n);
      const threadId = dataStr(d, 'threadId', 'thread_id');
      if (uid) onNavigate({ type: 'dm', userId: uid, threadId });
      return;
    }
    if (n.kind === 'channel_message') {
      const channelId = dataStr(d, 'channelId', 'channel_id');
      const communityId = dataStr(d, 'communityId', 'community_id');
      const slug = dataStr(d, 'channelSlug', 'channel_slug') || undefined;
      if (channelId && communityId) {
        onNavigate({ type: 'channel', channelId, communityId, slug });
      }
      return;
    }
    if (n.kind === 'post_tagged' || n.kind === 'post_stamped') {
      const postId = dataStr(d, 'postId', 'post_id');
      if (postId) onNavigate({ type: 'post', postId });
      return;
    }
    if (
      n.kind === 'friend_added' ||
      n.kind === 'friend_nearby'
    ) {
      const uid = actorId(n);
      if (uid) onNavigate({ type: 'profile', userId: uid });
      return;
    }
    if (
      n.kind === 'album_followed' ||
      n.kind === 'album_photos_uploaded' ||
      n.kind === 'trip_invite' ||
      n.kind === 'trip_invite_reminder' ||
      n.kind === 'trip_created' ||
      n.kind === 'trip_confirmed' ||
      n.kind === 'trip_countdown' ||
      n.kind === 'trip_invite_accepted' ||
      n.kind === 'trip_invite_declined' ||
      n.kind === 'trip_join_accepted' ||
      n.kind === 'trip_join_declined' ||
      n.kind === 'trip_join_request'
    ) {
      const tripId = dataStr(d, 'tripId', 'trip_id');
      if (!tripId) return;
      if (n.kind === 'album_followed' || n.kind === 'album_photos_uploaded') {
        onNavigate({ type: 'album', tripId });
      } else {
        onNavigate({ type: 'trip', tripId });
      }
    }
  };

  const respondInvite = async (n: ChatNotification, accept: boolean) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    const inviteId = dataStr(d, 'inviteId', 'invite_id');
    if (!inviteId) {
      Alert.alert(
        'Invite unavailable',
        'Open the trip to view details, or ask the host to send a new invite.',
      );
      return;
    }
    setBusyId(n.id);
    try {
      await chatRepo.respondTripInvite(inviteId, accept);
      setResolved((r) => ({
        ...r,
        [n.id]: accept ? 'accepted' : 'declined',
      }));
      if (accept) {
        const tripId = dataStr(d, 'tripId', 'trip_id');
        if (tripId) onNavigate({ type: 'trip', tripId });
      }
    } catch (e: any) {
      Alert.alert(
        accept ? 'Couldn’t accept' : 'Couldn’t decline',
        e?.message ?? 'Try again',
      );
    } finally {
      setBusyId(null);
    }
  };

  const respondJoin = async (n: ChatNotification, accept: boolean) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    const requestId = dataStr(d, 'requestId', 'request_id');
    if (!requestId) {
      Alert.alert(
        'Request unavailable',
        'Open the trip album to manage join requests.',
      );
      return;
    }
    setBusyId(n.id);
    try {
      await chatRepo.respondTripJoinRequest(requestId, accept);
      setResolved((r) => ({
        ...r,
        [n.id]: accept ? 'accepted' : 'declined',
      }));
    } catch (e: any) {
      Alert.alert(
        accept ? 'Couldn’t accept' : 'Couldn’t decline',
        e?.message ?? 'Try again',
      );
    } finally {
      setBusyId(null);
    }
  };

  const visibleSuggested = suggestedExpanded
    ? suggested
    : suggested.slice(0, SUGGESTED_PREVIEW);

  const onAddSuggested = async (userId: string) => {
    if (suggestedBusy) return;
    setSuggestedBusy(userId);
    setSuggestedAdded((prev) => ({ ...prev, [userId]: true }));
    try {
      await chatRepo.addFriend(userId);
      await loadSuggested();
    } catch (e: any) {
      setSuggestedAdded((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      Alert.alert('Couldn’t add friend', e?.message ?? 'Try again.');
    } finally {
      setSuggestedBusy(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.black} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          suggested.length > 0 ? (
            <View style={styles.suggestedBlock}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Suggested accounts</Text>
              </View>
              {visibleSuggested.map((s) => {
                const p = s.profile;
                const added = Boolean(suggestedAdded[p.id]);
                return (
                  <View key={p.id} style={styles.suggestRow}>
                    <Pressable
                      style={styles.suggestMain}
                      onPress={() =>
                        onNavigate({ type: 'profile', userId: p.id })
                      }
                    >
                      <Avatar
                        source={p.avatar}
                        name={p.fullName}
                        size={44}
                      />
                      <View style={styles.suggestMeta}>
                        <Text style={styles.suggestName} numberOfLines={1}>
                          {p.fullName}
                        </Text>
                        <Text style={styles.suggestSchools} numberOfLines={1}>
                          {[s.homeUniversity, s.studyAbroadProgram]
                            .filter(Boolean)
                            .join(' → ')}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.suggestAdd,
                        added && styles.suggestAddOn,
                      ]}
                      disabled={added || suggestedBusy === p.id}
                      onPress={() => void onAddSuggested(p.id)}
                    >
                      <Text
                        style={[
                          styles.suggestAddText,
                          added && styles.suggestAddTextOn,
                        ]}
                      >
                        {added ? 'Added' : 'Add friend'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              {suggested.length > SUGGESTED_PREVIEW ? (
                <Pressable
                  style={styles.moreRow}
                  onPress={() => setSuggestedExpanded((v) => !v)}
                >
                  <Text style={styles.moreText}>
                    {suggestedExpanded ? 'See less' : 'See more'}
                  </Text>
                  <Ionicons
                    name={suggestedExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.openJoin}
                  />
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          suggested.length > 0 ? null : (
            <Text style={styles.empty}>You’re all caught up.</Text>
          )
        }
        renderItem={({ item: row }) => {
          if (row.type === 'header') {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{row.title}</Text>
                <Text style={styles.sectionCount}>{row.count}</Text>
              </View>
            );
          }
          if (row.type === 'more') {
            return (
              <Pressable
                style={styles.moreRow}
                onPress={() =>
                  setExpanded((e) => ({
                    ...e,
                    [row.groupId]: !row.expanded,
                  }))
                }
              >
                <Text style={styles.moreText}>
                  {row.expanded
                    ? 'Show less'
                    : `See ${row.remaining} more`}
                </Text>
                <Ionicons
                  name={row.expanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.openJoin}
                />
              </Pressable>
            );
          }

          const item = row.notif;
          const fromId = actorId(item);
          const profile = fromId ? profiles[fromId] : null;
          const unread = !item.readAt;
          const status = resolved[item.id];
          const previewUrl = previews[item.id];
          const showInviteActions =
            (item.kind === 'trip_invite' ||
              item.kind === 'trip_invite_reminder') &&
            !status;
          const showJoinActions =
            item.kind === 'trip_join_request' && !status;
          const busy = busyId === item.id;

          return (
            <Pressable
              style={[styles.row, unread && styles.rowUnread]}
              onPress={() => onTap(item)}
            >
              <Avatar source={profile?.avatar} size={44} />
              <View style={styles.body}>
                <Text
                  style={[styles.rowTitle, unread && styles.rowTitleUnread]}
                >
                  {item.title}
                </Text>
                {item.body ? (
                  <Text
                    style={[styles.rowBody, unread && styles.rowBodyUnread]}
                    numberOfLines={2}
                  >
                    {item.body}
                  </Text>
                ) : null}
                <Text style={styles.ago}>{timeAgo(item.createdAt)}</Text>
                {status ? (
                  <Text style={styles.statusNote}>
                    {status === 'accepted' ? 'Accepted' : 'Declined'}
                  </Text>
                ) : null}
                {showInviteActions || showJoinActions ? (
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.actionBtn, styles.declineBtn]}
                      disabled={busy}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        void markOneRead(item);
                        void (showInviteActions
                          ? respondInvite(item, false)
                          : respondJoin(item, false));
                      }}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={colors.textMuted} />
                      ) : (
                        <Text style={styles.declineText}>Decline</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.acceptBtn]}
                      disabled={busy}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        void markOneRead(item);
                        void (showInviteActions
                          ? respondInvite(item, true)
                          : respondJoin(item, true));
                      }}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.acceptText}>Accept</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {previewUrl ? (
                <Image
                  source={toImageSource(previewUrl)}
                  style={styles.previewThumb}
                />
              ) : unread && !status ? (
                <View style={styles.dot} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  back: { width: 40, alignItems: 'center' },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.black,
  },
  empty: {
    textAlign: 'center',
    marginTop: 48,
    color: colors.textMuted,
    fontFamily: fonts.regular,
  },
  suggestedBlock: {
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  suggestMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  suggestMeta: { flex: 1, minWidth: 0 },
  suggestName: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.black,
  },
  suggestSchools: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  suggestAdd: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.brandTeal,
  },
  suggestAddOn: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  suggestAddText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
  },
  suggestAddTextOn: {
    color: colors.black,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    backgroundColor: colors.white,
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.black,
  },
  sectionCount: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  moreText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.openJoin,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowUnread: { backgroundColor: 'rgba(23,88,100,0.06)' },
  body: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.black,
  },
  rowTitleUnread: {
    fontFamily: fonts.extraBold,
  },
  rowBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#444',
    marginTop: 2,
  },
  rowBodyUnread: {
    fontFamily: fonts.bold,
    color: colors.black,
  },
  ago: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  previewThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.divider,
  },
  statusNote: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.openJoin,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    minWidth: 88,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  declineBtn: {
    backgroundColor: '#F2F2F2',
  },
  acceptBtn: {
    backgroundColor: colors.brandTeal,
  },
  declineText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.black,
  },
  acceptText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#fff',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.openJoin,
    marginTop: 6,
  },
});
