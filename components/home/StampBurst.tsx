import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../constants/theme';
import { StampIcon } from './HomeIcons';

interface StampBurstProps {
  trigger: number;
  /** Local coords inside the media area where the finger double-tapped. */
  x: number;
  y: number;
}

/**
 * Passport-stamp slam at the exact double-tap point:
 * rises slightly, rotates in, presses down with ink, then fades.
 */
export function StampBurst({ trigger, x, y }: StampBurstProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(-42);
  const translateY = useSharedValue(-28);
  const ink = useSharedValue(0);
  const posX = useSharedValue(x);
  const posY = useSharedValue(y);

  useEffect(() => {
    if (!trigger) return;
    posX.value = x;
    posY.value = y;
    scale.value = 1.55;
    opacity.value = 0;
    rotate.value = -48;
    translateY.value = -36;
    ink.value = 0;

    opacity.value = withTiming(1, { duration: 60 });
    translateY.value = withSequence(
      withTiming(-8, { duration: 90, easing: Easing.out(Easing.cubic) }),
      withSpring(4, { damping: 14, stiffness: 320 }),
      withTiming(0, { duration: 80 }),
    );
    scale.value = withSequence(
      withTiming(1.15, { duration: 90 }),
      withSpring(0.92, { damping: 9, stiffness: 280 }),
      withTiming(1, { duration: 100 }),
      withDelay(320, withTiming(0.85, { duration: 220 })),
    );
    rotate.value = withSequence(
      withTiming(-12, { duration: 100 }),
      withSpring(6, { damping: 11, stiffness: 220 }),
      withTiming(-4, { duration: 140 }),
    );
    ink.value = withSequence(
      withDelay(100, withTiming(0.55, { duration: 80 })),
      withDelay(280, withTiming(0, { duration: 280 })),
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 60 }),
      withDelay(480, withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) })),
    );
  }, [trigger, x, y, ink, opacity, posX, posY, rotate, scale, translateY]);

  const stampStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  const inkStyle = useAnimatedStyle(() => ({
    opacity: ink.value,
    transform: [{ scale: 0.7 + ink.value * 0.55 }],
  }));

  const anchorStyle = useAnimatedStyle(() => ({
    left: posX.value - 48,
    top: posY.value - 52,
  }));

  if (!trigger) return null;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.anchor, anchorStyle]}>
        <Animated.View style={[styles.ink, inkStyle]} />
        <Animated.View style={[styles.stamp, stampStyle]}>
          <StampIcon size={78} color={colors.stampActive} solid />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
  },
  anchor: {
    position: 'absolute',
    width: 96,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ink: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(23,88,100,0.22)',
  },
});
