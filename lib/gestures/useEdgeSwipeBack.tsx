import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const EDGE_WIDTH = 28;
const MIN_TRANSLATION = 56;
const DISMISS_RATIO = 0.32;

/**
 * Left-edge pan that closes a fullscreen overlay (iOS-style swipe-back).
 */
export function useEdgeSwipeBack(onClose: () => void) {
  return useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 0, width: EDGE_WIDTH, top: 0, bottom: 0 })
        .activeOffsetX(18)
        .failOffsetY([-24, 24])
        .onEnd((e) => {
          if (e.translationX > MIN_TRANSLATION && e.absoluteX < EDGE_WIDTH + 48) {
            runOnJS(onClose)();
          }
        }),
    [onClose],
  );
}

/** Fullscreen overlay with draggable swipe-back (Instagram-style). */
export function SwipeBackScreen({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const screenWidth = useSharedValue(360);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 0, width: EDGE_WIDTH, top: 0, bottom: 0 })
        .activeOffsetX(12)
        .failOffsetY([-28, 28])
        .onBegin((e) => {
          screenWidth.value = Math.max(e.absoluteX - e.x + EDGE_WIDTH, 280);
        })
        .onUpdate((e) => {
          if (e.translationX > 0) {
            translateX.value = e.translationX;
          }
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationX > MIN_TRANSLATION ||
            e.translationX / screenWidth.value > DISMISS_RATIO;
          if (shouldClose) {
            translateX.value = withSpring(screenWidth.value, { damping: 22 }, () => {
              runOnJS(onClose)();
            });
            return;
          }
          translateX.value = withSpring(0);
        }),
    [onClose, screenWidth, translateX],
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
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
  },
});
