import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts } from '../../constants/theme';

const ITEM_H = 44;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function daysInMonth(monthIndex: number, year: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function indexFromOffset(y: number, length: number): number {
  return Math.max(0, Math.min(length - 1, Math.round(y / ITEM_H)));
}

function Wheel({
  data,
  index,
  onChange,
  width,
}: {
  data: string[];
  index: number;
  onChange: (i: number) => void;
  width: number | `${number}%`;
}) {
  const ref = useRef<ScrollView>(null);
  const [selected, setSelected] = useState(index);
  const draggingRef = useRef(false);
  const lastCommitted = useRef(index);

  // Sync from parent only when not mid-gesture (e.g. day count changed)
  useEffect(() => {
    if (draggingRef.current) return;
    if (index === lastCommitted.current && index === selected) return;
    lastCommitted.current = index;
    setSelected(index);
    requestAnimationFrame(() => {
      ref.current?.scrollTo({ y: index * ITEM_H, animated: false });
    });
  }, [index, data.length]);

  const commit = (i: number, snap: boolean) => {
    setSelected(i);
    if (i !== lastCommitted.current) {
      lastCommitted.current = i;
      onChange(i);
    }
    if (snap) {
      ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = indexFromOffset(e.nativeEvent.contentOffset.y, data.length);
    if (i !== selected) setSelected(i);
  };

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    draggingRef.current = false;
    const i = indexFromOffset(e.nativeEvent.contentOffset.y, data.length);
    commit(i, true);
  };

  return (
    <View style={[styles.wheel, { width: width as any }]}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        nestedScrollEnabled
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollBeginDrag={() => {
          draggingRef.current = true;
        }}
        onMomentumScrollEnd={onEnd}
        onScrollEndDrag={(e) => {
          // Web often has no momentum — commit on drag end
          if (Platform.OS === 'web') onEnd(e);
          else draggingRef.current = false;
        }}
        contentContainerStyle={{ paddingVertical: PAD }}
      >
        {data.map((label, i) => (
          <View key={`${label}-${i}`} style={styles.item}>
            <Text style={[styles.itemText, i === selected && styles.itemActive]}>
              {label}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.selection} />
    </View>
  );
}

interface BirthdayPickerProps {
  value: Date;
  onChange: (next: Date) => void;
}

/** Instagram-style rolodex birthday picker (month / day / year). */
export function BirthdayPicker({ value, onChange }: BirthdayPickerProps) {
  const yearNow = new Date().getFullYear();
  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = yearNow - 13; y >= yearNow - 100; y--) out.push(y);
    return out;
  }, [yearNow]);

  const month = value.getMonth();
  const year = value.getFullYear();
  const maxDay = daysInMonth(month, year);
  const day = Math.min(value.getDate(), maxDay);

  const dayLabels = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => String(i + 1)),
    [maxDay],
  );
  const yearLabels = useMemo(() => years.map(String), [years]);
  const yearIndex = Math.max(0, years.indexOf(year));

  const setParts = (m: number, d: number, y: number) => {
    const dim = daysInMonth(m, y);
    onChange(new Date(y, m, Math.min(d, dim)));
  };

  return (
    <View style={styles.wrap}>
      <Wheel
        data={MONTHS}
        index={month}
        width="42%"
        onChange={(i) => setParts(i, day, year)}
      />
      <Wheel
        data={dayLabels}
        index={day - 1}
        width="22%"
        onChange={(i) => setParts(month, i + 1, year)}
      />
      <Wheel
        data={yearLabels}
        index={yearIndex < 0 ? 0 : yearIndex}
        width="36%"
        onChange={(i) => setParts(month, day, years[i] ?? year)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    height: ITEM_H * VISIBLE,
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
  },
  wheel: {
    height: ITEM_H * VISIBLE,
  },
  item: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontFamily: fonts.regular,
    fontSize: 18,
    color: 'rgba(0,0,0,0.28)',
  },
  itemActive: {
    fontFamily: fonts.bold,
    color: colors.black,
    fontSize: 20,
  },
  selection: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: PAD,
    height: ITEM_H,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(23,88,100,0.35)',
    backgroundColor: 'rgba(23,88,100,0.06)',
  },
});

export function defaultBirthday(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d;
}
