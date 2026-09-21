import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  DEFAULT_CROP,
  layoutById,
  type PhotoCrop,
} from '../../lib/feed/collageLayouts';
import { feedImageSource } from '../../lib/feed/feedPhotos';

type SlotPhoto = string | number | null | undefined;

/**
 * Static mini-collage for profile grids.
 * No gestures / Reanimated — safe inside FlatList cells (unlike CollageCanvas).
 */
export function ProfileCollageThumb({
  layoutId,
  photos,
  crops,
  size,
}: {
  layoutId: string;
  photos: SlotPhoto[];
  crops?: Array<PhotoCrop | null | undefined>;
  size: number;
}) {
  const layout = layoutById(layoutId);
  if (!layout || size <= 0) {
    const first = photos.find((p) => p != null && p !== '');
    if (first == null) {
      return <View style={[styles.root, { width: size, height: size }]} />;
    }
    return (
      <Image
        source={feedImageSource(first as any, 'grid')}
        style={{ width: size, height: size }}
      />
    );
  }

  const h = size; // square cell on profile grid
  const w = size;

  return (
    <View style={[styles.root, { width: w, height: h }]}>
      {layout.slots.map((slot, i) => {
        const photo = photos[i];
        if (photo == null || photo === '') return null;
        const crop = crops?.[i] ?? DEFAULT_CROP;
        const left = (slot.x / 100) * w;
        const top = (slot.y / 100) * h;
        const sw = (slot.w / 100) * w;
        const sh = (slot.h / 100) * h;
        const scale = Math.max(1, crop.scale ?? 1);
        const ox = crop.offsetX ?? 0;
        const oy = crop.offsetY ?? 0;
        // Simple cover fill; crop offsets nudge within the slot when present.
        const imgW = sw * scale;
        const imgH = sh * scale;
        const maxTX = Math.max(0, (imgW - sw) / 2);
        const maxTY = Math.max(0, (imgH - sh) / 2);
        const tx = -ox * maxTX;
        const ty = -oy * maxTY;

        return (
          <View
            key={`slot-${i}`}
            style={{
              position: 'absolute',
              left,
              top,
              width: sw,
              height: sh,
              overflow: 'hidden',
              backgroundColor: '#111',
            }}
          >
            <Image
              source={feedImageSource(photo as any, 'grid')}
              style={{
                width: imgW,
                height: imgH,
                transform: [{ translateX: tx }, { translateY: ty }],
              }}
              resizeMode="cover"
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    backgroundColor: '#111',
  },
});
