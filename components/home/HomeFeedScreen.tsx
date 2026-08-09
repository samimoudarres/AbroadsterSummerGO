import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { colors, fonts } from '../../constants/theme';
import type {
  ChatProfile,
  FeedAlbumCard,
  FeedPost,
} from '../../data/chatTypes';
import {
  chatRepo,
  DEMO_ME_ID,
  initChat,
  isOwnSender,
  subscribeChat,
} from '../../lib/chat/repository';
import {
  ABROADSTER_HEADER_ICON,
  AbroadsterTopBar,
} from '../common/AbroadsterTopBar';
import { FeedAlbumRail } from './FeedAlbumRail';
import { FeedPostCard } from './FeedPostCard';
import { StampersSheet } from './StampersSheet';
import { BellIcon, CameraIcon } from './HomeIcons';
import { SharePostSheet } from './SharePostSheet';

type FeedRow =
  | { type: 'post'; post: FeedPost; key: string }
  | { type: 'albums'; albums: FeedAlbumCard[]; key: string };

interface HomeFeedScreenProps {
  onOpenProfile: (user: ChatProfile) => void;
  onOpenAlbum: (tripId: string) => void;
  onOpenNotifications: () => void;
  onOpenCreatePost: () => void;
  onOpenLocation: (post: FeedPost) => void;
  onSharedToTrip?: (channelId: string) => void;
  focusPostId?: string | null;
  onConsumedFocusPost?: () => void;
  /** Bump to force feed reload after creating a post */
  feedNonce?: number;
  onOpenTaggedTrip?: (tripId: string) => void;
  onEditPost?: (postId: string) => void;
}

export function HomeFeedScreen({
  onOpenProfile,
  onOpenAlbum,
  onOpenNotifications,
  onOpenCreatePost,
  onOpenLocation,
  onSharedToTrip,
  focusPostId = null,
  onConsumedFocusPost,
  feedNonce = 0,
  onOpenTaggedTrip,
  onEditPost,
}: HomeFeedScreenProps) {
  const listRef = useRef<FlatList<FeedRow>>(null);
  const [meId, setMeId] = useState(DEMO_ME_ID);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [albums, setAlbums] = useState<FeedAlbumCard[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /** False until first feed load finishes — avoids empty-state flash on tab switch. */
  const [feedReady, setFeedReady] = useState(false);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);
  const [stampersPostId, setStampersPostId] = useState<string | null>(null);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);

  const loadProfiles = useCallback(async (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))];
    const map: Record<string, ChatProfile> = {};
    await Promise.all(
      unique.map(async (id) => {
        const p = await chatRepo.getProfile(id);
        if (p) map[id] = p;
      }),
    );
    setProfiles((prev) => ({ ...prev, ...map }));
  }, []);

  const refresh = useCallback(async () => {
    await initChat();
    const me = await chatRepo.getMe();
    setMeId(me.id);
    try {
      const [feed, albumCards, count] = await Promise.all([
        chatRepo.listHomeFeed(40, 0),
        chatRepo.listFeedAlbums(24),
        chatRepo.getUnreadNotificationCount(),
      ]);
      setPosts(feed);
      setAlbums(albumCards);
      setUnread(count);
      const ids = [
        ...feed.flatMap((p) => [p.authorId, ...(p.stamperPreviewIds ?? [])]),
        ...albumCards.flatMap((a) => [a.ownerId, ...a.memberIds]),
      ];
      await loadProfiles(ids);
    } finally {
      setFeedReady(true);
    }
  }, [loadProfiles]);

  useEffect(() => {
    void refresh();
    const unsub = subscribeChat(() => {
      void refresh();
    });
    return () => {
      unsub();
    };
  }, [refresh]);

  useEffect(() => {
    if (feedNonce > 0) void refresh();
  }, [feedNonce, refresh]);

  const rows = useMemo(() => {
    const out: FeedRow[] = [];
    let albumRail = 0;
    posts.forEach((post, i) => {
      out.push({ type: 'post', post, key: `post-${post.id}` });
      if ((i + 1) % 5 === 0 && albums.length > 0) {
        const start = (albumRail * 6) % albums.length;
        const slice: FeedAlbumCard[] = [];
        const n = Math.min(6, albums.length);
        for (let j = 0; j < n; j++) {
          slice.push(albums[(start + j) % albums.length]);
        }
        out.push({
          type: 'albums',
          albums: slice,
          key: `albums-${albumRail}`,
        });
        albumRail += 1;
      }
    });
    return out;
  }, [posts, albums]);

  useEffect(() => {
    if (!focusPostId || !rows.length) return;
    const index = rows.findIndex(
      (r) => r.type === 'post' && r.post.id === focusPostId,
    );
    if (index < 0) {
      onConsumedFocusPost?.();
      return;
    }
    setHighlightPostId(focusPostId);
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.08,
        });
      } catch {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
      onConsumedFocusPost?.();
    }, 120);
    const clearHl = setTimeout(() => setHighlightPostId(null), 2200);
    return () => {
      clearTimeout(t);
      clearTimeout(clearHl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPostId, rows]);

  const onDeletePost = async (post: FeedPost) => {
    try {
      await chatRepo.deletePost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (e: any) {
      Alert.alert('Couldn’t delete', e?.message ?? 'Please try again.');
    }
  };

  const onToggleStamp = async (post: FeedPost) => {
    const wasStamped = post.iStamped;
    const optimisticIds = wasStamped
      ? (post.stamperPreviewIds ?? []).filter((id) => !isOwnSender(id, meId))
      : [
          meId,
          ...(post.stamperPreviewIds ?? []).filter((id) => !isOwnSender(id, meId)),
        ].slice(0, 6);
    const optimistic: FeedPost = {
      ...post,
      iStamped: !wasStamped,
      stampCount: wasStamped
        ? Math.max(0, post.stampCount - 1)
        : post.stampCount + 1,
      stamperPreviewIds: optimisticIds,
    };
    setPosts((prev) => prev.map((p) => (p.id === post.id ? optimistic : p)));
    try {
      const updated = await chatRepo.togglePostStamp(post.id);
      if (updated) {
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? updated : p)),
        );
        await loadProfiles(updated.stamperPreviewIds ?? []);
      }
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
    }
  };

  /** Left-edge swipe right opens create post (Instagram camera drawer). */
  const edgeOpen = Gesture.Pan()
    .activeOffsetX(24)
    .failOffsetY([-20, 20])
    .onEnd((e) => {
      'worklet';
      if (e.translationX > 60 && e.x < 48) {
        runOnJS(onOpenCreatePost)();
      }
    });

  return (
    <GestureDetector gesture={edgeOpen}>
    <View style={styles.root}>
      <StatusBar style="light" />
      <AbroadsterTopBar
        left={
          <Pressable
            onPress={onOpenCreatePost}
            hitSlop={12}
            style={styles.iconBtn}
            accessibilityLabel="Create post"
          >
            <CameraIcon size={24} color={ABROADSTER_HEADER_ICON} />
          </Pressable>
        }
        right={
          <Pressable
            onPress={onOpenNotifications}
            hitSlop={12}
            style={styles.iconBtn}
            accessibilityLabel="Notifications"
          >
            <BellIcon size={28} color={ABROADSTER_HEADER_ICON} />
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unread > 9 ? '9+' : String(unread)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        }
      />

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item) => item.key}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index: info.index,
              animated: true,
              viewPosition: 0.08,
            });
          }, 250);
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
            tintColor={colors.openJoin}
          />
        }
        contentContainerStyle={{ paddingBottom: 120 }}
        renderItem={({ item }) => {
          if (item.type === 'albums') {
            return (
              <FeedAlbumRail
                albums={item.albums}
                profiles={profiles}
                onOpenAlbum={onOpenAlbum}
              />
            );
          }
          const post = item.post;
          const stampers = (post.stamperPreviewIds ?? [])
            .filter((id) => !isOwnSender(id, meId))
            .map((id) => profiles[id])
            .filter(Boolean) as ChatProfile[];
          return (
            <View
              style={
                highlightPostId === post.id ? styles.highlightWrap : undefined
              }
            >
              <FeedPostCard
                post={post}
                author={profiles[post.authorId] ?? null}
                stampers={stampers}
                onOpenProfile={onOpenProfile}
                onOpenStampers={(p) => setStampersPostId(p.id)}
                onToggleStamp={onToggleStamp}
                onShare={setSharePost}
                onOpenLocation={onOpenLocation}
                onOpenTaggedTrip={onOpenTaggedTrip}
                isOwnPost={isOwnSender(post.authorId, meId)}
                onEditPost={(p) => onEditPost?.(p.id)}
                onDeletePost={onDeletePost}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          !feedReady ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.openJoin} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                No posts yet — pull to refresh.
              </Text>
            </View>
          )
        }
      />

      <SharePostSheet
        post={sharePost}
        visible={!!sharePost}
        onClose={() => setSharePost(null)}
        onShared={(target) => {
          setSharePost(null);
          if (target?.type === 'trip_channel' && onSharedToTrip) {
            onSharedToTrip(target.channelId);
          }
        }}
      />

      <StampersSheet
        visible={Boolean(stampersPostId)}
        postId={stampersPostId}
        onClose={() => setStampersPostId(null)}
        onOpenProfile={onOpenProfile}
      />
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brandCream },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brandCoral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontFamily: fonts.bold,
  },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontFamily: fonts.regular },
  highlightWrap: {
    borderWidth: 2,
    borderColor: colors.openJoin,
    backgroundColor: 'rgba(23,88,100,0.08)',
  },
});
