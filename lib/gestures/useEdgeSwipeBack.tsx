import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const EDGE_WIDTH = 28;
const MIN_TRANSLATION = 56;
const DISMISS_RATIO = 0.28;

/**
 * Left-edge pan that closes a fullscreen overlay (iOS-style swipe-back).
 * Pass enabled=false when a child overlay owns the edge gesture.
 */
export function useEdgeSwipeBack(onClose: () => void, enabled = true) {
  return useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .hitSlop({ left: 0, width: EDGE_WIDTH, top: 0, bottom: 0 })
        .activeOffsetX(18)
        .failOffsetY([-24, 24])
        .onEnd((e) => {
          if (e.translationX > MIN_TRANSLATION && e.absoluteX < EDGE_WIDTH + 48) {
            runOnJS(onClose)();
          }
        }),
    [onClose, enabled],
  );
}

/** Fullscreen overlay with Instagram-style swipe-back (no sticky corner remnant). */
export function SwipeBackScreen({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const screenWidth = useSharedValue(360);
  const closing = useSharedValue(0);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 0, width: EDGE_WIDTH, top: 0, bottom: 0 })
        .activeOffsetX(10)
        .failOffsetY([-32, 32])
        .onBegin((e) => {
          if (closing.value) return;
          screenWidth.value = Math.max(e.absoluteX - e.x + EDGE_WIDTH, 280);
        })
        .onUpdate((e) => {
          if (closing.value) return;
          if (e.translationX > 0) {
            translateX.value = e.translationX;
            const w = Math.max(screenWidth.value, 1);
            opacity.value = Math.max(0, 1 - e.translationX / w);
          }
        })
        .onEnd((e) => {
          if (closing.value) return;
          const shouldClose =
            e.translationX > MIN_TRANSLATION ||
            e.translationX / screenWidth.value > DISMISS_RATIO;
          if (shouldClose) {
            closing.value = 1;
            // Unmount immediately so nothing can stick on the right edge.
            // (Exit animation on an unmounted view isn't needed.)
            runOnJS(onClose)();
            return;
          }
          translateX.value = withTiming(0, { duration: 160 });
          opacity.value = withTiming(1, { duration: 160 });
        }),
    [onClose, screenWidth, translateX, opacity, closing],
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fill, animStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
});
