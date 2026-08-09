import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile, ChatTrip } from '../../data/chatTypes';
import { chatRepo, initChat } from '../../lib/chat/repository';
import { searchPlaces, type PlaceSuggestion } from '../../lib/geocode';
import { MAPBOX_TOKEN } from '../../lib/mapConfig';
import { shortWeekdayRange, toLocalISODate } from '../../lib/trips/dates';
import { Avatar } from '../common/Avatar';
import { PHONE_SAFE_INSETS } from '../layout/PhoneShell';
import { CalendarRangeModal } from './CalendarRangeModal';
import DestinationMapPreview from './DestinationMapPreview';

interface CreateTripScreenProps {
  onClose: () => void;
  onCreated: (trip: ChatTrip) => void;
}

async function copyText(text: string) {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

export function CreateTripScreen({ onClose, onCreated }: CreateTripScreenProps) {
  const insets = useSafeAreaInsets();
  const topPad =
    (insets.top > 0 ? insets.top : Platform.OS === 'web' ? PHONE_SAFE_INSETS.top : 12) +
    6;

  const [cityQuery, setCityQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [selected, setSelected] = useState<PlaceSuggestion | null>(null);
  const [searching, setSearching] = useState(false);

  const [dateStart, setDateStart] = useState<Date | null>(null);
  const [dateEnd, setDateEnd] = useState<Date | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [inviteQuery, setInviteQuery] = useState('');
  const [suggestionsPeople, setSuggestionsPeople] = useState<ChatProfile[]>([]);
  const [inviteeIds, setInviteeIds] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [me, setMe] = useState<ChatProfile | null>(null);

  const [openToJoin, setOpenToJoin] = useState(true);
  const [maxMembers, setMaxMembers] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [notifyFriends, setNotifyFriends] = useState(true);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const planeX = useSharedValue(0);
  const planeY = useSharedValue(0);
  const planeOpacity = useSharedValue(1);
  const planeScale = useSharedValue(1);

  useEffect(() => {
    (async () => {
      await initChat();
      const meProfile = await chatRepo.getMe();
      setMe(meProfile);
      setProfiles((p) => ({ ...p, [meProfile.id]: meProfile }));
      const ranked = await chatRepo.suggestTripInvitees();
      setSuggestionsPeople(ranked);
      const map: Record<string, ChatProfile> = { [meProfile.id]: meProfile };
      for (const u of ranked) map[u.id] = u;
      setProfiles((prev) => ({ ...prev, ...map }));
    })();
  }, []);

  useEffect(() => {
    const q = cityQuery.trim();
    if (selected && q === selected.cityName) {
      setSuggestions([]);
      return;
    }
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const hits = await searchPlaces(q, MAPBOX_TOKEN);
      if (!cancelled) {
        setSuggestions(hits);
        setSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cityQuery, selected]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = inviteQuery.trim();
      if (!q) {
        const ranked = await chatRepo.suggestTripInvitees();
        if (!cancelled) {
          setSuggestionsPeople(ranked);
          setProfiles((prev) => {
            const next = { ...prev };
            for (const u of ranked) next[u.id] = u;
            return next;
          });
        }
        return;
      }
      const hits = await chatRepo.searchUsers(q);
      if (!cancelled) {
        setSuggestionsPeople(hits);
        setProfiles((prev) => {
          const next = { ...prev };
          for (const u of hits) next[u.id] = u;
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteQuery]);

  const dateLabel = useMemo(() => {
    if (!dateStart) return 'Select departure & return';
    const end = dateEnd ?? dateStart;
    const range = shortWeekdayRange(
      toLocalISODate(dateStart),
      toLocalISODate(end),
      '',
    );
    const pretty = `${dateStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    return range ? `${range} · ${pretty}` : pretty;
  }, [dateStart, dateEnd]);

  const travelers = useMemo(() => {
    const ids = me ? [me.id, ...inviteeIds] : inviteeIds;
    return ids.map((id) => profiles[id]).filter(Boolean) as ChatProfile[];
  }, [me, inviteeIds, profiles]);

  const toggleInvite = (user: ChatProfile) => {
    setInviteeIds((prev) =>
      prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id],
    );
    setProfiles((p) => ({ ...p, [user.id]: user }));
  };

  const copyLink = useCallback(async () => {
    const token = pendingToken ?? 'preview';
    const link = `abroadster://trip/${token}`;
    const ok = await copyText(link);
    Alert.alert(
      ok ? 'Link copied' : 'Trip link',
      ok
        ? 'Anyone with this link can open the invite in Abroadster.'
        : link,
    );
  }, [pendingToken]);

  const finishCreate = async () => {
    if (!selected) {
      Alert.alert('Pick a destination', 'Search and select the city you’re going to.');
      return;
    }
    if (!dateStart) {
      Alert.alert('Pick dates', 'Choose when you’re leaving and coming back.');
      return;
    }
    setSubmitting(true);
    try {
      const trip = await chatRepo.createTrip({
        destinationCity: selected.cityName,
        destinationCountry: selected.countryName,
        latitude: selected.latitude,
        longitude: selected.longitude,
        dateStart: toLocalISODate(dateStart),
        dateEnd: toLocalISODate(dateEnd ?? dateStart),
        dateLabel: shortWeekdayRange(
          toLocalISODate(dateStart),
          toLocalISODate(dateEnd ?? dateStart),
          '',
        ),
        description: description.trim() || null,
        openToJoin,
        maxMembers,
        inviteeIds,
        notifyFriends,
      });
      setPendingToken(trip.inviteToken ?? trip.id);
      onCreated(trip);
    } catch (e: any) {
      Alert.alert('Couldn’t create trip', e?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onMakeItHappen = () => {
    if (submitting) return;
    planeOpacity.value = 1;
    planeScale.value = 1;
    planeX.value = 0;
    planeY.value = 0;
    planeX.value = withTiming(140, { duration: 520 });
    planeY.value = withTiming(-90, { duration: 520 });
    planeScale.value = withTiming(1.25, { duration: 520 });
    planeOpacity.value = withSequence(
      withTiming(1, { duration: 360 }),
      withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(finishCreate)();
      }),
    );
  };

  const planeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: planeX.value },
      { translateY: planeY.value },
      { scale: planeScale.value },
      { rotate: '-28deg' },
    ],
    opacity: planeOpacity.value,
  }));

  return (
    <View style={styles.root}>
      <View style={[styles.wash, { height: topPad + 120 }]} />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.programBlue} />
        </Pressable>
        <Text style={styles.title}>Create Trip</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionEyebrow}>Where to?</Text>
        <View style={styles.card}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.programBlue} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search a city…"
              placeholderTextColor={colors.textMuted}
              value={cityQuery}
              onChangeText={(t) => {
                setCityQuery(t);
                if (selected && t !== selected.cityName) setSelected(null);
              }}
              autoCorrect={false}
            />
            {searching ? <ActivityIndicator size="small" color={colors.openJoin} /> : null}
          </View>
          {suggestions.length > 0 ? (
            <View style={styles.suggestBox}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.suggestRow}
                  onPress={() => {
                    setSelected(s);
                    setCityQuery(s.cityName);
                    setSuggestions([]);
                  }}
                >
                  <Ionicons name="location-sharp" size={16} color={colors.openJoin} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestTitle}>{s.cityName}</Text>
                    <Text style={styles.suggestSub} numberOfLines={1}>
                      {s.placeName}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
          <DestinationMapPreview
            latitude={selected?.latitude ?? null}
            longitude={selected?.longitude ?? null}
            pinLabel={
              selected
                ? `${selected.cityName}${selected.countryName ? `, ${selected.countryName}` : ''}`
                : undefined
            }
          />
          {selected ? (
            <Text style={styles.pinCaption}>
              Pin dropped on {selected.cityName}
              {selected.countryName ? `, ${selected.countryName}` : ''}
            </Text>
          ) : (
            <Text style={styles.pinCaption}>Type a city — the map follows your pick.</Text>
          )}
        </View>

        <Text style={styles.sectionEyebrow}>When?</Text>
        <Pressable style={styles.cardRow} onPress={() => setCalendarOpen(true)}>
          <MaterialIcons name="calendar-today" size={20} color={colors.programBlue} />
          <Text style={styles.cardRowText}>{dateLabel}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.sectionEyebrow}>Who’s going?</Text>
        <View style={styles.card}>
          {travelers.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.travelerChips}
            >
              {travelers.map((u) => {
                const pending = inviteeIds.includes(u.id);
                return (
                  <View key={u.id} style={styles.chip}>
                    <Avatar source={u.avatar} size={36} />
                    <Text style={styles.chipName} numberOfLines={1}>
                      {u.firstName}
                    </Text>
                    {pending ? (
                      <Text style={styles.chipPending}>Selected</Text>
                    ) : (
                      <Text style={styles.chipYou}>You</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          ) : null}
          <View style={styles.searchRow}>
            <Ionicons name="person-add" size={18} color={colors.programBlue} />
            <TextInput
              style={styles.searchInput}
              placeholder="Invite friends…"
              placeholderTextColor={colors.textMuted}
              value={inviteQuery}
              onChangeText={setInviteQuery}
              autoCorrect={false}
            />
          </View>
          <Text style={styles.hint}>
            Tap Select to add or remove — invites send only when you Create Trip.
          </Text>
          {suggestionsPeople.map((u) => {
            const invited = inviteeIds.includes(u.id);
            return (
              <View key={u.id} style={styles.personRow}>
                <Avatar source={u.avatar} size={44} />
                <View style={styles.personBody}>
                  <Text style={styles.personName}>{u.fullName}</Text>
                  <Text style={styles.personSub} numberOfLines={1}>
                    {u.studyAbroadProgram}
                  </Text>
                </View>
                <Pressable
                  style={[styles.inviteBtn, invited && styles.inviteBtnOn]}
                  onPress={() => toggleInvite(u)}
                >
                  <Text style={[styles.inviteBtnText, invited && styles.inviteBtnTextOn]}>
                    {invited ? 'Selected' : 'Select'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionEyebrow}>Visibility</Text>
        <View style={styles.segment}>
          <Pressable
            style={[styles.segmentItem, openToJoin && styles.segmentOn]}
            onPress={() => setOpenToJoin(true)}
          >
            <Text style={[styles.segmentText, openToJoin && styles.segmentTextOn]}>
              Anyone can request
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentItem, !openToJoin && styles.segmentOn]}
            onPress={() => setOpenToJoin(false)}
          >
            <Text style={[styles.segmentText, !openToJoin && styles.segmentTextOn]}>
              Private
            </Text>
          </Pressable>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="people" size={20} color={colors.programBlue} />
          <Text style={[styles.cardRowText, { flex: 1 }]}>Max travelers (optional)</Text>
          <Pressable
            onPress={() =>
              setMaxMembers((n) => (n == null ? 8 : Math.max(2, n - 1)))
            }
            style={styles.stepper}
          >
            <Ionicons name="remove" size={16} color={colors.black} />
          </Pressable>
          <Text style={styles.stepperValue}>{maxMembers ?? '—'}</Text>
          <Pressable
            onPress={() => setMaxMembers((n) => (n == null ? 4 : Math.min(40, n + 1)))}
            style={styles.stepper}
          >
            <Ionicons name="add" size={16} color={colors.black} />
          </Pressable>
          {maxMembers != null ? (
            <Pressable onPress={() => setMaxMembers(null)} hitSlop={8}>
              <Text style={styles.clearMax}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionEyebrow}>Caption</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.caption}
            placeholder="Optional — what’s the vibe of this trip?"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={280}
          />
        </View>

        <Text style={styles.sectionEyebrow}>Sharing</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Notify my friends</Text>
              <Text style={styles.toggleSub}>Let friends know you’re planning this</Text>
            </View>
            <Switch
              value={notifyFriends}
              onValueChange={setNotifyFriends}
              trackColor={{ false: '#D1D1D6', true: '#34C759' }}
              thumbColor={colors.white}
              ios_backgroundColor="#D1D1D6"
            />
          </View>
          <View style={styles.divider} />
          <Pressable style={styles.toggleRow} onPress={copyLink}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Copy link to trip</Text>
              <Text style={styles.toggleSub}>Share an invite link anywhere</Text>
            </View>
            <Ionicons name="link" size={22} color={colors.openJoin} />
          </Pressable>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.ctaWrap}>
        <Pressable
          style={[styles.cta, submitting && { opacity: 0.7 }]}
          onPress={onMakeItHappen}
          disabled={submitting}
        >
          <Animated.View style={planeStyle}>
            <Ionicons name="airplane" size={22} color={colors.white} />
          </Animated.View>
          <Text style={styles.ctaText}>
            {submitting ? 'Making it happen…' : 'Make it Happen'}
          </Text>
        </Pressable>
      </View>

      <CalendarRangeModal
        visible={calendarOpen}
        start={dateStart}
        end={dateEnd}
        onClose={() => setCalendarOpen(false)}
        onChange={(s, e) => {
          setDateStart(s);
          setDateEnd(e);
          setCalendarOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7FAFF' },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(23,88,100,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.programBlue,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  sectionEyebrow: {
    marginTop: 8,
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.openJoin,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.08)',
    shadowColor: colors.brandTeal,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.brandMint,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.black,
    outlineStyle: 'none' as any,
  },
  suggestBox: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F7FAFF',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE3EE',
  },
  suggestTitle: { fontFamily: fonts.extraBold, fontSize: 14, color: colors.black },
  suggestSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  pinCaption: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.08)',
  },
  cardRowText: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.black,
  },
  travelerChips: { gap: 10, paddingVertical: 2 },
  chip: { width: 64, alignItems: 'center', gap: 2 },
  chipName: { fontFamily: fonts.bold, fontSize: 11, color: colors.black },
  chipPending: { fontFamily: fonts.regular, fontSize: 10, color: colors.statusOrange },
  chipYou: { fontFamily: fonts.regular, fontSize: 10, color: colors.openJoin },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8EEF5',
  },
  personBody: { flex: 1, minWidth: 0 },
  personName: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.black },
  personSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  inviteBtn: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.openJoin,
  },
  inviteBtnOn: { backgroundColor: '#E8F6FC' },
  inviteBtnText: { fontFamily: fonts.bold, fontSize: 11, color: colors.white },
  inviteBtnTextOn: { color: colors.openJoin },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.08)',
  },
  segmentItem: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  segmentOn: { backgroundColor: colors.programBlue },
  segmentText: { fontFamily: fonts.bold, fontSize: 12, color: colors.textMuted },
  segmentTextOn: { color: colors.white },
  stepper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF2F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    minWidth: 24,
    textAlign: 'center',
  },
  clearMax: { fontFamily: fonts.bold, fontSize: 12, color: colors.openJoin },
  caption: {
    minHeight: 72,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.black,
    textAlignVertical: 'top',
    outlineStyle: 'none' as any,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  toggleTitle: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.black },
  toggleSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E0E6F0', marginVertical: 6 },
  ctaWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
  },
  cta: {
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.programBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: colors.programBlue,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  ctaText: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.white,
  },
});
