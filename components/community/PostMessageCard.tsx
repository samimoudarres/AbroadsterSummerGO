import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile, FeedPost } from '../../data/chatTypes';
import {
  FEED_PHOTOS,
  seedPhotosForPost,
  usablePostPhotos,
} from '../../lib/feed/feedPhotos';
import { ensureImageUri, toImageSource } from '../../lib/images';
import type { ImageSource } from '../../data/types';
import { Avatar } from '../common/Avatar';

interface PostMessageCardProps {
  post: FeedPost | null;
  postId?: string | null;
  author: ChatProfile | null;
  fallbackImage?: string | number | null;
  /** Hint only — may be stale after Metro restart; prefer postId / post photos. */
  photoAsset?: number | null;
  locationLabel?: string;
  onViewPost?: () => void;
  onOpenTaggedTrip?: () => void;
}

/** Pick the best raw thumb candidate for a shared post (any post, any recipient). */
function pickRawThumb(
  postId: string | null | undefined,
  post: FeedPost | null,
  photoAsset?: number | null,
  fallbackImage?: string | number | null,
): ImageSource {
  // 1. Concrete URI already on the message — works for every recipient without the post
  if (typeof fallbackImage === 'string' && fallbackImage.trim()) {
    const s = fallbackImage.trim();
    // Absolute URLs, data URIs, or Metro web asset paths
    if (/^(https?:|file:|data:|blob:|\/)/i.test(s)) return s;
  }
  if (typeof fallbackImage === 'number' && Number.isFinite(fallbackImage)) {
    return fallbackImage;
  }

  // 2. Loaded post photos (demo require() modules or remote URLs)
  if (postId) {
    const fromPost = usablePostPhotos(postId, post?.photoUrls);
    if (fromPost[0] != null) return fromPost[0] as ImageSource;
  }

  // 3. Legacy metadata module id (may be stale after Metro restart)
  if (typeof photoAsset === 'number' && Number.isFinite(photoAsset)) {
    return photoAsset;
  }

  // 4. Seed / placeholder — never leave the card empty
  if (postId) {
    const seed = seedPhotosForPost(postId)[0];
    if (seed != null) return seed as ImageSource;
  }
  return FEED_PHOTOS[0] as ImageSource;
}

/** Compact Instagram-style shared post bubble — thumb always resolves. */
export function PostMessageCard({
  post,
  postId,
  author,
  fallbackImage,
  photoAsset,
  locationLabel,
  onViewPost,
  onOpenTaggedTrip,
}: PostMessageCardProps) {
  const id = postId ?? post?.id ?? null;
  const raw = useMemo(
    () => pickRawThumb(id, post, photoAsset, fallbackImage),
    [id, post, photoAsset, fallbackImage],
  );

  // Sync source for first paint (toImageSource → URI on web where module ids fail)
  const syncSource = useMemo(() => toImageSource(raw), [raw]);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolvedUri(null);
    (async () => {
      try {
        const uri = await ensureImageUri(raw);
        if (!cancelled && uri) setResolvedUri(uri);
      } catch {
        // keep syncSource
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [raw]);

  const source = resolvedUri ? { uri: resolvedUri } : syncSource;
  const place = post?.locationLabel || locationLabel || 'Shared post';
  const name = author?.fullName ?? 'Traveler';
  const caption = post?.caption || null;

  return (
    <Pressable style={styles.card} onPress={onViewPost}>
      <View style={styles.header}>
        <Avatar source={author?.avatar} size={28} />
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.locRow}>
            <Ionicons name="location-sharp" size={12} color={colors.textMuted} />
            <Text style={styles.loc} numberOfLines={1}>
              {place}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.thumbWrap}>
        <Image source={source} style={styles.thumb} resizeMode="cover" />
        {post?.taggedTripId && onOpenTaggedTrip ? (
          <Pressable
            style={styles.tripTag}
            onPress={(e) => {
              e?.stopPropagation?.();
              onOpenTaggedTrip();
            }}
            hitSlop={6}
          >
            <Ionicons name="airplane" size={12} color={colors.white} />
          </Pressable>
        ) : null}
      </View>
      {caption ? (
        <Text style={styles.caption} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
      <View style={styles.viewBtn}>
        <Text style={styles.viewText}>View post</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 240,
    backgroundColor: colors.white,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerText: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.black,
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  loc: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    flex: 1,
  },
  thumbWrap: { width: '100%', height: 160, backgroundColor: '#eee' },
  thumb: { width: '100%', height: '100%' },
  tripTag: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    paddingHorizontal: 10,
    paddingTop: 8,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#262626',
  },
  viewBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    marginTop: 8,
  },
  viewText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.openJoin,
  },
});
