import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/theme';

interface LocationPillProps {
  cityName: string;
  countryName: string;
  studentsNearby: number;
  friendsStudyingHere: number;
  /** When a school/program chip is active. */
  schoolFilter?: {
    label: string;
    totalStudents: number;
    /** program = global Abroadster total; area = current map viewport */
    scope: 'program' | 'area';
  } | null;
  onPress?: () => void;
}

export function LocationPill({
  cityName,
  countryName,
  studentsNearby,
  friendsStudyingHere,
  schoolFilter,
  onPress,
}: LocationPillProps) {
  const place = countryName ? `${cityName}, ${countryName}` : cityName;
  const schoolMode = Boolean(schoolFilter?.label);
  const countLabel =
    schoolFilter?.scope === 'area'
      ? 'in this area'
      : 'on Abroadster';

  return (
    <Pressable
      style={[styles.pill, schoolMode && styles.pillSchool]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={
        onPress
          ? schoolMode
            ? `${schoolFilter!.label}, ${schoolFilter!.totalStudents} students ${countLabel}`
            : `Search places near ${place}`
          : undefined
      }
    >
      {schoolMode ? (
        <>
          <Text style={styles.title} numberOfLines={1}>
            {schoolFilter!.label}
          </Text>
          <Text style={styles.schoolTotal} numberOfLines={1}>
            {schoolFilter!.totalStudents} student
            {schoolFilter!.totalStudents === 1 ? '' : 's'} {countLabel}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.title} numberOfLines={1}>
            {place}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{studentsNearby}</Text>
              <Text style={styles.statLabel}>students nearby</Text>
            </View>
            <View style={styles.dot} />
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{friendsStudyingHere}</Text>
              <Text style={styles.statLabel}>friends studying here</Text>
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: colors.white,
    borderRadius: 50,
    width: 227,
    height: 37,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    paddingHorizontal: 8,
  },
  pillSchool: {
    width: undefined,
    minWidth: 200,
    maxWidth: 280,
    paddingHorizontal: 14,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.black,
    textAlign: 'center',
    lineHeight: 16,
  },
  schoolTotal: {
    fontFamily: fonts.regular,
    fontSize: 9,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 11,
    marginTop: -1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -1,
  },
  statBlock: {
    alignItems: 'center',
    minWidth: 66,
  },
  statNumber: {
    fontFamily: fonts.regular,
    fontSize: 8,
    color: colors.textMuted,
    lineHeight: 9,
  },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: 8,
    color: colors.textMuted,
    lineHeight: 9,
  },
  dot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textMuted,
    marginHorizontal: 4,
    marginTop: 2,
  },
});
