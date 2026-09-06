import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/theme';
import type {
  ChannelSlug,
  ChatCommunity,
  ChatMessage,
  ChatProfile,
  ChatTarget,
  ChatTrip,
  FeedPost,
  PollData,
} from '../../data/chatTypes';
import {
  chatRepo,
  initChat,
  subscribeChat,
  subscribeMessages,
  DEMO_ME_ID,
} from '../../lib/chat/repository';

const MESSAGE_PAGE = 50;
import {
  getLastChatSession,
  hydrateLastChatSession,
  setLastChatSession,
} from '../../lib/chat/lastChatSession';
import { resolveSchoolVisual } from '../../lib/schools/catalog';
import { toImageSource } from '../../lib/images';
import { tripChatTitle } from '../../lib/trips/dates';
import { PHONE_SAFE_INSETS } from '../layout/PhoneShell';
import { ChannelSidebar } from './ChannelSidebar';
import { AttachSheet } from './AttachSheet';
import { MembersSheet } from './MembersSheet';
import { MessageBubble } from './MessageBubble';
import { ReactionPicker } from './ReactionPicker';
import { ProfileModal } from '../profile/ProfileModal';
import { Avatar } from '../common/Avatar';
import { getUserById } from '../../data/mockMapData';
import type { UserProfile } from '../../data/types';

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, now)) return { bold: 'Today', rest: ` ${time}` };
  if (sameDay(d, yesterday)) return { bold: 'Yesterday', rest: ` ${time}` };
  return {
    bold: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
    rest: ` ${time}`,
  };
}

interface CommunityScreenProps {
  initialDmUserId?: string | null;
  /** Prefer this thread when opening from a notification (avoids empty duplicate DMs). */
  initialDmThreadId?: string | null;
  onConsumedDmIntent?: () => void;
  initialTripChannelId?: string | null;
  onConsumedTripChannel?: () => void;
  /** Open a school community channel from a notification. */
  initialSchoolChannel?: {
    channelId: string;
    communityId: string;
    slug?: string;
  } | null;
  onConsumedSchoolChannel?: () => void;
  onViewSharedPost?: (postId: string) => void;
  onOpenTaggedTrip?: (tripId: string) => void;
  /** Open the full trip album / trip screen from a trip message card. */
  onOpenTripAlbum?: (tripId: string) => void;
}

export function CommunityScreen({
  initialDmUserId,
  initialDmThreadId,
  onConsumedDmIntent,
  initialTripChannelId,
  onConsumedTripChannel,
  initialSchoolChannel,
  onConsumedSchoolChannel,
  onViewSharedPost,
  onOpenTaggedTrip,
  onOpenTripAlbum,
}: CommunityScreenProps) {
  const insets = useSafeAreaInsets();
  const topPad =
    (insets.top > 0 ? insets.top : Platform.OS === 'web' ? PHONE_SAFE_INSETS.top : 12) +
    8;
  const [me, setMe] = useState<ChatProfile | null>(null);
  const [communities, setCommunities] = useState<ChatCommunity[]>([]);
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState<ChannelSlug>('general');
  const [tripChannelId, setTripChannelId] = useState<string | null>(null);
  const [tripChannelTripId, setTripChannelTripId] = useState<string | null>(null);
  const [tripChannelTitle, setTripChannelTitle] = useState<string | null>(null);
  const [dmThreadId, setDmThreadId] = useState<string | null>(null);
  const [dmOtherId, setDmOtherId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [trips, setTrips] = useState<Record<string, ChatTrip>>({});
  const [polls, setPolls] = useState<Record<string, PollData>>({});
  const [posts, setPosts] = useState<Record<string, FeedPost>>({});
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [tripMembers, setTripMembers] = useState<string[] | null>(null);
  const [membersTitle, setMembersTitle] = useState('');
  const [reactMsg, setReactMsg] = useState<ChatMessage | null>(null);
  const [profileUser, setProfileUser] = useState<UserProfile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [channelMuted, setChannelMuted] = useState(false);
  const [muteMenuOpen, setMuteMenuOpen] = useState(false);
  const listRef = useRef<FlatList>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const stickToBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const lastCommsRefreshRef = useRef(0);
  const slide = useSharedValue(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const abroad = communities.find((c) => c.kind === 'abroad');
  const home = communities.find((c) => c.kind === 'home');
  const activeCommunity =
    communities.find((c) => c.id === activeCommunityId) ?? abroad ?? null;

  const target: ChatTarget | null = useMemo(() => {
    if (dmThreadId && dmOtherId) {
      return { type: 'dm', threadId: dmThreadId, otherUserId: dmOtherId };
    }
    if (tripChannelId && tripChannelTripId) {
      return {
        type: 'trip_channel',
        channelId: tripChannelId,
        tripId: tripChannelTripId,
      };
    }
    if (!activeCommunity) return null;
    const channelId = activeCommunity.channelIds[activeSlug as Exclude<ChannelSlug, 'trip'>];
    if (!channelId) return null;
    return {
      type: 'channel',
      channelId,
      communityId: activeCommunity.id,
      slug: activeSlug,
    };
  }, [
    dmThreadId,
    dmOtherId,
    tripChannelId,
    tripChannelTripId,
    activeCommunity,
    activeSlug,
  ]);

  const schoolChannelId =
    target?.type === 'channel' ? target.channelId : null;

  useEffect(() => {
    setMuteMenuOpen(false);
    if (!schoolChannelId) {
      setChannelMuted(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const muted = await chatRepo.isChannelMuted(schoolChannelId);
      if (!cancelled) setChannelMuted(muted);
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolChannelId]);

  const toggleChannelMute = useCallback(async () => {
    if (!schoolChannelId) return;
    setMuteMenuOpen(false);
    try {
      if (channelMuted) {
        await chatRepo.unmuteChannel(schoolChannelId);
        setChannelMuted(false);
      } else {
        await chatRepo.muteChannel(schoolChannelId);
        setChannelMuted(true);
      }
    } catch (e: any) {
      Alert.alert('Couldn’t update', e?.message ?? 'Try again');
    }
  }, [schoolChannelId, channelMuted]);

  const hydrateMessageExtras = useCallback(async (msgs: ChatMessage[]) => {
    const profileAdds: Record<string, ChatProfile> = {};
    const tripAdds: Record<string, ChatTrip> = {};
    const pollAdds: Record<string, PollData> = {};
    const postAdds: Record<string, FeedPost> = {};

    for (const m of msgs) {
      if (m.senderId && !profileAdds[m.senderId]) {
        const p = await chatRepo.getProfile(m.senderId);
        if (p) profileAdds[m.senderId] = p;
      }
      const tripKey =
        m.tripId ||
        (typeof m.metadata?.tripId === 'string' ? m.metadata.tripId : null);
      if (tripKey && !tripAdds[tripKey]) {
        const t = await chatRepo.getTrip(tripKey);
        if (t) tripAdds[tripKey] = t;
      }
      if (m.pollId && !pollAdds[m.pollId]) {
        const p = await chatRepo.getPoll(m.pollId);
        if (p) pollAdds[m.pollId] = p;
      }
      if (m.postId) {
        const loaded = await chatRepo.getPost(m.postId);
        if (loaded) {
          postAdds[m.postId] = loaded;
          if (loaded.authorId && !profileAdds[loaded.authorId]) {
            const ap = await chatRepo.getProfile(loaded.authorId);
            if (ap) profileAdds[loaded.authorId] = ap;
          }
        }
      } else if (
        m.kind === 'post' &&
        typeof m.metadata?.authorId === 'string' &&
        !profileAdds[m.metadata.authorId]
      ) {
        const ap = await chatRepo.getProfile(m.metadata.authorId);
        if (ap) profileAdds[m.metadata.authorId] = ap;
      }
    }

    // Functional updates so we never wipe profiles loaded for the open DM
    setProfiles((prev) => ({ ...prev, ...profileAdds }));
    setTrips((prev) => ({ ...prev, ...tripAdds }));
    setPolls((prev) => ({ ...prev, ...pollAdds }));
    setPosts((prev) => ({ ...prev, ...postAdds }));
  }, []);

  const refreshMessages = useCallback(
    async (mode: 'replace' | 'poll' | 'older' = 'replace') => {
      if (!target) return;
      let msgs: ChatMessage[];
      if (mode === 'older') {
        const before = messagesRef.current[0]?.createdAt;
        if (!before || loadingOlderRef.current) return;
        loadingOlderRef.current = true;
        setLoadingOlder(true);
        try {
          const older = await chatRepo.getMessages(target, {
            limit: MESSAGE_PAGE,
            before,
          });
          if (older.length < MESSAGE_PAGE) setHasMoreOlder(false);
          const existing = new Set(messagesRef.current.map((m) => m.id));
          msgs = [
            ...older.filter((m) => !existing.has(m.id)),
            ...messagesRef.current,
          ];
          stickToBottomRef.current = false;
        } finally {
          loadingOlderRef.current = false;
          setLoadingOlder(false);
        }
      } else if (mode === 'poll') {
        const newest = await chatRepo.getMessages(target, {
          limit: MESSAGE_PAGE,
        });
        const byId = new Map(messagesRef.current.map((m) => [m.id, m]));
        const prevLen = byId.size;
        for (const m of newest) byId.set(m.id, m);
        // Drop optimistic local bubbles once the real row is visible
        for (const [id, local] of [...byId.entries()]) {
          if (!id.startsWith('local-')) continue;
          const hasReal = [...byId.values()].some(
            (m) =>
              !m.id.startsWith('local-') &&
              m.senderId === local.senderId &&
              m.kind === local.kind &&
              (m.body ?? '') === (local.body ?? '') &&
              (m.imageUrl ?? null) === (local.imageUrl ?? null),
          );
          if (hasReal) byId.delete(id);
        }
        msgs = Array.from(byId.values()).sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        if (byId.size > prevLen && stickToBottomRef.current) {
          requestAnimationFrame(() =>
            listRef.current?.scrollToEnd({ animated: true }),
          );
        }
      } else {
        stickToBottomRef.current = true;
        msgs = await chatRepo.getMessages(target, { limit: MESSAGE_PAGE });
        setHasMoreOlder(msgs.length >= MESSAGE_PAGE);
      }
      setMessages(msgs);
      messagesRef.current = msgs;
      await hydrateMessageExtras(msgs);
    },
    [target, hydrateMessageExtras],
  );

  const refreshMessagesRef = useRef(refreshMessages);
  refreshMessagesRef.current = refreshMessages;

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      await initChat();
      await hydrateLastChatSession();
      const meProfile = await chatRepo.getMe();
      let comms = await chatRepo.getMyCommunities();
      // Profile has schools but memberships lagging — one automatic retry
      if (
        !comms.length &&
        (meProfile.homeUniversity?.trim() ||
          meProfile.studyAbroadProgram?.trim())
      ) {
        await new Promise((r) => setTimeout(r, 400));
        comms = await chatRepo.getMyCommunities();
      }
      setMe(meProfile);
      setCommunities(comms);
      lastCommsRefreshRef.current = Date.now();

      const last = getLastChatSession();
      if (last?.type === 'dm') {
        setDmThreadId(last.threadId);
        setDmOtherId(last.otherUserId);
        setTripChannelId(null);
        setTripChannelTripId(null);
        setTripChannelTitle(null);
        const abroadComm = comms.find((c) => c.kind === 'abroad') ?? comms[0];
        setActiveCommunityId(abroadComm?.id ?? null);
        void chatRepo.getProfile(last.otherUserId).then((p) => {
          if (p) setProfiles((m) => ({ ...m, [last.otherUserId]: p }));
        });
      } else if (last?.type === 'trip') {
        setDmThreadId(null);
        setDmOtherId(null);
        setTripChannelId(last.channelId);
        setTripChannelTripId(last.tripId);
        setTripChannelTitle(last.title);
        const abroadComm = comms.find((c) => c.kind === 'abroad') ?? comms[0];
        setActiveCommunityId(abroadComm?.id ?? null);
      } else if (last?.type === 'community') {
        setDmThreadId(null);
        setDmOtherId(null);
        setTripChannelId(null);
        setTripChannelTripId(null);
        setTripChannelTitle(null);
        setActiveCommunityId(last.communityId);
        setActiveSlug(last.slug);
      } else {
        const first = comms.find((c) => c.kind === 'abroad') ?? comms[0];
        setActiveCommunityId(first?.id ?? null);
      }

      unsub = subscribeChat(() => {
        void refreshMessagesRef.current('poll');
        // Throttled school-pill refresh — never on every message tick
        const now = Date.now();
        if (now - lastCommsRefreshRef.current < 12_000) return;
        lastCommsRefreshRef.current = now;
        void (async () => {
          const nextMe = await chatRepo.getMe();
          const nextComms = await chatRepo.getMyCommunities();
          setMe(nextMe);
          setCommunities(nextComms);
        })();
      });
    })();
    return () => unsub();
  }, []);

  useEffect(() => {
    void refreshMessages('replace');
  }, [refreshMessages]);

  // Live thread: realtime + light poll while app is foregrounded
  useEffect(() => {
    if (!target) return;
    const unsubRt = subscribeMessages(target, () => {
      void refreshMessagesRef.current('poll');
    });
    const pollId = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      void refreshMessagesRef.current('poll');
    }, 4000);
    return () => {
      unsubRt();
      clearInterval(pollId);
    };
  }, [target]);

  useEffect(() => {
    if (!initialDmUserId) return;
    (async () => {
      try {
        const thread = await chatRepo.openDm(initialDmUserId, {
          requireFriend: false,
          threadId: initialDmThreadId,
        });
        setDmThreadId(thread.id);
        setDmOtherId(initialDmUserId);
        setTripChannelId(null);
        setTripChannelTripId(null);
        setTripChannelTitle(null);
        setSidebarOpen(false);
        setLastChatSession({
          type: 'dm',
          threadId: thread.id,
          otherUserId: initialDmUserId,
        });
        const p = await chatRepo.getProfile(initialDmUserId);
        if (p) setProfiles((m) => ({ ...m, [initialDmUserId]: p }));
      } catch (e: any) {
        Alert.alert(
          'Can’t message yet',
          e?.message ?? 'Add them as a friend to send a message.',
        );
      } finally {
        onConsumedDmIntent?.();
      }
    })();
  }, [initialDmUserId, initialDmThreadId, onConsumedDmIntent]);

  useEffect(() => {
    if (!initialTripChannelId) return;
    (async () => {
      const channels = await chatRepo.listMyTripChannels();
      const ch = channels.find((c) => c.id === initialTripChannelId);
      if (ch) {
        setDmThreadId(null);
        setDmOtherId(null);
        setTripChannelId(ch.id);
        setTripChannelTripId(ch.tripId);
        const title =
          ch.name || tripChatTitle(ch.destinationCity, ch.destinationCountry);
        setTripChannelTitle(title);
        setSidebarOpen(false);
        setLastChatSession({
          type: 'trip',
          channelId: ch.id,
          tripId: ch.tripId,
          title,
        });
      }
      onConsumedTripChannel?.();
    })();
  }, [initialTripChannelId, onConsumedTripChannel]);

  useEffect(() => {
    if (!initialSchoolChannel) return;
    setDmThreadId(null);
    setDmOtherId(null);
    setTripChannelId(null);
    setTripChannelTripId(null);
    setTripChannelTitle(null);
    setActiveCommunityId(initialSchoolChannel.communityId);
    const slug = (initialSchoolChannel.slug || 'general') as ChannelSlug;
    setActiveSlug(slug);
    setSidebarOpen(false);
    setLastChatSession({
      type: 'community',
      communityId: initialSchoolChannel.communityId,
      slug: slug === 'trip' ? 'general' : slug,
    });
    onConsumedSchoolChannel?.();
  }, [initialSchoolChannel, onConsumedSchoolChannel]);

  const switchSchool = (communityId: string) => {
    setDmThreadId(null);
    setDmOtherId(null);
    setTripChannelId(null);
    setTripChannelTripId(null);
    setTripChannelTitle(null);
    setActiveSlug('general');
    setActiveCommunityId(communityId);
    setLastChatSession({
      type: 'community',
      communityId,
      slug: 'general',
    });
    // withSequence avoids nested withTiming callbacks (stack overflow on web)
    slide.value = withSequence(
      withTiming(1, { duration: 160 }),
      withTiming(0, { duration: 160 }),
    );
  };

  const slideStyle = useAnimatedStyle(() => ({
    opacity: 1 - slide.value * 0.35,
    transform: [{ translateX: (slide.value - 0) * 24 }],
  }));

  const edgeSwipe = Gesture.Pan()
    .activeOffsetX(20)
    .onEnd((e) => {
      if (e.translationX > 60 && e.x < 40) runOnJS(setSidebarOpen)(true);
    });

  async function sendText() {
    if (!target || !draft.trim()) return;
    const body = draft.trim();
    setDraft('');
    const replyId = replyTo?.id;
    setReplyTo(null);
    try {
      const sent = await chatRepo.sendMessage({
        target,
        kind: 'text',
        body,
        replyToId: replyId,
      });
      if (sent?.id) {
        // Sync ref immediately so a concurrent poll can't wipe the send
        if (!messagesRef.current.some((m) => m.id === sent.id)) {
          messagesRef.current = [...messagesRef.current, sent];
        }
        setMessages(messagesRef.current);
      }
      stickToBottomRef.current = true;
      requestAnimationFrame(() =>
        listRef.current?.scrollToEnd({ animated: true }),
      );
      // Merge/poll — never blind-replace (empty reload was wiping sent messages)
      await refreshMessages('poll');
    } catch (e: any) {
      setDraft(body);
      if (replyId) {
        const prev = messagesRef.current.find((m) => m.id === replyId);
        if (prev) setReplyTo(prev);
      }
      Alert.alert(
        'Couldn’t send',
        e?.message ?? 'Check your connection and try again.',
      );
    }
  }

  async function sendAndKeep(sent: ChatMessage | void | null) {
    if (sent?.id) {
      if (!messagesRef.current.some((m) => m.id === sent.id)) {
        messagesRef.current = [...messagesRef.current, sent];
      }
      setMessages(messagesRef.current);
    }
    stickToBottomRef.current = true;
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: true }),
    );
    await refreshMessages('poll');
  }

  const listData = useMemo(() => {
    const rows: Array<
      | { type: 'sep'; key: string; label: ReturnType<typeof formatDayLabel> }
      | { type: 'msg'; key: string; message: ChatMessage }
    > = [];
    let lastDay = '';
    for (const m of messages) {
      const dayKey = new Date(m.createdAt).toDateString();
      if (dayKey !== lastDay) {
        lastDay = dayKey;
        rows.push({
          type: 'sep',
          key: `sep-${m.id}`,
          label: formatDayLabel(m.createdAt),
        });
      }
      rows.push({ type: 'msg', key: m.id, message: m });
    }
    return rows;
  }, [messages]);

  const dmOther = dmOtherId ? profiles[dmOtherId] : null;
  const dmDisplayName =
    dmOther?.fullName?.trim() ||
    [dmOther?.firstName, dmOther?.lastName].filter(Boolean).join(' ').trim() ||
    null;
  const headerTitle = dmOtherId
    ? dmDisplayName
    : tripChannelTitle
      ? tripChannelTitle
      : activeSlug === 'general'
        ? null
        : `# ${activeSlug.charAt(0).toUpperCase() + activeSlug.slice(1)}`;

  useEffect(() => {
    if (!dmOtherId) return;
    let cancelled = false;
    void chatRepo.getProfile(dmOtherId).then((p) => {
      if (cancelled || !p) return;
      setProfiles((m) => ({ ...m, [dmOtherId]: p }));
    });
    return () => {
      cancelled = true;
    };
  }, [dmOtherId]);

  return (
    <GestureDetector gesture={edgeSwipe}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.header, { paddingTop: topPad }]}>
          <Pressable style={styles.chatBtn} onPress={() => setSidebarOpen(true)}>
            <Ionicons name="chatbubbles" size={22} color={colors.black} />
          </Pressable>
          <View style={styles.pillsTrack}>
            {abroad ? (
              <SchoolPill
                label={abroad.name}
                accent={abroad.accent}
                logo={resolveSchoolVisual({ name: abroad.name }).logoUrl}
                selected={
                  !dmThreadId &&
                  !tripChannelId &&
                  activeCommunityId === abroad.id &&
                  activeSlug === 'general'
                }
                onPress={() => switchSchool(abroad.id)}
                onLongPress={() => {
                  setTripMembers(null);
                  setMembersTitle(abroad.name);
                  setActiveCommunityId(abroad.id);
                  setMembersOpen(true);
                }}
              />
            ) : null}
            {home ? (
              <SchoolPill
                label={home.name}
                accent={home.accent}
                logo={resolveSchoolVisual({ name: home.name }).logoUrl}
                selected={
                  !dmThreadId &&
                  !tripChannelId &&
                  activeCommunityId === home.id &&
                  activeSlug === 'general'
                }
                onPress={() => switchSchool(home.id)}
                onLongPress={() => {
                  setTripMembers(null);
                  setMembersTitle(home.name);
                  setActiveCommunityId(home.id);
                  setMembersOpen(true);
                }}
              />
            ) : null}
          </View>
          {schoolChannelId ? (
            <View style={styles.moreWrap}>
              <Pressable
                style={styles.moreBtn}
                onPress={() => setMuteMenuOpen((v) => !v)}
                hitSlop={8}
                accessibilityLabel="Channel options"
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={22}
                  color={colors.black}
                />
              </Pressable>
              {muteMenuOpen ? (
                <View style={styles.moreMenu}>
                  <Pressable
                    style={styles.moreMenuItem}
                    onPress={() => void toggleChannelMute()}
                  >
                    <Ionicons
                      name={channelMuted ? 'notifications' : 'notifications-off'}
                      size={18}
                      color={colors.programBlue}
                    />
                    <Text style={styles.moreMenuText}>
                      {channelMuted ? 'Unmute channel' : 'Mute channel'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {dmOtherId ? (
          <Pressable
            style={styles.dmHeaderRow}
            onPress={() => {
              const p = profiles[dmOtherId];
              if (!p) return;
              const mapped = getUserById(dmOtherId);
              if (mapped) {
                setProfileUser(mapped);
                setShowProfile(true);
                return;
              }
              setProfileUser({
                id: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                fullName: p.fullName,
                avatar: p.avatar,
                homeUniversity: p.homeUniversity,
                studyAbroadProgram: p.studyAbroadProgram,
                hostCity: p.hostCity || '',
                hostCountry: p.hostCountry || '',
                semester: p.semester || '',
                bio: p.bio ?? undefined,
                countriesVisited: p.countriesVisited ?? 0,
                isFriend: false,
                locationPrivacy: 'city',
                latitude: 48.8566,
                longitude: 2.3522,
                locationLabel: '',
                passportBadges: [],
                albums: [],
                posts: [],
                isVerifiedStudent: p.isVerifiedStudent,
              });
              setShowProfile(true);
            }}
          >
            <Avatar
              source={dmOther?.avatar}
              name={dmDisplayName || dmOther?.firstName || 'User'}
              size={28}
            />
            <Text style={styles.dmHeaderText} numberOfLines={1}>
              Airmail · {dmDisplayName || '…'}
            </Text>
          </Pressable>
        ) : headerTitle ? (
          <Text style={styles.subHeader}>{headerTitle}</Text>
        ) : null}

        {!dmThreadId &&
        !tripChannelId &&
        communities.length === 0 ? (
          <View style={styles.emptySchools}>
            <Text style={styles.emptySchoolsTitle}>
              {me?.homeUniversity?.trim() || me?.studyAbroadProgram?.trim()
                ? 'Connecting to your school chats…'
                : 'No school chats yet'}
            </Text>
            <Text style={styles.emptySchoolsBody}>
              {me?.homeUniversity?.trim() || me?.studyAbroadProgram?.trim()
                ? 'You should see your study abroad and home school chats here. Tap Retry to join them again.'
                : 'Set your home school and study abroad program in Edit profile, then tap Retry.'}
            </Text>
            <Pressable
              style={styles.emptySchoolsBtn}
              onPress={() => {
                void (async () => {
                  const nextMe = await chatRepo.getMe();
                  const next = await chatRepo.getMyCommunities();
                  setMe(nextMe);
                  setCommunities(next);
                  const first =
                    next.find((c) => c.kind === 'abroad') ?? next[0];
                  setActiveCommunityId(first?.id ?? null);
                })();
              }}
            >
              <Text style={styles.emptySchoolsBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <Animated.View style={[styles.thread, slideStyle]}>
          <FlatList
            ref={listRef}
            data={listData}
            keyExtractor={(item) => item.key}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
            onContentSizeChange={() => {
              if (stickToBottomRef.current) {
                listRef.current?.scrollToEnd({ animated: false });
              }
            }}
            ListHeaderComponent={
              hasMoreOlder && messages.length > 0 ? (
                <Pressable
                  style={styles.loadEarlierBtn}
                  disabled={loadingOlder}
                  onPress={() => void refreshMessages('older')}
                >
                  <Text style={styles.loadEarlierText}>
                    {loadingOlder ? 'Loading…' : 'Load earlier messages'}
                  </Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              !dmThreadId && !tripChannelId && communities.length === 0 ? (
                <View />
              ) : (
                <Text style={styles.threadEmpty}>
                  No messages yet — say hello.
                </Text>
              )
            }
            renderItem={({ item, index }) => {
              if (item.type === 'sep') {
                return (
                  <Text style={styles.daySep}>
                    <Text style={styles.dayBold}>{item.label.bold}</Text>
                    {item.label.rest}
                  </Text>
                );
              }
              const m = item.message;
              const prev = listData[index - 1];
              const prevMsg =
                prev && prev.type === 'msg' ? prev.message : null;
              const showAvatar =
                !prevMsg ||
                prevMsg.senderId !== m.senderId ||
                prevMsg.kind === 'system';
              const showName = showAvatar;
              const replyPreview = m.replyToId
                ? messages.find((x) => x.id === m.replyToId)?.body ?? 'Reply'
                : null;
              return (
                <MessageBubble
                  message={m}
                  sender={m.senderId ? profiles[m.senderId] : null}
                  meId={me?.id ?? DEMO_ME_ID}
                  showAvatar={showAvatar}
                  showName={showName}
                  trip={
                    m.tripId
                      ? trips[m.tripId]
                      : typeof m.metadata?.tripId === 'string'
                        ? trips[m.metadata.tripId]
                        : null
                  }
                  poll={m.pollId ? polls[m.pollId] : null}
                  post={m.postId ? posts[m.postId] : null}
                  postAuthor={
                    m.postId && posts[m.postId]
                      ? profiles[posts[m.postId].authorId] ?? null
                      : typeof m.metadata?.authorId === 'string'
                        ? profiles[m.metadata.authorId] ?? null
                        : null
                  }
                  replyPreview={replyPreview}
                  onLongPress={(msg) => setReactMsg(msg)}
                  onReplySwipe={(msg) => setReplyTo(msg)}
                  onTripPeople={(trip) => {
                    const people = [
                      ...new Set([
                        ...trip.memberIds,
                        ...(trip.pendingInviteeIds ?? []),
                      ]),
                    ];
                    setTripMembers(people);
                    setMembersTitle(
                      `${trip.destinationCity} · ${people.length} going`,
                    );
                    setMembersOpen(true);
                  }}
                  onTripRequest={async (trip) => {
                    await chatRepo.requestTripJoin(trip.id);
                    const updated = await chatRepo.getTrip(trip.id);
                    if (updated) {
                      setTrips((t) => ({ ...t, [trip.id]: updated }));
                    }
                  }}
                  onTripCancelRequest={async (trip) => {
                    await chatRepo.cancelTripJoin(trip.id);
                    const updated = await chatRepo.getTrip(trip.id);
                    if (updated) {
                      setTrips((t) => ({ ...t, [trip.id]: updated }));
                    }
                  }}
                  onOpenTrip={(trip) =>
                    (onOpenTripAlbum ?? onOpenTaggedTrip)?.(trip.id)
                  }
                  onVotePoll={async (pollId, optionId) => {
                    await chatRepo.votePoll(pollId, optionId);
                    const p = await chatRepo.getPoll(pollId);
                    if (p) setPolls((x) => ({ ...x, [pollId]: p }));
                  }}
                  onViewPost={(postId) => onViewSharedPost?.(postId)}
                  onOpenTaggedTrip={onOpenTaggedTrip}
                  onAvatarPress={(userId) => {
                    const mapped = getUserById(userId);
                    const p = profiles[userId];
                    if (mapped) {
                      setProfileUser(mapped);
                      setShowProfile(true);
                      return;
                    }
                    if (p) {
                      setProfileUser({
                        id: p.id,
                        firstName: p.firstName,
                        lastName: p.lastName,
                        fullName: p.fullName,
                        avatar: p.avatar,
                        homeUniversity: p.homeUniversity,
                        studyAbroadProgram: p.studyAbroadProgram,
                        hostCity: p.hostCity || '',
                        hostCountry: p.hostCountry || '',
                        semester: p.semester || '',
                        bio: p.bio ?? undefined,
                        countriesVisited: p.countriesVisited ?? 0,
                        isFriend: false,
                        locationPrivacy: 'city',
                        latitude: 48.8566,
                        longitude: 2.3522,
                        locationLabel: '',
                        passportBadges: [],
                        albums: [],
                        posts: [],
                        isVerifiedStudent: p.isVerifiedStudent,
                      });
                      setShowProfile(true);
                    }
                  }}
                />
              );
            }}
          />
        </Animated.View>

        {replyTo ? (
          <View style={styles.replyBar}>
            <Text style={styles.replyBarText} numberOfLines={1}>
              Replying to {profiles[replyTo.senderId ?? '']?.firstName ?? 'message'}:{' '}
              {replyTo.body}
            </Text>
            <Pressable onPress={() => setReplyTo(null)}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.composer}>
          <Pressable style={styles.plus} onPress={() => setAttachOpen(true)}>
            <Ionicons name="add" size={28} color={colors.white} />
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={sendText}
            returnKeyType="send"
            blurOnSubmit
          />
          {draft.trim() ? (
            <Pressable style={styles.sendBtn} onPress={sendText}>
              <Ionicons name="send" size={18} color={colors.programBlue} />
            </Pressable>
          ) : null}
        </View>

        <ChannelSidebar
          open={sidebarOpen}
          communities={communities}
          activeCommunityId={activeCommunityId}
          activeChannelSlug={activeSlug}
          activeTripChannelId={tripChannelId}
          onClose={() => setSidebarOpen(false)}
          onSelectChannel={(communityId, slug) => {
            setDmThreadId(null);
            setDmOtherId(null);
            setTripChannelId(null);
            setTripChannelTripId(null);
            setTripChannelTitle(null);
            setActiveCommunityId(communityId);
            setActiveSlug(slug);
            setSidebarOpen(false);
            setLastChatSession({ type: 'community', communityId, slug });
          }}
          onSelectTripChannel={(ch) => {
            setDmThreadId(null);
            setDmOtherId(null);
            setTripChannelId(ch.id);
            setTripChannelTripId(ch.tripId);
            const title =
              ch.name || tripChatTitle(ch.destinationCity, ch.destinationCountry);
            setTripChannelTitle(title);
            setSidebarOpen(false);
            setLastChatSession({
              type: 'trip',
              channelId: ch.id,
              tripId: ch.tripId,
              title,
            });
          }}
          onOpenDm={async (userId) => {
            try {
              // AirMail search / inbox: allow messaging without being friends first
              // (same as profile AirMail). Friend-gated share sheets still require friends.
              const thread = await chatRepo.openDm(userId, {
                requireFriend: false,
              });
              setDmThreadId(thread.id);
              setDmOtherId(userId);
              setTripChannelId(null);
              setTripChannelTripId(null);
              setTripChannelTitle(null);
              setSidebarOpen(false);
              setLastChatSession({
                type: 'dm',
                threadId: thread.id,
                otherUserId: userId,
              });
              const p = await chatRepo.getProfile(userId);
              if (p) setProfiles((m) => ({ ...m, [userId]: p }));
            } catch (e: any) {
              Alert.alert(
                'Can’t open AirMail',
                e?.message ?? 'Please try again.',
              );
            }
          }}
        />

        <AttachSheet
          visible={attachOpen}
          onClose={() => setAttachOpen(false)}
          onSendImage={async (uri) => {
            if (!target) return;
            try {
              const sent = await chatRepo.sendMessage({
                target,
                kind: 'image',
                imageUrl: uri,
                body: '',
              });
              await sendAndKeep(sent);
            } catch (e: any) {
              Alert.alert(
                'Couldn’t send',
                e?.message ?? 'Check your connection and try again.',
              );
            }
          }}
          onSendTrip={async (tripId) => {
            if (!target) return;
            try {
              const trip = await chatRepo.getTrip(tripId);
              if (trip) {
                setTrips((t) => ({ ...t, [trip.id]: trip }));
              }
              const planner = trip
                ? await chatRepo.getProfile(trip.ownerId)
                : null;
              const sent = await chatRepo.sendMessage({
                target,
                kind: 'trip',
                tripId,
                body: `${planner?.firstName ?? 'Someone'} is planning a trip`,
                metadata: { tripId },
              });
              await sendAndKeep(sent);
            } catch (e: any) {
              Alert.alert(
                'Couldn’t send',
                e?.message ?? 'Check your connection and try again.',
              );
            }
          }}
          onSendPoll={async (question, options) => {
            if (!target) return;
            try {
              const poll = await chatRepo.createPoll(question, options);
              const sent = await chatRepo.sendMessage({
                target,
                kind: 'poll',
                pollId: poll.id,
                body: question,
              });
              await sendAndKeep(sent);
            } catch (e: any) {
              Alert.alert(
                'Couldn’t send',
                e?.message ?? 'Check your connection and try again.',
              );
            }
          }}
        />

        <MembersSheet
          visible={membersOpen}
          title={membersTitle}
          communityId={tripMembers ? null : activeCommunityId}
          memberIds={tripMembers ?? undefined}
          onClose={() => {
            setMembersOpen(false);
            setTripMembers(null);
          }}
          onSelectUser={(user) => {
            setMembersOpen(false);
            const mapped = getUserById(user.id);
            if (mapped) {
              setProfileUser(mapped);
              setShowProfile(true);
            } else {
              setProfileUser({
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                avatar: user.avatar,
                homeUniversity: user.homeUniversity,
                studyAbroadProgram: user.studyAbroadProgram,
                hostCity: '',
                hostCountry: '',
                semester: '',
                countriesVisited: 0,
                isFriend: false,
                locationPrivacy: 'city',
                latitude: 0,
                longitude: 0,
                locationLabel: '',
                passportBadges: [],
                albums: [],
                posts: [],
              });
              setShowProfile(true);
            }
          }}
        />

        <ReactionPicker
          visible={Boolean(reactMsg)}
          onClose={() => setReactMsg(null)}
          onSelect={async (emoji) => {
            if (!reactMsg) return;
            await chatRepo.toggleReaction(reactMsg.id, emoji);
            setReactMsg(null);
            await refreshMessages('poll');
          }}
        />

        <ProfileModal
          visible={showProfile}
          user={profileUser}
          onClose={() => setShowProfile(false)}
          onAirMail={(userId) => {
            setShowProfile(false);
            void (async () => {
              try {
                const thread = await chatRepo.openDm(userId, {
                  requireFriend: false,
                });
                setDmThreadId(thread.id);
                setDmOtherId(userId);
                setTripChannelId(null);
                setTripChannelTripId(null);
                setTripChannelTitle(null);
                setSidebarOpen(false);
                setLastChatSession({
                  type: 'dm',
                  threadId: thread.id,
                  otherUserId: userId,
                });
                const p = await chatRepo.getProfile(userId);
                if (p) setProfiles((m) => ({ ...m, [userId]: p }));
              } catch (e: any) {
                Alert.alert(
                  'Can’t open AirMail',
                  e?.message ?? 'Try again in a moment.',
                );
              }
            })();
          }}
        />
      </KeyboardAvoidingView>
    </GestureDetector>
  );
}

function SchoolPill({
  label,
  accent,
  logo,
  selected,
  onPress,
  onLongPress,
}: {
  label: string;
  accent: string;
  logo?: string | null;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.pill,
        {
          borderColor: selected ? accent : '#9D9D9D',
          shadowColor: selected ? accent : '#9D9D9D',
        },
      ]}
    >
      {logo ? (
        <Image source={toImageSource(logo)} style={styles.pillLogoImg} />
      ) : (
        <View style={[styles.pillLogo, { backgroundColor: accent }]} />
      )}
      <Text style={styles.pillText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brandCream },
  header: {
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreWrap: {
    position: 'relative',
    zIndex: 20,
  },
  moreBtn: {
    width: 40,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreMenu: {
    position: 'absolute',
    top: 48,
    right: 0,
    minWidth: 180,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5E5',
  },
  moreMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  moreMenuText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.black,
  },
  pillsTrack: {
    flex: 1,
    height: 50,
    backgroundColor: '#D9D9D9',
    borderRadius: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 6,
  },
  emptySchools: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
    gap: 8,
  },
  emptySchoolsTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.black,
  },
  emptySchoolsBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  emptySchoolsBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: colors.brandTeal,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptySchoolsBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#fff',
  },
  threadEmpty: {
    textAlign: 'center',
    marginTop: 40,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  loadEarlierBtn: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: '#EFEFEF',
  },
  loadEarlierText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textMuted,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderRadius: 40,
    height: 37,
    paddingHorizontal: 8,
    gap: 6,
    shadowOpacity: 1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    maxWidth: '52%',
  },
  pillLogo: { width: 20, height: 20, borderRadius: 10 },
  pillLogoImg: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
  },
  pillText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.black,
    flexShrink: 1,
  },
  subHeader: {
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
  },
  dmHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 2,
    paddingHorizontal: 16,
  },
  dmHeaderText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.black,
    flexShrink: 1,
  },
  thread: { flex: 1 },
  daySep: {
    alignSelf: 'center',
    fontSize: 12,
    color: colors.textMuted,
    marginVertical: 10,
  },
  dayBold: { fontWeight: '700' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 8,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
  },
  plus: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#C6C7C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 16,
    color: colors.black,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  sendBtn: { padding: 8 },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#F4F4F4',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    gap: 8,
  },
  replyBarText: { flex: 1, fontSize: 13, color: colors.textMuted },
});
