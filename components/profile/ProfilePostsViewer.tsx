import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile, FeedPost } from '../../data/chatTypes';
import {
  chatRepo,
  isOwnSender,
  subscribeChat,
} from '../../lib/chat/repository';
import { SwipeBackScreen } from '../../lib/gestures/useEdgeSwipeBack';
import { usePhoneTopPad } from '../../lib/layout/safeArea';
import { FeedPostCard } from '../home/FeedPostCard';
import { SharePostSheet } from '../home/SharePostSheet';
import { StampersSheet } from '../home/StampersSheet';

interface ProfilePostsViewerProps {
  posts: FeedPost[];
  initialIndex: number;
  authorName: string;
  profiles: Record<string, ChatProfile>;
  meId?: string | null;
  onClose: () => void;
  onOpenProfile?: (user: ChatProfile) => void;
  onOpenLocation?: (post: FeedPost) => void;
  onOpenTaggedTrip?: (tripId: string) => void;
  onPostsChange?: (posts: FeedPost[]) => void;
  onEditPost?: (postId: string) => void;
}

/** Instagram-style vertical scroll of full feed posts from a profile grid. */
export function ProfilePostsViewer({
  posts: initialPosts,
  initialIndex,
  authorName,
  profiles,
  meId = null,
  onClose,
  onOpenProfile,
  onOpenLocation,
  onOpenTaggedTrip,
  onPostsChange,
  onEditPost,
}: ProfilePostsViewerProps) {
  const topPad = usePhoneTopPad(4);
  const listRef = useRef<FlatList<FeedPost>>(null);
  const [posts, setPosts] = useState(initialPosts);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);
  const [stampersPostId, setStampersPostId] = useState<string | null>(null);
  const [titleIndex, setTitleIndex] = useState(initialIndex);

  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

  useEffect(() => {
    return subscribeChat(() => {
      // Keep stamps in sync if toggled elsewhere
    });
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setTitleIndex(first.index);
    },
  ).current;

  const toggleStamp = useCallback(
    async (post: FeedPost) => {
      const updated = await chatRepo.togglePostStamp(post.id);
      if (!updated) return;
      setPosts((prev) => {
        const next = prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p));
        onPostsChange?.(next);
        return next;
      });
    },
    [onPostsChange],
  );

  const onDeletePost = useCallback(
    async (post: FeedPost) => {
      try {
        await chatRepo.deletePost(post.id);
        setPosts((prev) => {
          const next = prev.filter((p) => p.id !== post.id);
          onPostsChange?.(next);
          return next;
        });
      } catch (e: any) {
        Alert.alert('Couldn’t delete', e?.message ?? 'Please try again.');
      }
    },
    [onPostsChange],
  );

  return (
    <SwipeBackScreen onClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={28} color={colors.black} />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{authorName}</Text>
            <Text style={styles.sub}>
              Posts · {titleIndex + 1} of {posts.length}
            </Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        <FlatList
          ref={listRef}
          data={posts}
          keyExtractor={(p) => p.id}
          onLayout={() => {
            if (initialIndex > 0) {
              requestAnimationFrame(() => {
                listRef.current?.scrollToIndex({
                  index: Math.min(initialIndex, posts.length - 1),
                  animated: false,
                });
              });
            }
          }}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({
                index: info.index,
                animated: false,
              });
            }, 120);
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 55 }}
          renderItem={({ item }) => {
            const author = profiles[item.authorId] ?? null;
            const stampers = (item.stamperPreviewIds ?? [])
              .map((id) => profiles[id])
              .filter(Boolean) as ChatProfile[];
            return (
              <View style={styles.cardWrap}>
                <FeedPostCard
                  post={item}
                  author={author}
                  stampers={stampers}
                  onOpenProfile={onOpenProfile}
                  onOpenStampers={(p) => setStampersPostId(p.id)}
                  onToggleStamp={toggleStamp}
                  onShare={(p) => setSharePost(p)}
                  onOpenLocation={onOpenLocation}
                  onOpenTaggedTrip={onOpenTaggedTrip}
                  isOwnPost={Boolean(meId && isOwnSender(item.authorId, meId))}
                  onEditPost={(p) => onEditPost?.(p.id)}
                  onDeletePost={onDeletePost}
                />
              </View>
            );
          }}
        />

        <SharePostSheet
          post={sharePost}
          visible={Boolean(sharePost)}
          onClose={() => setSharePost(null)}
          onShared={() => setSharePost(null)}
        />

        <StampersSheet
          visible={Boolean(stampersPostId)}
          postId={stampersPostId}
          onClose={() => setStampersPostId(null)}
          onOpenProfile={(u) => {
            setStampersPostId(null);
            onOpenProfile?.(u);
          }}
        />
      </View>
    </SwipeBackScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    backgroundColor: colors.white,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DBDBDB',
    backgroundColor: colors.white,
  },
  iconBtn: { width: 40, alignItems: 'center' },
  titleBlock: { flex: 1, alignItems: 'center' },
  title: { fontFamily: fonts.extraBold, fontSize: 15 },
  sub: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  cardWrap: { paddingBottom: 20 },
});
