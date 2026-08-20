import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

const EDGE_WIDTH = 24;
const MIN_TRANSLATION = 56;

/**
 * Left-edge pan that closes a fullscreen overlay (iOS-style swipe-back).
 * Attach via GestureDetector on the overlay root.
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
