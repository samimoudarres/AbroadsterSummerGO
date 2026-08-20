import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile, FeedPost } from '../../data/chatTypes';
import { feedImageSource } from '../../lib/feed/feedPhotos';
import { getImageAspectSync } from '../../lib/feed/imageAspect';
import { formatPostDate, timeAgo } from '../../lib/feed/timeAgo';
import type { CollageLayoutId } from '../../lib/feed/collageLayouts';
import { DEFAULT_CROP, layoutById } from '../../lib/feed/collageLayouts';
import { Avatar } from '../common/Avatar';
import {
  LocationPinIcon,
  ShareIcon,
  StampIcon,
} from './HomeIcons';
import { StampBurst } from './StampBurst';
import { CollageCanvas } from './create/CollageCanvas';
import { Ionicons } from '@expo/vector-icons';

const SCREEN_H = Dimensions.get('window').height;
/** Cap single-photo / carousel media at ~half the screen so posts aren't wall-tall. */
const MEDIA_H = Math.min(Math.round(SCREEN_H * 0.45), 380);

interface FeedPostCardProps {
  post: FeedPost;
  author: ChatProfile | null;
  /** Other people who stamped (never includes the current user). */
  stampers: ChatProfile[];
  onOpenProfile?: (user: ChatProfile) => void;
  /** Open full list of people who stamped this post. */
  onOpenStampers?: (post: FeedPost) => void;
  onToggleStamp: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  onOpenLocation?: (post: FeedPost) => void;
  /** Open the trip tagged on this post (plane icon). */
  onOpenTaggedTrip?: (tripId: string) => void;
  /** When set, shows ⋯ menu to the right of the location tag. */
  isOwnPost?: boolean;
  onEditPost?: (post: FeedPost) => void;
  onDeletePost?: (post: FeedPost) => void;
}

export function FeedPostCard({
  post,
  author,
  stampers,
  onOpenProfile,
  onOpenStampers,
  onToggleStamp,
  onShare,
  onOpenLocation,
  onOpenTaggedTrip,
  isOwnPost = false,
  onEditPost,
  onDeletePost,
}: FeedPostCardProps) {
  const [index, setIndex] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const [burstAt, setBurstAt] = useState({ x: 120, y: MEDIA_H / 2 });
  /** Actual card width (PhoneShell is 402 — not window width on desktop web). */
  const [pageW, setPageW] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastTap = useRef(0);
  const photos = post.photoUrls?.length ? post.photoUrls : [];

  const reportPost = async (reason: string) => {
    try {
      const { chatRepo } = await import('../../lib/chat/repository');
      await chatRepo.reportContent({
        targetType: 'post',
        targetId: post.id,
        reportedUserId: post.authorId,
        reason,
      });
      Alert.alert(
        'Report submitted',
        'Thanks. Our team will review this. Contact samimoudarres@hotmail.com if you need more help.',
      );
    } catch (e: any) {
      Alert.alert('Could not report', e?.message || 'Try again.');
    }
  };
  const isCollage =
    post.displayMode === 'collage' && Boolean(post.collageLayoutId);
  const collageLayout = isCollage
    ? layoutById(post.collageLayoutId)
    : null;
  const firstAspect =
    !isCollage && photos[0] != null ? getImageAspectSync(photos[0]) : 1;
  const slideW = pageW > 0 ? pageW : 0;
  // Collages must keep the same canvas aspect as create/edit (width / layout.aspect).
  // Carousel / single photos still use native image aspect, capped by MEDIA_H.
  const mediaH =
    isCollage && collageLayout && slideW > 0
      ? Math.round(slideW / collageLayout.aspect)
      : slideW > 0
        ? Math.min(MEDIA_H, Math.max(200, Math.round(slideW / firstAspect)))
        : MEDIA_H;

  // Instagram-style: named lead + (stampCount - 1) others (includes you when stamped)
  const stampLine = useMemo(() => {
    if (post.stampCount <= 0) return null;
    if (post.stampCount === 1 && post.iStamped) {
      return (
        <Text style={styles.stampLine} onPress={() => onOpenStampers?.(post)}>
          Stamped by <Text style={styles.stampBold}>you</Text>
        </Text>
      );
    }
    const lead = stampers[0];
    const name = lead?.fullName?.split(' ')[0] ?? lead?.firstName;
    const othersN = Math.max(0, post.stampCount - 1);
    if (name && othersN > 0) {
      return (
        <Text style={styles.stampLine}>
          Stamped by{' '}
          <Text
            style={styles.stampBold}
            onPress={() => lead && onOpenProfile?.(lead)}
          >
            {name}
          </Text>
          {' and '}
          <Text
            style={styles.stampBold}
            onPress={() => onOpenStampers?.(post)}
          >
            {othersN} other{othersN === 1 ? '' : 's'}
          </Text>
        </Text>
      );
    }
    if (name) {
      return (
        <Text style={styles.stampLine}>
          Stamped by{' '}
          <Text
            style={styles.stampBold}
            onPress={() => lead && onOpenProfile?.(lead)}
          >
            {name}
          </Text>
        </Text>
      );
    }
    return (
      <Text style={styles.stampLine} onPress={() => onOpenStampers?.(post)}>
        <Text style={styles.stampBold}>{post.stampCount}</Text> stamp
        {post.stampCount === 1 ? '' : 's'}
      </Text>
    );
  }, [
    post.stampCount,
    post.iStamped,
    stampers,
    onOpenProfile,
    onOpenStampers,
    post,
  ]);

  const fireStampAt = (locationX: number, locationY: number) => {
    const w = pageW > 0 ? pageW : 320;
    const x = Math.max(36, Math.min(w - 36, locationX));
    const y = Math.max(36, Math.min(mediaH - 36, locationY));
    setBurstAt({ x, y });
    setBurstKey((k) => k + 1);
  };

  const onPhotoPress = (e: GestureResponderEvent) => {
    const now = Date.now();
    const { locationX, locationY } = e.nativeEvent;
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      fireStampAt(locationX, locationY);
      if (!post.iStamped) onToggleStamp(post);
      return;
    }
    lastTap.current = now;
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const w = pageW || 1;
    const x = e.nativeEvent.contentOffset.x;
    setIndex(Math.round(x / w));
  };

  const previewStampers = stampers.slice(0, 3);

  return (
    <View
      style={styles.card}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== pageW) setPageW(w);
      }}
    >
      <View style={styles.top}>
        <Pressable
          style={styles.topLeft}
          onPress={() => author && onOpenProfile?.(author)}
        >
          <Avatar source={author?.avatar} size={32} />
          <View style={styles.topText}>
            <Text style={styles.name} numberOfLines={1}>
              {author?.fullName ?? 'Traveler'}
            </Text>
            <Text style={styles.ago}>{timeAgo(post.createdAt)}</Text>
          </View>
        </Pressable>
        <View style={styles.topRight}>
          <Pressable
            style={styles.loc}
            onPress={() => onOpenLocation?.(post)}
            hitSlop={8}
          >
            <Text style={styles.locText} numberOfLines={1}>
              {post.locationLabel}
            </Text>
            <LocationPinIcon size={16} />
          </Pressable>
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={10}
            style={styles.moreBtn}
            accessibilityLabel="Post options"
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={colors.black}
            />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuOpen(false)}
        >
          <View style={styles.menuSheet}>
            {isOwnPost ? (
              <>
                <Pressable
                  style={styles.menuRow}
                  onPress={() => {
                    setMenuOpen(false);
                    onEditPost?.(post);
                  }}
                >
                  <Ionicons name="create-outline" size={20} color={colors.black} />
                  <Text style={styles.menuText}>Edit post</Text>
                </Pressable>
                <Pressable
                  style={styles.menuRow}
                  onPress={() => {
                    setMenuOpen(false);
                    Alert.alert(
                      'Delete post?',
                      'This removes the post for everyone. This can’t be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => onDeletePost?.(post),
                        },
                      ],
                    );
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color="#C0392B" />
                  <Text style={[styles.menuText, styles.menuDanger]}>
                    Delete post
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setMenuOpen(false);
                  Alert.alert('Report post', 'Why are you reporting this post?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Harassment',
                      onPress: () => void reportPost('Harassment or bullying'),
                    },
                    {
                      text: 'Inappropriate',
                      onPress: () =>
                        void reportPost('Sexual or inappropriate content'),
                    },
                    {
                      text: 'Spam',
                      onPress: () => void reportPost('Spam or scams'),
                    },
                    {
                      text: 'Other',
                      onPress: () => void reportPost('Other'),
                    },
                  ]);
                }}
              >
                <Ionicons name="flag-outline" size={20} color="#C0392B" />
                <Text style={[styles.menuText, styles.menuDanger]}>
                  Report post
                </Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.menuRow, styles.menuCancel]}
              onPress={() => setMenuOpen(false)}
            >
              <Text style={styles.menuText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <View style={[styles.media, { height: mediaH }]}>
        {slideW ? (
          isCollage ? (
            <Pressable onPress={onPhotoPress}>
              <CollageCanvas
                layoutId={post.collageLayoutId as CollageLayoutId}
                photos={photos}
                crops={post.photoCrops ?? undefined}
                width={slideW}
                // Let the layout define height (same as create/edit). Passing
                // a mismatched fixed height was squashing slots & crops.
                showPlaceholders={false}
              />
            </Pressable>
          ) : (
            <ScrollView
              key={`carousel-${post.id}-${slideW}-${mediaH}`}
              horizontal
              pagingEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              decelerationRate="fast"
              bounces={false}
              style={{ width: slideW, height: mediaH }}
              contentContainerStyle={{
                width: slideW * Math.max(photos.length, 1),
              }}
            >
              {photos.map((uri, i) => (
                <Pressable
                  key={`${post.id}-${i}`}
                  onPress={onPhotoPress}
                  style={{ width: slideW, height: mediaH, overflow: 'hidden' }}
                >
                  <CollageCanvas
                    layoutId="single"
                    photos={[uri]}
                    crops={[post.photoCrops?.[i] ?? DEFAULT_CROP]}
                    width={slideW}
                    height={mediaH}
                    showPlaceholders={false}
                  />
                </Pressable>
              ))}
            </ScrollView>
          )
        ) : (
          <View style={{ height: mediaH, backgroundColor: '#111' }} />
        )}
        {!isCollage && photos.length > 1 ? (
          <View style={styles.countPill}>
            <Text style={styles.countText}>
              {index + 1}/{photos.length}
            </Text>
          </View>
        ) : null}
        {post.taggedTripId ? (
          <Pressable
            style={styles.tripTagBtn}
            onPress={(e) => {
              e?.stopPropagation?.();
              onOpenTaggedTrip?.(post.taggedTripId!);
            }}
            hitSlop={6}
            accessibilityLabel="View tagged trip"
          >
            <Ionicons name="airplane" size={14} color={colors.white} />
          </Pressable>
        ) : null}
        <StampBurst trigger={burstKey} x={burstAt.x} y={burstAt.y} />
      </View>

      <View style={styles.bottom}>
        <View style={styles.actions}>
          <Pressable
            style={styles.stampBtn}
            onPress={() => {
              setBurstAt({
                x: (pageW || 200) * 0.35,
                y: MEDIA_H * 0.55,
              });
              setBurstKey((k) => k + 1);
              onToggleStamp(post);
            }}
            hitSlop={8}
          >
            <View style={styles.actionIcon}>
              <StampIcon
                size={25}
                color={post.iStamped ? colors.stampActive : '#262626'}
                solid={post.iStamped}
              />
            </View>
            <Text style={styles.stampCount}>{post.stampCount}</Text>
          </Pressable>
          <Pressable
            onPress={() => onShare(post)}
            hitSlop={8}
            style={styles.shareBtn}
          >
            <View style={[styles.actionIcon, styles.shareTilt]}>
              <ShareIcon size={22} color="#262626" />
            </View>
          </Pressable>
          {post.displayMode !== 'collage' && photos.length > 1 ? (
            <View style={styles.dots} pointerEvents="none">
              {photos.map((_, i) => (
                <View
                  key={`d-${i}`}
                  style={[styles.dot, i === index && styles.dotActive]}
                />
              ))}
            </View>
          ) : null}
        </View>

        {stampLine ? (
          <View style={styles.stampRow}>
            <Pressable
              style={styles.avatarStack}
              onPress={() => onOpenStampers?.(post)}
              hitSlop={4}
            >
              {previewStampers.map((s, i) => (
                <Pressable
                  key={s.id}
                  style={[styles.stackAv, i > 0 && { marginLeft: -8 }]}
                  onPress={() => onOpenProfile?.(s)}
                  hitSlop={2}
                >
                  <Avatar source={s.avatar} size={18} />
                </Pressable>
              ))}
            </Pressable>
            {stampLine}
          </View>
        ) : null}

        {post.caption ? (
          <Text style={styles.caption}>
            <Text style={styles.captionName}>
              {author?.fullName?.split(' ')[0] ?? 'Traveler'}{' '}
            </Text>
            {post.caption}
          </Text>
        ) : null}
        <Text style={styles.date}>{formatPostDate(post.createdAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, marginBottom: 8, width: '100%' },
  top: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.29)',
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  topText: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.black,
  },
  ago: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: 'rgba(4,0,0,0.5)',
    marginTop: -1,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    maxWidth: '48%',
  },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  locText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: 'rgba(4,0,0,0.5)',
    textAlign: 'right',
    flexShrink: 1,
    textDecorationLine: 'underline',
  },
  moreBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuCancel: { justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.12)' },
  menuText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.black,
  },
  menuDanger: { color: '#C0392B' },
  media: {
    width: '100%',
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  countPill: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(18,18,18,0.7)',
    borderRadius: 13,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countText: { color: '#F9F9F9', fontSize: 12, fontFamily: fonts.regular },
  /** Instagram-style people-tag badge — plane for tagged trip */
  tripTagBtn: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  bottom: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  actions: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 6,
    minHeight: 34,
  },
  stampBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampCount: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.black,
    minWidth: 20,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  shareBtn: { padding: 0 },
  shareTilt: { transform: [{ rotate: '-28deg' }] },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C7C7C7',
  },
  dotActive: { backgroundColor: colors.openJoin },
  stampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  stackAv: {
    borderWidth: 1.5,
    borderColor: colors.white,
    borderRadius: 10,
  },
  stampLine: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#262626',
    flex: 1,
  },
  stampBold: { fontFamily: fonts.bold },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#262626',
    lineHeight: 18,
  },
  captionName: { fontFamily: fonts.bold },
  date: {
    marginTop: 6,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: 'rgba(0,0,0,0.4)',
  },
});
