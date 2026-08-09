import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';

const THUMB = 44;

interface ConfirmTripSliderProps {
  locked: boolean;
  onLock: () => void;
  onUnlock: () => void;
  busy?: boolean;
}

/** Bidirectional slide: right = Locked in (orange), left = Lock it in (unlocked). */
export function ConfirmTripSlider({
  locked,
  onLock,
  onUnlock,
  busy,
}: ConfirmTripSliderProps) {
  const [trackW, setTrackW] = useState(0);
  const maxX = Math.max(0, trackW - THUMB - 4);
  const x = useRef(new Animated.Value(0)).current;
  const startX = useRef(0);
  const dragging = useRef(false);
  const lockedRef = useRef(locked);
  const busyRef = useRef(busy);
  const maxXRef = useRef(maxX);
  const onLockRef = useRef(onLock);
  const onUnlockRef = useRef(onUnlock);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    maxXRef.current = maxX;
  }, [maxX]);
  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);
  useEffect(() => {
    onUnlockRef.current = onUnlock;
  }, [onUnlock]);

  useEffect(() => {
    if (dragging.current || maxX <= 0) return;
    Animated.spring(x, {
      toValue: locked ? maxX : 0,
      useNativeDriver: false,
      bounciness: 4,
    }).start();
  }, [locked, maxX, x]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !busyRef.current,
      onMoveShouldSetPanResponder: (_e, g) =>
        !busyRef.current && Math.abs(g.dx) > 4,
      onPanResponderGrant: () => {
        dragging.current = true;
        x.stopAnimation((v) => {
          startX.current = typeof v === 'number' ? v : 0;
        });
      },
      onPanResponderMove: (_, g) => {
        const limit = maxXRef.current;
        if (limit <= 0) return;
        const next = Math.max(0, Math.min(limit, startX.current + g.dx));
        x.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const limit = maxXRef.current;
        dragging.current = false;
        if (limit <= 0) return;
        const next = Math.max(0, Math.min(limit, startX.current + g.dx));
        const shouldLock = lockedRef.current
          ? next > limit * 0.6
          : next >= limit * 0.45;
        Animated.spring(x, {
          toValue: shouldLock ? limit : 0,
          useNativeDriver: false,
          bounciness: 4,
        }).start();
        if (shouldLock && !lockedRef.current) onLockRef.current();
        else if (!shouldLock && lockedRef.current) onUnlockRef.current();
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    setTrackW(e.nativeEvent.layout.width);
  };

  const fillWidth =
    maxX > 0
      ? x.interpolate({
          inputRange: [0, maxX],
          outputRange: [0, trackW],
          extrapolate: 'clamp',
        })
      : 0;

  return (
    <View
      style={[styles.track, locked && styles.trackLocked]}
      onLayout={onLayout}
      {...pan.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={locked ? 'Locked in' : 'Lock it in'}
      accessibilityHint="Swipe right to lock in this trip, or left to unlock"
    >
      <Animated.View
        style={[
          styles.fill,
          {
            width: fillWidth,
            backgroundColor: locked
              ? colors.statusOrange
              : 'rgba(23,88,100,0.28)',
          },
        ]}
      />
      <Text
        style={[styles.label, locked && styles.labelLocked]}
        pointerEvents="none"
      >
        {busy ? 'Updating…' : locked ? 'Locked in' : 'Lock it in'}
      </Text>
      <Animated.View
        style={[
          styles.thumb,
          {
            backgroundColor: locked ? colors.statusOrange : colors.openJoin,
            transform: [{ translateX: x }],
          },
        ]}
      >
        <Ionicons
          name={locked ? 'lock-closed' : 'lock-open'}
          size={20}
          color={colors.white}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E8F6FC',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(23,88,100,0.22)',
  },
  trackLocked: {
    borderColor: 'rgba(232,140,48,0.55)',
    backgroundColor: '#FFF4E8',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 26,
  },
  label: {
    textAlign: 'center',
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.openJoin,
    paddingHorizontal: THUMB + 8,
  },
  labelLocked: {
    color: '#B86A12',
  },
  thumb: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
