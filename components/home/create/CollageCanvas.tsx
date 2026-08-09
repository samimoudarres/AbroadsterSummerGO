import React, { useEffect } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import {
  DEFAULT_CROP,
  layoutById,
  type CollageLayoutId,
  type PhotoCrop,
} from '../../../lib/feed/collageLayouts';
import { feedImageSource } from '../../../lib/feed/feedPhotos';
import { getImageAspectSync } from '../../../lib/feed/imageAspect';
import { colors } from '../../../constants/theme';

type SlotPhoto = string | number | null | undefined;

/**
 * Cover size for a photo in a slot at scale=1:
 * one edge matches the slot; the other overflows so you can pan
 * to any part of the photo while the frame stays fully filled.
 */
function coverBaseSize(sw: number, sh: number, photoAspect: number) {
  const slotAspect = sw / Math.max(sh, 1);
  if (photoAspect >= slotAspect) {
    // Wider than slot → pin height, overflow on X
    return { baseW: sh * photoAspect, baseH: sh };
  }
  // Taller / more portrait than slot → pin width, overflow on Y
  return { baseW: sw, baseH: sw / Math.max(photoAspect, 0.01) };
}

interface CollageCanvasProps {
  layoutId: CollageLayoutId | string;
  photos: SlotPhoto[];
  crops?: Array<PhotoCrop | null | undefined>;
  width: number;
  height?: number;
  selectedSlot?: number | null;
  onPressSlot?: (index: number) => void;
  onCropChange?: (index: number, crop: PhotoCrop) => void;
  /** Enable finger pan/pinch on the selected (or all filled) slots */
  interactiveCrop?: boolean;
  style?: StyleProp<ViewStyle>;
  showPlaceholders?: boolean;
  /** Number badges in each slot so layout is obvious */
  showSlotNumbers?: boolean;
  /** Template thumbnails: never fill with real photos, only empty numbered cells */
  templateMode?: boolean;
}

function SlotImage({
  photo,
  crop,
  sw,
  sh,
  interactive,
  onCropChange,
}: {
  photo: SlotPhoto;
  crop: PhotoCrop;
  sw: number;
  sh: number;
  interactive?: boolean;
  onCropChange?: (crop: PhotoCrop) => void;
}) {
  const scale = Math.max(1, crop.scale ?? 1);
  const ox = crop.offsetX ?? 0;
  const oy = crop.offsetY ?? 0;

  const photoAspect =
    photo != null && photo !== '' ? getImageAspectSync(photo as any) : 1;
  const { baseW, baseH } = coverBaseSize(sw, sh, photoAspect);
  const imgW = baseW * scale;
  const imgH = baseH * scale;
  const maxTX = Math.max(0, (imgW - sw) / 2);
  const maxTY = Math.max(0, (imgH - sh) / 2);
  const tx = -ox * maxTX;
  const ty = -oy * maxTY;

  const baseWSv = useSharedValue(baseW);
  const baseHSv = useSharedValue(baseH);
  const startOx = useSharedValue(ox);
  const startOy = useSharedValue(oy);
  const startScale = useSharedValue(scale);
  const liveScale = useSharedValue(scale);
  const liveOx = useSharedValue(ox);
  const liveOy = useSharedValue(oy);

  useEffect(() => {
    baseWSv.value = baseW;
    baseHSv.value = baseH;
    liveScale.value = scale;
    liveOx.value = ox;
    liveOy.value = oy;
  }, [baseW, baseH, scale, ox, oy, baseWSv, baseHSv, liveScale, liveOx, liveOy]);

  const commit = (next: PhotoCrop) => {
    onCropChange?.(next);
  };

  const pan = Gesture.Pan()
    .enabled(Boolean(interactive && onCropChange))
    .onBegin(() => {
      startOx.value = liveOx.value;
      startOy.value = liveOy.value;
    })
    .onUpdate((e) => {
      const s = liveScale.value;
      const mX = Math.max(0, (baseWSv.value * s - sw) / 2);
      const mY = Math.max(0, (baseHSv.value * s - sh) / 2);
      if (mX <= 0 && mY <= 0) return;
      const nextOx =
        mX > 0
          ? Math.max(-1, Math.min(1, startOx.value - e.translationX / mX))
          : 0;
      const nextOy =
        mY > 0
          ? Math.max(-1, Math.min(1, startOy.value - e.translationY / mY))
          : 0;
      liveOx.value = nextOx;
      liveOy.value = nextOy;
    })
    .onEnd(() => {
      runOnJS(commit)({
        scale: liveScale.value,
        offsetX: liveOx.value,
        offsetY: liveOy.value,
      });
    });

  const pinch = Gesture.Pinch()
    .enabled(Boolean(interactive && onCropChange))
    .onBegin(() => {
      startScale.value = liveScale.value;
    })
    .onUpdate((e) => {
      liveScale.value = Math.max(1, Math.min(4, startScale.value * e.scale));
    })
    .onEnd(() => {
      runOnJS(commit)({
        scale: liveScale.value,
        offsetX: liveOx.value,
        offsetY: liveOy.value,
      });
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  const animStyle = useAnimatedStyle(() => {
    const s = liveScale.value;
    const w = baseWSv.value * s;
    const h = baseHSv.value * s;
    const mX = Math.max(0, (w - sw) / 2);
    const mY = Math.max(0, (h - sh) / 2);
    return {
      width: w,
      height: h,
      transform: [
        { translateX: -liveOx.value * mX },
        { translateY: -liveOy.value * mY },
      ],
    };
  });

  if (photo == null || photo === '') return null;

  if (interactive && onCropChange) {
    return (
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.imgWrap, { width: sw, height: sh }]}>
          <Animated.Image
            source={feedImageSource(photo as any)}
            style={animStyle}
            resizeMode="cover"
          />
        </Animated.View>
      </GestureDetector>
    );
  }

  return (
    <View style={[styles.imgWrap, { width: sw, height: sh }]}>
      <Image
        source={feedImageSource(photo as any)}
        style={{
          width: imgW,
          height: imgH,
          transform: [{ translateX: tx }, { translateY: ty }],
        }}
        resizeMode="cover"
      />
    </View>
  );
}

/** Edge-to-edge collage renderer (no gutters between photos). */
export function CollageCanvas({
  layoutId,
  photos,
  crops,
  width,
  height,
  selectedSlot = null,
  onPressSlot,
  onCropChange,
  interactiveCrop = false,
  style,
  showPlaceholders = true,
  showSlotNumbers = false,
  templateMode = false,
}: CollageCanvasProps) {
  const layout = layoutById(layoutId);
  if (!layout || width <= 0) {
    return (
      <View
        style={[{ width, height: height ?? width, backgroundColor: '#111' }, style]}
      />
    );
  }
  const h = height ?? width / layout.aspect;

  return (
    <View
      style={[
        { width, height: h, backgroundColor: '#111', overflow: 'hidden' },
        style,
      ]}
    >
      {layout.slots.map((slot, i) => {
        const photo = templateMode ? null : photos[i];
        const crop = crops?.[i] ?? DEFAULT_CROP;
        const left = (slot.x / 100) * width;
        const top = (slot.y / 100) * h;
        const sw = (slot.w / 100) * width;
        const sh = (slot.h / 100) * h;
        const selected = selectedSlot === i;
        const interactive =
          interactiveCrop && selected && photo != null && photo !== '';

        const body = (
          <View style={[styles.slot, { width: sw, height: sh }]}>
            {photo != null && photo !== '' ? (
              <SlotImage
                photo={photo}
                crop={crop}
                sw={sw}
                sh={sh}
                interactive={interactive}
                onCropChange={
                  onCropChange
                    ? (c) => onCropChange(i, c)
                    : undefined
                }
              />
            ) : showPlaceholders ? (
              <View
                style={[
                  styles.placeholder,
                  i % 2 === 0 ? styles.phA : styles.phB,
                ]}
              />
            ) : null}
            {(showSlotNumbers || templateMode || photo == null || photo === '') && (
              <View style={styles.numBadge} pointerEvents="none">
                <Text style={styles.numText}>{i + 1}</Text>
              </View>
            )}
            {selected ? <View style={styles.selectedRing} pointerEvents="none" /> : null}
          </View>
        );

        const boxStyle = {
          position: 'absolute' as const,
          left,
          top,
          width: sw,
          height: sh,
          overflow: 'hidden' as const,
        };

        // Interactive crop slots must not sit under Pressable (steals pan)
        if (interactive) {
          return (
            <View key={`slot-${i}`} style={boxStyle}>
              {body}
            </View>
          );
        }

        if (onPressSlot) {
          return (
            <Pressable
              key={`slot-${i}`}
              onPress={() => onPressSlot(i)}
              style={boxStyle}
            >
              {body}
            </Pressable>
          );
        }

        return (
          <View key={`slot-${i}`} style={boxStyle}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
  },
  imgWrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
  },
  phA: { backgroundColor: '#d0d0d0' },
  phB: { backgroundColor: '#b8b8b8' },
  numBadge: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: {
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(0,0,0,0.45)',
  },
  selectedRing: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderColor: colors.openJoin,
  },
});
