import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import * as ImageManipulator from 'expo-image-manipulator';
import { BRAND_TEAL, colors, fonts } from '../../constants/theme';
import { DEFAULT_CROP, type PhotoCrop } from '../../lib/feed/collageLayouts';
import { usePhoneTopPad } from '../../lib/layout/safeArea';

const VIEW = 280;
const OUT_SIZE = 720;

function coverBase(view: number, imgW: number, imgH: number) {
  const imgAspect = imgW / Math.max(imgH, 1);
  if (imgAspect >= 1) {
    return { baseW: view * imgAspect, baseH: view };
  }
  return { baseW: view, baseH: view / Math.max(imgAspect, 0.01) };
}

/** Map cover pan/zoom into a square crop in original image pixels. */
export function squareCropFromCover(
  imgW: number,
  imgH: number,
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  const s = Math.max(1, Math.min(4, scale));
  const side = Math.min(imgW, imgH) / s;
  const ox = Math.max(-1, Math.min(1, offsetX));
  const oy = Math.max(-1, Math.min(1, offsetY));
  const originX = ((imgW - side) / 2) * (1 + ox);
  const originY = ((imgH - side) / 2) * (1 + oy);
  return {
    originX: Math.max(0, Math.min(imgW - side, originX)),
    originY: Math.max(0, Math.min(imgH - side, originY)),
    width: Math.max(1, side),
    height: Math.max(1, side),
  };
}

interface AvatarCropModalProps {
  visible: boolean;
  imageUri: string | null;
  onCancel: () => void;
  onDone: (croppedUri: string) => void;
}

/**
 * Circular avatar cropper: pinch to zoom, drag to pan, +/- buttons.
 * Exports a square JPEG via expo-image-manipulator.
 */
export function AvatarCropModal({
  visible,
  imageUri,
  onCancel,
  onDone,
}: AvatarCropModalProps) {
  const topPad = usePhoneTopPad(8);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<PhotoCrop>({ ...DEFAULT_CROP });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !imageUri) return;
    setCrop({ ...DEFAULT_CROP });
    setErr(null);
    setImgSize(null);
    Image.getSize(
      imageUri,
      (w, h) => setImgSize({ w, h }),
      () => setImgSize({ w: 1000, h: 1000 }),
    );
  }, [visible, imageUri]);

  const base = useMemo(() => {
    if (!imgSize) return { baseW: VIEW, baseH: VIEW };
    return coverBase(VIEW, imgSize.w, imgSize.h);
  }, [imgSize]);

  const scaleSv = useSharedValue(1);
  const oxSv = useSharedValue(0);
  const oySv = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startOx = useSharedValue(0);
  const startOy = useSharedValue(0);
  const baseWSv = useSharedValue(base.baseW);
  const baseHSv = useSharedValue(base.baseH);

  useEffect(() => {
    scaleSv.value = crop.scale;
    oxSv.value = crop.offsetX;
    oySv.value = crop.offsetY;
    baseWSv.value = base.baseW;
    baseHSv.value = base.baseH;
  }, [crop, base.baseW, base.baseH]);

  const commit = (next: PhotoCrop) => {
    setCrop({
      scale: Math.max(1, Math.min(4, next.scale)),
      offsetX: Math.max(-1, Math.min(1, next.offsetX)),
      offsetY: Math.max(-1, Math.min(1, next.offsetY)),
    });
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      startOx.value = oxSv.value;
      startOy.value = oySv.value;
    })
    .onUpdate((e) => {
      const imgW = baseWSv.value * scaleSv.value;
      const imgH = baseHSv.value * scaleSv.value;
      const maxTX = Math.max(0, (imgW - VIEW) / 2);
      const maxTY = Math.max(0, (imgH - VIEW) / 2);
      if (maxTX > 0) {
        const nextOx = startOx.value - e.translationX / maxTX;
        oxSv.value = Math.max(-1, Math.min(1, nextOx));
      }
      if (maxTY > 0) {
        const nextOy = startOy.value - e.translationY / maxTY;
        oySv.value = Math.max(-1, Math.min(1, nextOy));
      }
    })
    .onEnd(() => {
      runOnJS(commit)({
        scale: scaleSv.value,
        offsetX: oxSv.value,
        offsetY: oySv.value,
      });
    });

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scaleSv.value;
      startOx.value = oxSv.value;
      startOy.value = oySv.value;
    })
    .onUpdate((e) => {
      scaleSv.value = Math.max(1, Math.min(4, startScale.value * e.scale));
    })
    .onEnd(() => {
      runOnJS(commit)({
        scale: scaleSv.value,
        offsetX: oxSv.value,
        offsetY: oySv.value,
      });
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  const animStyle = useAnimatedStyle(() => {
    const imgW = baseWSv.value * scaleSv.value;
    const imgH = baseHSv.value * scaleSv.value;
    const maxTX = Math.max(0, (imgW - VIEW) / 2);
    const maxTY = Math.max(0, (imgH - VIEW) / 2);
    return {
      width: imgW,
      height: imgH,
      transform: [
        { translateX: -oxSv.value * maxTX },
        { translateY: -oySv.value * maxTY },
      ],
    };
  });

  const nudgeZoom = (delta: number) => {
    commit({ ...crop, scale: crop.scale + delta });
  };

  const save = async () => {
    if (!imageUri || !imgSize || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const region = squareCropFromCover(
        imgSize.w,
        imgSize.h,
        crop.scale,
        crop.offsetX,
        crop.offsetY,
      );
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: Math.round(region.originX),
              originY: Math.round(region.originY),
              width: Math.round(region.width),
              height: Math.round(region.height),
            },
          },
          { resize: { width: OUT_SIZE, height: OUT_SIZE } },
        ],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );
      onDone(result.uri);
    } catch (e: any) {
      setErr(e?.message ?? 'Couldn’t crop that photo. Try another one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={12} style={styles.side}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Crop photo</Text>
          <Pressable
            onPress={() => void save()}
            hitSlop={12}
            style={styles.side}
            disabled={busy || !imgSize}
          >
            {busy ? (
              <ActivityIndicator color={BRAND_TEAL} />
            ) : (
              <Text style={styles.done}>Done</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.hint}>
          Pinch to zoom · drag to reposition · use + / − for fine control
        </Text>

        <View style={styles.stage}>
          <GestureDetector gesture={composed}>
            <View style={styles.circleClip}>
              {imageUri && imgSize ? (
                <Animated.Image
                  source={{ uri: imageUri }}
                  style={[styles.image, animStyle]}
                  resizeMode="cover"
                />
              ) : (
                <ActivityIndicator color={colors.white} />
              )}
            </View>
          </GestureDetector>
          {/* Soft ring so the crop boundary is obvious */}
          <View pointerEvents="none" style={styles.ring} />
        </View>

        <View style={styles.zoomRow}>
          <Pressable
            style={styles.zoomBtn}
            onPress={() => nudgeZoom(-0.25)}
            accessibilityLabel="Zoom out"
          >
            <Ionicons name="remove" size={22} color={colors.black} />
          </Pressable>
          <Text style={styles.zoomLabel}>{crop.scale.toFixed(1)}×</Text>
          <Pressable
            style={styles.zoomBtn}
            onPress={() => nudgeZoom(0.25)}
            accessibilityLabel="Zoom in"
          >
            <Ionicons name="add" size={22} color={colors.black} />
          </Pressable>
        </View>

        <Pressable
          style={styles.resetBtn}
          onPress={() => commit({ ...DEFAULT_CROP })}
        >
          <Text style={styles.resetText}>Reset crop</Text>
        </Pressable>

        {err ? <Text style={styles.error}>{err}</Text> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  side: { minWidth: 64, alignItems: 'center' },
  cancel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.white,
  },
  done: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: '#7FD4C8',
  },
  hint: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#B8B8B8',
    marginBottom: 18,
    paddingHorizontal: 24,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    height: VIEW + 24,
  },
  circleClip: {
    width: VIEW,
    height: VIEW,
    borderRadius: VIEW / 2,
    overflow: 'hidden',
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: VIEW,
    height: VIEW,
    borderRadius: VIEW / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  image: {
    // animated width/height applied
  },
  zoomRow: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
    minWidth: 48,
    textAlign: 'center',
  },
  resetBtn: {
    marginTop: 18,
    alignItems: 'center',
  },
  resetText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#7FD4C8',
  },
  error: {
    marginTop: 16,
    textAlign: 'center',
    color: '#FF8A80',
    fontFamily: fonts.regular,
    paddingHorizontal: 24,
  },
});
