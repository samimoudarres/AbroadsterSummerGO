import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Alert,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/theme';
import type { AlbumPhoto, ChatProfile } from '../../data/chatTypes';
import { chatRepo } from '../../lib/chat/repository';
import { getImageAspect } from '../../lib/feed/imageAspect';
import { timeAgo } from '../../lib/feed/timeAgo';
import { toImageSource } from '../../lib/images';
import { PHONE_SAFE_INSETS, PHONE_WIDTH } from '../layout/PhoneShell';
import { Avatar } from '../common/Avatar';
import { ShareIcon } from '../home/HomeIcons';

interface AlbumPhotoViewerProps {
  photos: AlbumPhoto[];
  initialIndex: number;
  profiles: Record<string, ChatProfile>;
  onClose: () => void;
  onOpenProfile?: (user: ChatProfile) => void;
}

/** Instagram-style pinch/pan zoom over a photo that keeps its natural aspect ratio. */
function ZoomableAlbumPhoto({
  imageUrl,
  width,
  onZoomChange,
}: {
  imageUrl: string | number;
  width: number;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const [aspect, setAspect] = useState(() => 1); // width / height
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const frameW = useSharedValue(width);
  const frameH = useSharedValue(width);
  const zoomedRef = useRef(false);

  const height = Math.round(width / Math.max(0.01, aspect));

  useEffect(() => {
    frameW.value = width;
    frameH.value = height;
  }, [width, height, frameW, frameH]);

  useEffect(() => {
    let cancelled = false;
    void getImageAspect(imageUrl).then((a) => {
      if (!cancelled && a > 0) setAspect(a);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const notifyZoom = useCallback(
    (s: number) => {
      const z = s > 1.02;
      if (zoomedRef.current !== z) {
        zoomedRef.current = z;
        onZoomChange?.(z);
      }
    },
    [onZoomChange],
  );

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = Math.max(1, Math.min(4, savedScale.value * e.scale));
      scale.value = next;
      const maxX = Math.max(0, (frameW.value * next - frameW.value) / 2);
      const maxY = Math.max(0, (frameH.value * next - frameH.value) / 2);
      tx.value = Math.max(-maxX, Math.min(maxX, tx.value));
      ty.value = Math.max(-maxY, Math.min(maxY, ty.value));
    })
    .onEnd(() => {
      if (scale.value < 1.02) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        runOnJS(notifyZoom)(1);
      } else {
        runOnJS(notifyZoom)(scale.value);
      }
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (scale.value > 1.02) state.activate();
      else state.fail();
    })
    .onBegin(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      const s = scale.value;
      const maxX = Math.max(0, (frameW.value * s - frameW.value) / 2);
      const maxY = Math.max(0, (frameH.value * s - frameH.value) / 2);
      tx.value = Math.max(-maxX, Math.min(maxX, startTx.value + e.translationX));
      ty.value = Math.max(-maxY, Math.min(maxY, startTy.value + e.translationY));
    })
    .onEnd(() => {
      runOnJS(notifyZoom)(scale.value);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1.05) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        runOnJS(notifyZoom)(1);
      } else {
        const next = 2.2;
        scale.value = withTiming(next);
        const focusX = e.x - frameW.value / 2;
        const focusY = e.y - frameH.value / 2;
        const maxX = Math.max(0, (frameW.value * next - frameW.value) / 2);
        const maxY = Math.max(0, (frameH.value * next - frameH.value) / 2);
        const nx = Math.max(-maxX, Math.min(maxX, -focusX * (next - 1)));
        const ny = Math.max(-maxY, Math.min(maxY, -focusY * (next - 1)));
        tx.value = withTiming(nx);
        ty.value = withTiming(ny);
        runOnJS(notifyZoom)(next);
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={[styles.photoFrame, { width, height }]}>
        <Animated.Image
          source={toImageSource(imageUrl)}
          style={[{ width, height }, animStyle]}
          resizeMode="cover"
        />
      </View>
    </GestureDetector>
  );
}

/**
 * Instagram-style vertical pager for album photos.
 * Natural aspect ratios (white fill, no black letterbox); pinch / double-tap zoom.
 */
export function AlbumPhotoViewer({
  photos,
  initialIndex,
  profiles,
  onClose,
  onOpenProfile,
}: AlbumPhotoViewerProps) {
  const insets = useSafeAreaInsets();
  const topPad =
    (insets.top > 0 ? insets.top : Platform.OS === 'web' ? PHONE_SAFE_INSETS.top : 12) +
    4;
  const listRef = useRef<FlatList<AlbumPhoto>>(null);
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareTargets, setShareTargets] = useState<
    Array<
      | { kind: 'friend'; profile: ChatProfile }
      | { kind: 'trip'; id: string; tripId: string; label: string }
    >
  >([]);
  const [picked, setPicked] = useState<string[]>([]);

  const photo = photos[index];
  const uploader = photo ? profiles[photo.uploaderId] : null;

  useEffect(() => {
    setZoomed(false);
  }, [index]);

  useEffect(() => {
    if (!sharing) return;
    let cancelled = false;
    (async () => {
      const friends = await chatRepo.searchUsers('a');
      const trips = await chatRepo.listMyTripChannels();
      if (cancelled) return;
      const rows: typeof shareTargets = [];
      for (const f of friends.slice(0, 12)) {
        rows.push({ kind: 'friend', profile: f });
      }
      for (const t of trips.slice(0, 8)) {
        rows.push({
          kind: 'trip',
          id: t.id,
          tripId: t.tripId,
          label: t.name || 'Trip chat',
        });
      }
      setShareTargets(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [sharing]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setIndex(first.index);
    },
  ).current;

  const sendShare = useCallback(async () => {
    if (!photo || !picked.length) return;
    const name = uploader?.fullName;
    for (const key of picked) {
      const row = shareTargets.find((r) =>
        r.kind === 'friend' ? r.profile.id === key : r.id === key,
      );
      if (!row) continue;
      if (row.kind === 'friend') {
        const thread = await chatRepo.openDm(row.profile.id);
        await chatRepo.shareAlbumPhotoToChat(
          photo,
          {
            type: 'dm',
            threadId: thread.id,
            otherUserId: row.profile.id,
          },
          name,
        );
      } else {
        await chatRepo.shareAlbumPhotoToChat(
          photo,
          {
            type: 'trip_channel',
            channelId: row.id,
            tripId: row.tripId,
          },
          name,
        );
      }
    }
    setSharing(false);
    setPicked([]);
  }, [photo, picked, shareTargets, uploader?.fullName]);

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={28} color={colors.black} />
        </Pressable>
        <Text style={styles.topTitle}>
          {index + 1} / {photos.length}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <FlatList
        ref={listRef}
        data={photos}
        keyExtractor={(p) => p.id}
        scrollEnabled={!zoomed}
        pagingEnabled={false}
        onLayout={() => {
          if (initialIndex > 0) {
            requestAnimationFrame(() => {
              listRef.current?.scrollToIndex({
                index: Math.min(initialIndex, photos.length - 1),
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
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => {
          const author = profiles[item.uploaderId];
          return (
            <View style={styles.page}>
              <Pressable
                style={styles.authorRow}
                onPress={() => author && onOpenProfile?.(author)}
              >
                {author ? (
                  <Avatar source={author.avatar} size={36} />
                ) : (
                  <View style={styles.avPlaceholder} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.authorName}>
                    {author?.fullName ?? 'Traveler'}
                  </Text>
                  <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                </View>
              </Pressable>

              <ZoomableAlbumPhoto
                imageUrl={item.imageUrl}
                width={PHONE_WIDTH}
                onZoomChange={setZoomed}
              />

              <View style={styles.actions}>
                <Pressable
                  style={styles.shareBtn}
                  onPress={() => setSharing(true)}
                  hitSlop={8}
                >
                  <ShareIcon size={22} color={colors.black} />
                  <Text style={styles.shareLabel}>Share</Text>
                </Pressable>
                <Pressable
                  style={styles.shareBtn}
                  onPress={() => {
                    if (!photo) return;
                    Alert.alert('Report photo', 'Why are you reporting this photo?', [
                      {
                        text: 'Inappropriate',
                        onPress: () =>
                          void (async () => {
                            try {
                              await chatRepo.reportContent({
                                targetType: 'album_photo',
                                targetId: photo.id,
                                reportedUserId: photo.uploaderId,
                                reason: 'inappropriate',
                              });
                              Alert.alert(
                                'Report submitted',
                                'Thanks. Our team will review this and remove it if needed. Contact samimoudarres@hotmail.com if you need more help.',
                              );
                            } catch (e: any) {
                              Alert.alert(
                                'Could not report',
                                e?.message || 'Try again.',
                              );
                            }
                          })(),
                      },
                      {
                        text: 'Spam or scam',
                        onPress: () =>
                          void (async () => {
                            try {
                              await chatRepo.reportContent({
                                targetType: 'album_photo',
                                targetId: photo.id,
                                reportedUserId: photo.uploaderId,
                                reason: 'spam',
                              });
                              Alert.alert(
                                'Report submitted',
                                'Thanks. Our team will review this.',
                              );
                            } catch (e: any) {
                              Alert.alert(
                                'Could not report',
                                e?.message || 'Try again.',
                              );
                            }
                          })(),
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="flag-outline" size={20} color={colors.black} />
                  <Text style={styles.shareLabel}>Report</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      {sharing ? (
        <View style={styles.shareSheet}>
          <View style={styles.shareHeader}>
            <Text style={styles.shareTitle}>Share photo</Text>
            <Pressable onPress={() => setSharing(false)}>
              <Ionicons name="close" size={24} color={colors.black} />
            </Pressable>
          </View>
          <FlatList
            data={shareTargets}
            keyExtractor={(r) => (r.kind === 'friend' ? r.profile.id : r.id)}
            style={{ maxHeight: 280 }}
            renderItem={({ item: row }) => {
              const key = row.kind === 'friend' ? row.profile.id : row.id;
              const selected = picked.includes(key);
              const label =
                row.kind === 'friend' ? row.profile.fullName : row.label;
              return (
                <Pressable
                  style={styles.shareRow}
                  onPress={() =>
                    setPicked((prev) =>
                      selected ? prev.filter((x) => x !== key) : [...prev, key],
                    )
                  }
                >
                  {row.kind === 'friend' ? (
                    <Avatar source={row.profile.avatar} size={36} />
                  ) : (
                    <View style={styles.tripIcon}>
                      <Ionicons name="airplane" size={18} color={colors.white} />
                    </View>
                  )}
                  <Text style={styles.shareName}>{label}</Text>
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={selected ? colors.programBlue : colors.textMuted}
                  />
                </Pressable>
              );
            }}
          />
          <Pressable
            style={[styles.sendBtn, !picked.length && { opacity: 0.4 }]}
            disabled={!picked.length}
            onPress={() => void sendShare()}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 120,
    backgroundColor: colors.white,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  iconBtn: { width: 40, alignItems: 'center' },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  page: {
    paddingBottom: 28,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  avPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEE',
  },
  authorName: { fontFamily: fonts.extraBold, fontSize: 14 },
  time: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  photoFrame: {
    backgroundColor: colors.white,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareLabel: { fontFamily: fonts.bold, fontSize: 14 },
  shareSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
  },
  shareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  shareTitle: { fontFamily: fonts.extraBold, fontSize: 18 },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  shareName: { flex: 1, fontFamily: fonts.bold, fontSize: 14 },
  tripIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.programBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    marginTop: 12,
    backgroundColor: colors.programBlue,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 12,
  },
  sendText: { fontFamily: fonts.extraBold, color: colors.white, fontSize: 15 },
});
