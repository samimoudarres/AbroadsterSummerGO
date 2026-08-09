import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';

interface CalendarRangeModalProps {
  visible: boolean;
  start: Date | null;
  end: Date | null;
  onClose: () => void;
  onChange: (start: Date | null, end: Date | null) => void;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayTime(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Compact centered range calendar — not full-screen. */
export function CalendarRangeModal({
  visible,
  start,
  end,
  onClose,
  onChange,
}: CalendarRangeModalProps) {
  const [cursor, setCursor] = useState(() => startOfMonth(start ?? new Date()));
  const [draftStart, setDraftStart] = useState<Date | null>(start);
  const [draftEnd, setDraftEnd] = useState<Date | null>(end);

  const days = useMemo(() => {
    const first = startOfMonth(cursor);
    const startPad = first.getDay();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    const dim = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const pick = (day: Date) => {
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(day);
      setDraftEnd(null);
      return;
    }
    if (dayTime(day) < dayTime(draftStart)) {
      setDraftEnd(draftStart);
      setDraftStart(day);
    } else {
      setDraftEnd(day);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onShow={() => {
        setDraftStart(start);
        setDraftEnd(end);
        setCursor(startOfMonth(start ?? new Date()));
      }}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.hint}>Tap start date, then end date</Text>
          <View style={styles.head}>
            <Pressable
              hitSlop={8}
              onPress={() => setCursor((c) => addMonths(c, -1))}
            >
              <Ionicons name="chevron-back" size={20} color={colors.black} />
            </Pressable>
            <Text style={styles.month}>
              {cursor.toLocaleDateString([], { month: 'short', year: 'numeric' })}
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => setCursor((c) => addMonths(c, 1))}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.black} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <Text key={i} style={styles.weekLabel}>
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {days.map((day, i) => {
              if (!day) return <View key={`e-${i}`} style={styles.cell} />;
              const selected =
                (draftStart && sameDay(day, draftStart)) ||
                (draftEnd && sameDay(day, draftEnd));
              const mid =
                draftStart &&
                draftEnd &&
                dayTime(day) > dayTime(draftStart) &&
                dayTime(day) < dayTime(draftEnd);
              return (
                <Pressable
                  key={day.toISOString()}
                  style={[
                    styles.cell,
                    mid && styles.cellMid,
                    selected && styles.cellSelected,
                  ]}
                  onPress={() => pick(day)}
                >
                  <Text
                    style={[styles.dayNum, selected && styles.dayNumOn]}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                setDraftStart(null);
                setDraftEnd(null);
                onChange(null, null);
                onClose();
              }}
            >
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
            <Pressable
              style={styles.apply}
              onPress={() => {
                onChange(draftStart, draftEnd ?? draftStart);
                onClose();
              }}
            >
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const CELL = 36;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    width: 300,
    maxWidth: '92%',
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    zIndex: 2,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  month: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.black },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekLabel: {
    width: CELL,
    textAlign: 'center',
    fontFamily: fonts.bold,
    color: colors.textMuted,
    fontSize: 11,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: CELL * 7,
    alignSelf: 'center',
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellMid: { backgroundColor: 'rgba(23,88,100,0.12)' },
  cellSelected: {
    backgroundColor: colors.openJoin,
    borderRadius: CELL / 2,
  },
  dayNum: { fontFamily: fonts.regular, fontSize: 13, color: colors.black },
  dayNumOn: { color: colors.white, fontFamily: fonts.bold },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  clear: { fontFamily: fonts.bold, color: colors.textMuted, fontSize: 14 },
  apply: {
    backgroundColor: colors.openJoin,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  applyText: { fontFamily: fonts.bold, color: colors.white, fontSize: 13 },
});
