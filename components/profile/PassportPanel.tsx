import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors, fonts } from '../../constants/theme';
import type { PassportCityRank, PassportData } from '../../data/chatTypes';
import { chatRepo, DEMO_ME_ID, isOwnSender, subscribeChat } from '../../lib/chat/repository';
import {
  getCachedPassport,
  setCachedPassport,
} from '../../lib/profile/profileCache';
import { PASSPORT_COUNTRIES } from '../../lib/passport/countries';
import { MAPBOX_TOKEN } from '../../lib/mapConfig';
import { searchPlaces, type PlaceSuggestion } from '../../lib/geocode';
import { CountryBadge } from '../passport/CountryBadge';

const ROW_H = 48;
const PLACEHOLDER_SLOTS = 5;

interface PassportPanelProps {
  userId: string;
  width: number;
  onOpenTrip?: (tripId: string) => void;
}

function medalFor(index: number): { name: keyof typeof Ionicons.glyphMap; color: string } | null {
  if (index === 0) return { name: 'medal', color: '#D4AF37' };
  if (index === 1) return { name: 'medal', color: '#A8A9AD' };
  if (index === 2) return { name: 'medal', color: '#CD7F32' };
  return null;
}

function DraggableCityRow({
  city,
  index,
  isOwn,
  onDragEnd,
  onPress,
}: {
  city: PassportCityRank;
  index: number;
  isOwn: boolean;
  onDragEnd: (from: number, to: number) => void;
  onPress: () => void;
}) {
  const translateY = useSharedValue(0);
  const z = useSharedValue(0);
  const startIndex = useRef(index);
  const medal = medalFor(index);

  const pan = Gesture.Pan()
    .activateAfterLongPress(280)
    .enabled(isOwn)
    .onBegin(() => {
      startIndex.current = index;
      z.value = 10;
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const delta = Math.round(e.translationY / ROW_H);
      const to = Math.max(0, startIndex.current + delta);
      translateY.value = withSpring(0);
      z.value = 0;
      if (to !== startIndex.current) {
        runOnJS(onDragEnd)(startIndex.current, to);
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    zIndex: z.value,
    elevation: z.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.cityRow, animStyle]}>
        <Pressable style={styles.cityPill} onPress={onPress}>
          {medal ? (
            <Ionicons name={medal.name} size={16} color={medal.color} />
          ) : (
            <Text style={styles.rankNum}>{index + 1}</Text>
          )}
          <Text style={styles.cityName} numberOfLines={1}>
            {city.cityName}
          </Text>
          {isOwn ? (
            <Ionicons name="menu" size={14} color={colors.textMuted} />
          ) : null}
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export function PassportPanel({
  userId,
  width,
  onOpenTrip,
}: PassportPanelProps) {
  const [data, setData] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState(DEMO_ME_ID);
  const [adding, setAdding] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  const isOwn = isOwnSender(userId, meId);
  const leftW = Math.floor(width * 0.48);
  const rightW = width - leftW - 8;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    const cached = getCachedPassport(userId);
    if (cached) {
      setData(cached);
      if (!silent) setLoading(false);
    } else if (!silent) {
      setLoading(true);
    }
    try {
      const me = await chatRepo.getMe();
      setMeId(me.id);
      const passport = await chatRepo.getPassport(userId);
      setCachedPassport(userId, passport);
      setData(passport);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const cached = getCachedPassport(userId);
    if (cached) {
      setData(cached);
      setLoading(false);
      void load({ silent: true });
    } else {
      void load();
    }
    return subscribeChat(() => {
      void load({ silent: true });
    });
  }, [load, userId]);

  useEffect(() => {
    if (!adding) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const results = await searchPlaces(q, MAPBOX_TOKEN);
          if (!cancelled) setHits(results.slice(0, 6));
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, adding]);

  const unlockedKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of data?.unlocks ?? []) {
      map.set(u.countryKey, u.unlockedAt);
    }
    return map;
  }, [data?.unlocks]);

  const sortedBadges = useMemo(() => {
    const unlocked = PASSPORT_COUNTRIES.filter((c) => unlockedKeys.has(c.key)).sort(
      (a, b) => {
        const ta = unlockedKeys.get(a.key) ?? '';
        const tb = unlockedKeys.get(b.key) ?? '';
        return tb.localeCompare(ta);
      },
    );
    const locked = PASSPORT_COUNTRIES.filter((c) => !unlockedKeys.has(c.key));
    return [...unlocked, ...locked];
  }, [unlockedKeys]);

  const cities = data?.cities ?? [];

  const onDragEnd = async (from: number, to: number) => {
    if (from === to || !isOwn) return;
    const next = [...cities];
    const [item] = next.splice(from, 1);
    next.splice(Math.min(to, next.length), 0, item);
    const reordered = next.map((c, i) => ({ ...c, sortOrder: i }));
    setData((d) => (d ? { ...d, cities: reordered } : d));
    try {
      await chatRepo.reorderPassportCities(reordered.map((c) => c.id));
    } catch {
      void load();
    }
  };

  const onAddPlace = async (place: PlaceSuggestion) => {
    try {
      await chatRepo.addPassportCity({
        cityName: place.cityName,
        countryName: place.countryName ?? '',
        latitude: place.latitude,
        longitude: place.longitude,
      });
      setAdding(false);
      setQuery('');
      setHits([]);
      await load();
    } catch {
      // keep sheet open
    }
  };

  if (loading && !data) {
    return (
      <View style={[styles.root, { width, minHeight: 280 }]}>
        <ActivityIndicator color={colors.programBlue} />
      </View>
    );
  }

  const badgeColW = (leftW - 8) / 2;

  return (
    <View style={[styles.root, { width }]}>
      {/* Left — country badges */}
      <ScrollView
        style={{ width: leftW }}
        contentContainerStyle={styles.badgeGrid}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <Text style={styles.colLabel}>Stamps</Text>
        <View style={styles.badgeWrap}>
          {sortedBadges.map((c) => {
            const unlocked = unlockedKeys.has(c.key);
            return (
              <View
                key={c.key}
                style={[styles.badgeCell, { width: badgeColW }]}
              >
                <CountryBadge country={c} unlocked={unlocked} size={48} />
                <Text
                  style={[styles.badgeName, !unlocked && styles.badgeNameOff]}
                  numberOfLines={1}
                >
                  {c.name}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Right — city ranking */}
      <View style={[styles.rightCol, { width: rightW }]}>
        <Text style={styles.colLabel}>Cities ranking</Text>
        <ScrollView
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {cities.map((city, i) => (
            <DraggableCityRow
              key={city.id}
              city={city}
              index={i}
              isOwn={isOwn}
              onDragEnd={onDragEnd}
              onPress={() => {
                if (city.tripId) onOpenTrip?.(city.tripId);
              }}
            />
          ))}
          {Array.from({ length: PLACEHOLDER_SLOTS }).map((_, i) => (
            <View key={`ph-${i}`} style={styles.placeholderPill} />
          ))}

          {isOwn ? (
            adding ? (
              <View style={styles.addBox}>
                <View style={styles.searchRow}>
                  <Ionicons name="search" size={16} color={colors.programBlue} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search a city…"
                    placeholderTextColor={colors.textMuted}
                    value={query}
                    onChangeText={setQuery}
                    autoFocus
                  />
                  {searching ? (
                    <ActivityIndicator size="small" color={colors.openJoin} />
                  ) : (
                    <Pressable onPress={() => setAdding(false)} hitSlop={8}>
                      <Ionicons name="close" size={18} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
                {hits.map((h) => (
                  <Pressable
                    key={h.id}
                    style={styles.hitRow}
                    onPress={() => void onAddPlace(h)}
                  >
                    <Ionicons name="location" size={14} color={colors.openJoin} />
                    <Text style={styles.hitText} numberOfLines={1}>
                      {h.cityName}
                      {h.countryName ? `, ${h.countryName}` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.addRowWrap}>
                {infoOpen ? (
                  <View style={styles.infoPop}>
                    <View style={styles.infoPopHeader}>
                      <Text style={styles.infoPopTitle}>Cities ranking</Text>
                      <Pressable
                        onPress={() => setInfoOpen(false)}
                        hitSlop={8}
                        accessibilityLabel="Close"
                      >
                        <Ionicons
                          name="close"
                          size={16}
                          color={colors.textMuted}
                        />
                      </Pressable>
                    </View>
                    <Text style={styles.infoPopBody}>
                      Cities from trips you’ve locked in (Upcoming) show up here
                      automatically — your host city is always included. Add more
                      manually anytime, then long-press and drag to reorder your
                      ranking.
                    </Text>
                    <View style={styles.infoPopArrow} />
                  </View>
                ) : null}
                <View style={styles.addRow}>
                  <Pressable
                    style={styles.addBtn}
                    onPress={() => {
                      setInfoOpen(false);
                      setAdding(true);
                    }}
                  >
                    <Ionicons name="add" size={18} color={colors.white} />
                    <Text style={styles.addBtnText}>Add city manually</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.infoBtn, infoOpen && styles.infoBtnActive]}
                    hitSlop={8}
                    onPress={() => setInfoOpen((v) => !v)}
                    accessibilityLabel="How cities ranking works"
                  >
                    <Ionicons
                      name={
                        infoOpen
                          ? 'information-circle'
                          : 'information-circle-outline'
                      }
                      size={22}
                      color={colors.programBlue}
                    />
                  </Pressable>
                </View>
              </View>
            )
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
    minHeight: 360,
  },
  colLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    color: colors.openJoin,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  badgeGrid: { paddingBottom: 24 },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badgeCell: {
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  badgeName: {
    marginTop: 4,
    fontFamily: fonts.bold,
    fontSize: 9,
    color: colors.black,
    textAlign: 'center',
    width: '100%',
  },
  badgeNameOff: { color: colors.textMuted },
  rightCol: { flexShrink: 0 },
  cityRow: {
    height: ROW_H,
    justifyContent: 'center',
    marginBottom: 6,
  },
  cityPill: {
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    shadowColor: colors.brandTeal,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  rankNum: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textMuted,
    width: 16,
    textAlign: 'center',
  },
  cityName: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.black,
  },
  placeholderPill: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D5DCE8',
    backgroundColor: 'rgba(247,250,255,0.8)',
    marginBottom: 6,
  },
  addRowWrap: {
    marginTop: 8,
    position: 'relative',
    zIndex: 5,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.programBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  addBtnText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 12,
  },
  infoBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandMint,
  },
  infoBtnActive: {
    backgroundColor: '#D6E4FF',
  },
  infoPop: {
    marginBottom: 10,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.14)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    shadowColor: colors.brandTeal,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  infoPopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoPopTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.programBlue,
  },
  infoPopBody: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.black,
  },
  infoPopArrow: {
    position: 'absolute',
    right: 12,
    bottom: -6,
    width: 12,
    height: 12,
    backgroundColor: colors.white,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(23,88,100,0.14)',
    transform: [{ rotate: '45deg' }],
  },
  addBox: {
    marginTop: 8,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.1)',
    padding: 8,
    gap: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandMint,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'web' ? 8 : 6,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.black,
  },
  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  hitText: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.black,
  },
});
