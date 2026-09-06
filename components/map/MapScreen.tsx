import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet from '@gorhom/bottom-sheet';
import AbroadsterMap from './AbroadsterMap';
import type { MapCamera } from './mapTypes';
import { LocationPill } from './LocationPill';
import { MapControls } from './MapControls';
import { MapDrawer } from './MapDrawer';
import { PersonDetailSheet } from './PersonDetailSheet';
import { GroupMembersSheet } from './GroupMembersSheet';
import { BottomNav } from '../navigation/BottomNav';
import { ProfileModal } from '../profile/ProfileModal';
import { chatRepo, initChat, subscribeChat, allowDemoSeedMerge } from '../../lib/chat/repository';
import type { ChatTrip } from '../../data/chatTypes';
import { computeVisibleMapData } from '../../data/mapQueries';
import { getUserById, allUsers } from '../../data/mockMapData';
import type {
  FilterChip,
  MapLayerFilter,
  MapListItem,
  MapListPersonItem,
  MapListPlaceItem,
  MapListTripItem,
  MapStyleMode,
  ProgramPin,
  TripPin,
  UserProfile,
} from '../../data/types';
import type { LatLngBounds } from '../../lib/geo';
import { reverseGeocodeCity, searchPlaces, type PlaceSuggestion } from '../../lib/geocode';
import { DEFAULT_CENTER, hasMapboxToken, MAPBOX_TOKEN } from '../../lib/mapConfig';
import { resolveMapLocation, scatterAround } from '../../lib/userLocation';
import {
  getCurrentDeviceLocation,
  requestLocationPermission,
  watchDeviceLocation,
} from '../../lib/location/deviceLocation';
import { chatProfileToMapUser } from '../../lib/map/chatProfileToMapUser';
import { resolveTripCoords } from '../../lib/tripCoords';
import { usePhoneTopPad } from '../../lib/layout/safeArea';
import {
  buildDefaultSchoolChips,
  chipFromSchoolLabel,
  findFilterChipForLabel,
  getInstitutionByName,
} from '../../lib/schools/catalog';
import {
  matchesHomeUniversity,
  matchesStudyProgram,
} from '../../lib/schools/matchSchool';
import { schoolMapTarget } from '../../lib/schoolMapTarget';
import { colors, fonts } from '../../constants/theme';

function friendMatchesChip(u: UserProfile, chip: FilterChip): boolean {
  if (chip.type === 'program') {
    return matchesStudyProgram(u.studyAbroadProgram || '', chip.label);
  }
  return matchesHomeUniversity(u.homeUniversity || '', chip.label);
}

const INITIAL_BOUNDS: LatLngBounds = {
  west: 2.25,
  south: 48.8,
  east: 2.45,
  north: 48.91,
};

interface MapScreenProps {
  hideBottomNav?: boolean;
  onMessageUser?: (userId: string) => void;
  onOpenProfile?: (user: UserProfile) => void;
  onCreateTrip?: () => void;
  /** Open the full trip album / detail screen (pullout trip taps). */
  onOpenTrip?: (tripId: string) => void;
  /** When set, fly the map camera to this point (e.g. from a feed location tap). */
  focusTarget?: MapCamera | null;
  onConsumedFocusTarget?: () => void;
  /** Increment to reorient the map to the user's current location (nav retap). */
  recenterNonce?: number;
  /** Increment to reset drawer filters to friends + recenter (map tab retap). */
  resetNonce?: number;
  /** Profile school pill → apply home/abroad filter (camera handled separately). */
  schoolNav?: { kind: 'home' | 'abroad'; label: string } | null;
  onConsumedSchoolNav?: () => void;
  /** False when map tab is hidden — pause marker sync work. */
  mapActive?: boolean;
  /** First post-signup map: Europe zoom + home university filter once. */
  firstMapOnboarding?: boolean;
  onConsumedFirstMapOnboarding?: () => void;
}

function feedFingerprint(feed: ChatTrip[]): string {
  return feed
    .map(
      (t) =>
        `${t.id}:${t.status}:${t.openToJoin ? 1 : 0}:${t.memberIds.join(',')}:${t.latitude ?? ''}:${t.longitude ?? ''}:${t.destinationCity}`,
    )
    .join('|');
}

async function chatTripsToPins(feed: ChatTrip[]): Promise<TripPin[]> {
  const token = hasMapboxToken ? MAPBOX_TOKEN : undefined;
  const memberIds = [
    ...new Set(feed.flatMap((t) => t.memberIds.slice(0, 4))),
  ];
  const profiles = await Promise.all(
    memberIds.map((id) => chatRepo.getProfile(id)),
  );
  const profileById = new Map(
    profiles.filter(Boolean).map((p) => [p!.id, p!]),
  );

  const pins: TripPin[] = [];
  for (const t of feed) {
    const coords = await resolveTripCoords(
      t.destinationCity,
      t.destinationCountry,
      t.latitude,
      t.longitude,
      token,
    );
    if (!coords) continue;
    const members = t.memberIds
      .slice(0, 4)
      .map((id) => profileById.get(id))
      .filter(Boolean)
      .map((p) => ({
        userId: p!.id,
        firstName: p!.firstName,
        avatar: p!.avatar,
      }));
    pins.push({
      id: t.id,
      memberIds: t.memberIds,
      members,
      status: t.status,
      openToJoin: t.openToJoin,
      destinationCity: t.destinationCity,
      destinationCountry: t.destinationCountry,
      latitude: coords.latitude,
      longitude: coords.longitude,
      dateLabel:
        t.dateLabel ||
        `Visiting ${t.destinationCity}${t.dateStart ? ` ${t.dateStart}` : ''}`,
      dateStart: t.dateStart ?? undefined,
      dateEnd: t.dateEnd ?? undefined,
    });
  }
  return pins;
}

function validGps(
  lat: number | null | undefined,
  lng: number | null | undefined,
): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

/** Keep the signed-in user on device GPS — never a study-program city. */
function pinMeAtDeviceGps(
  me: UserProfile,
  gps: { latitude: number; longitude: number } | null,
  gpsLabel?: string | null,
): UserProfile {
  if (!gps || !validGps(gps.latitude, gps.longitude)) {
    return { ...me, isCurrentUser: true, isFriend: true };
  }
  return {
    ...me,
    isCurrentUser: true,
    isFriend: true,
    locationPrivacy: 'exact',
    liveLatitude: gps.latitude,
    liveLongitude: gps.longitude,
    latitude: gps.latitude,
    longitude: gps.longitude,
    locationLabel: gpsLabel
      ? gpsLabel
      : gps
        ? me.locationPrivacy === 'exact' && me.liveLatitude != null
          ? me.locationLabel
          : 'Current location'
        : me.locationLabel,
  };
}

function mergeLiveMeIntoPeople(
  people: UserProfile[],
  me: UserProfile | undefined,
  gps: { latitude: number; longitude: number } | null,
  gpsLabel?: string | null,
): UserProfile[] {
  const others = people.filter((u) => !u.isCurrentUser && u.id !== me?.id);
  if (!me) return others;
  return [pinMeAtDeviceGps(me, gps, gpsLabel), ...others];
}

export function MapScreen({
  hideBottomNav = false,
  onMessageUser,
  onOpenProfile,
  onCreateTrip,
  onOpenTrip,
  focusTarget = null,
  onConsumedFocusTarget,
  recenterNonce = 0,
  resetNonce = 0,
  schoolNav = null,
  onConsumedSchoolNav,
  mapActive = true,
  firstMapOnboarding = false,
  onConsumedFirstMapOnboarding,
}: MapScreenProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const topInset = usePhoneTopPad(10);

  const [styleMode, setStyleMode] = useState<MapStyleMode>('regular');
  const [layerFilter, setLayerFilter] = useState<MapLayerFilter>('all');
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('abroadster.mapStyleMode');
        if (
          !cancelled &&
          (saved === 'regular' || saved === 'satellite')
        ) {
          setStyleMode(saved);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleStyleMode = useCallback(() => {
    setStyleMode((m) => {
      const next = m === 'regular' ? 'satellite' : 'regular';
      void AsyncStorage.setItem('abroadster.mapStyleMode', next).catch(() => {});
      return next;
    });
  }, []);

  const [center, setCenter] = useState({
    latitude: DEFAULT_CENTER.latitude,
    longitude: DEFAULT_CENTER.longitude,
  });
  const [bounds, setBounds] = useState<LatLngBounds>(INITIAL_BOUNDS);
  const [cityName, setCityName] = useState('Paris');
  const [countryName, setCountryName] = useState('France');

  const [selectedFilterIds, setSelectedFilterIds] = useState<string[]>([]);
  /** Default: user's abroad program + home uni; search can add more. */
  const [barChips, setBarChips] = useState<FilterChip[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [placeHits, setPlaceHits] = useState<PlaceSuggestion[]>([]);
  const [remotePeople, setRemotePeople] = useState<UserProfile[]>([]);
  const [searchPin, setSearchPin] = useState<{
    latitude: number;
    longitude: number;
    label?: string;
  } | null>(null);

  const [flyTo, setFlyTo] = useState<MapCamera | null>(null);
  /** Live GPS when Exact privacy / permission granted; else host city. */
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const userLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  /** Only written by the device GPS APIs — never host/program coordinates. */
  const deviceGpsRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const gpsLabelRef = useRef<string | null>(null);
  const hostPinRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const locationPrivacyRef = useRef<'exact' | 'city' | 'hidden'>('city');
  const didCenterOnMeRef = useRef(false);

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showPersonSheet, setShowPersonSheet] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<TripPin | null>(null);
  const [showGroupSheet, setShowGroupSheet] = useState(false);
  const [profileUser, setProfileUser] = useState<UserProfile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'messages' | 'trips' | 'map' | 'profile'>('map');
  const [extraTrips, setExtraTrips] = useState<TripPin[]>([]);
  const [friendIds, setFriendIds] = useState<string[] | null>(null);
  const [mutualFriendIds, setMutualFriendIds] = useState<string[] | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [friendPeople, setFriendPeople] = useState<UserProfile[]>([]);
  /** All located Abroadster profiles (for nearby student counts). */
  const [rosterPeople, setRosterPeople] = useState<UserProfile[]>([]);
  /** Backend-accurate total for the active school/program chip. */
  const [schoolFilterTotal, setSchoolFilterTotal] = useState<number | null>(
    null,
  );
  /** Authoritative student roster for the active school chip (from Supabase). */
  const [schoolFilterCohort, setSchoolFilterCohort] = useState<
    UserProfile[] | null
  >(null);
  const [searchFocusNonce, setSearchFocusNonce] = useState(0);
  const defaultChipIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!focusTarget) return;
    setFlyTo(focusTarget);
    setCenter({
      latitude: focusTarget.latitude,
      longitude: focusTarget.longitude,
    });
    // Clear after applying so the same place can be re-tapped later
    const id = setTimeout(() => onConsumedFocusTarget?.(), 0);
    return () => clearTimeout(id);
    // intentionally omit onConsumedFocusTarget (unstable inline from AppShell)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  // Recenter only (e.g. home-school nav) — does not clear school filters
  useEffect(() => {
    if (!recenterNonce) return;
    const target = userLocationRef.current ?? userLocation;
    if (!target) return;
    setFlyTo({ ...target, zoom: 12.5 });
    setCenter(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterNonce]);

  // Map tab retap → back to friends (no school filter) + account profile pin
  useEffect(() => {
    if (!resetNonce) return;
    setSelectedFilterIds([]);
    setLayerFilter('all');
    setShowLayerMenu(false);
    setSchoolFilterTotal(null);
    setSchoolFilterCohort(null);
    const target = userLocationRef.current ?? userLocation;
    if (!target) return;
    setFlyTo({ ...target, zoom: 12.5 });
    setCenter(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce]);

  // Profile school pills: home = filter by US school; abroad = that program (everyone in it)
  useEffect(() => {
    if (!schoolNav) return;
    const type = schoolNav.kind === 'home' ? 'university' : 'program';
    const chip = findFilterChipForLabel(schoolNav.label, type);
    if (chip) {
      setBarChips((prev) => {
        if (prev.some((c) => c.id === chip.id)) return prev;
        return [chip, ...prev];
      });
      setSelectedFilterIds([chip.id]);
      sheetRef.current?.snapToIndex(2);
    } else if (schoolNav.kind === 'abroad') {
      // Drop US-school filters so the program pin isn't gated by home uni
      setSelectedFilterIds((prev) =>
        prev.filter((id) => {
          const c = barChips.find((x) => x.id === id);
          return c?.type === 'program';
        }),
      );
    }
    const id = setTimeout(() => onConsumedSchoolNav?.(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolNav]);

  // Post-signup: Europe overview + home university filter (once)
  useEffect(() => {
    if (!firstMapOnboarding) return;
    let cancelled = false;
    (async () => {
      try {
        await initChat();
        const me = await chatRepo.getMe();
        if (cancelled) return;
        const homeLabel = (me.homeUniversity || '').trim();
        if (homeLabel) {
          const chip =
            findFilterChipForLabel(homeLabel, 'university') ||
            chipFromSchoolLabel(homeLabel, 'university');
          if (chip) {
            promoteSchoolChip(chip);
          }
        }
        // Keep camera on this account's profile pin (set by home-location effect).
        sheetRef.current?.snapToIndex(2);
        try {
          await chatRepo.updateMySettings({
            onboarding: { first_map_done: true },
          });
        } catch {
          // ignore
        }
      } finally {
        if (!cancelled) onConsumedFirstMapOnboarding?.();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstMapOnboarding]);

  useEffect(() => {
    let unsub = () => {};
    let lastFp = '';
    (async () => {
      await initChat();
      const loadMeChips = async () => {
        try {
          const me = await chatRepo.getMe();
          const defaults = buildDefaultSchoolChips({
            homeUniversity: me.homeUniversity,
            studyAbroadProgram: me.studyAbroadProgram,
          });
          const defaultIds = new Set(defaults.map((c) => c.id));
          setBarChips((prev) => {
            const prevDefaultIds = defaultChipIdsRef.current;
            const extras = prev.filter(
              (c) => !prevDefaultIds.has(c.id) && !defaultIds.has(c.id),
            );
            defaultChipIdsRef.current = defaultIds;
            return [...defaults, ...extras];
          });
        } catch {
          // leave bar empty until profile loads
        }
      };
      const load = async () => {
        const feed = await chatRepo.listTripsFeed();
        const fp = feedFingerprint(feed);
        if (fp === lastFp) return;
        lastFp = fp;
        setExtraTrips(await chatTripsToPins(feed));
      };
      const loadFriends = async () => {
        try {
          const me = await chatRepo.getMe();
          setMeId(me.id);
          const [ids, mutualIds] = await Promise.all([
            chatRepo.getFriendIds(),
            chatRepo.getMutualFriendIds(),
          ]);
          setFriendIds(ids);
          setMutualFriendIds(mutualIds);
          const friendSet = new Set(ids);
          const mutualSet = new Set(mutualIds);
          const { chatProfileToMapUser } = await import(
            '../../lib/map/chatProfileToMapUser'
          );

          // Full roster for "students nearby"; always include me as a profile pin
          let roster: UserProfile[] = [];
          try {
            const profiles = await chatRepo.listProfiles();
            roster = profiles
              .map((p) =>
                chatProfileToMapUser(p, {
                  isFriend: mutualSet.has(p.id) || p.id === me.id,
                  isCurrentUser: p.id === me.id,
                }),
              )
              .filter(Boolean) as UserProfile[];
          } catch {
            roster = [];
          }

          const byId = new Map(roster.map((u) => [u.id, u]));
          if (!byId.has(me.id)) {
            const mePin = chatProfileToMapUser(me, {
              isFriend: true,
              isCurrentUser: true,
            });
            if (mePin) byId.set(me.id, mePin);
          }

          const mePin = byId.get(me.id);
          if (mePin) {
            const gps = deviceGpsRef.current;
            const liveMe = pinMeAtDeviceGps(mePin, gps, gpsLabelRef.current);
            byId.set(me.id, liveMe);
            const home = {
              latitude: mePin.latitude,
              longitude: mePin.longitude,
            };
            hostPinRef.current = home;
            if (gps) {
              userLocationRef.current = gps;
              setUserLocation(gps);
            } else if (!userLocationRef.current) {
              userLocationRef.current = home;
              setUserLocation(home);
            }
            // First open: GPS if we already have it, otherwise the profile pin
            if (!didCenterOnMeRef.current) {
              didCenterOnMeRef.current = true;
              const start = gps ?? home;
              setCenter(start);
              setFlyTo({ ...start, zoom: 12.5 });
            }
          }

          await Promise.all(
            ids.map(async (id) => {
              if (byId.has(id)) return;
              const p = await chatRepo.getProfile(id);
              if (!p) return;
              const pin = chatProfileToMapUser(p, { isFriend: true });
              if (pin) byId.set(id, pin);
            }),
          );
          const people = [...byId.values()];
          setRosterPeople(people);
          setFriendPeople(people.filter((u) => u.isFriend || u.isCurrentUser));
        } catch {
          // map still works with seed friends
        }
      };
      await loadMeChips();
      await load();
      await loadFriends();
      unsub = subscribeChat(() => {
        void loadMeChips();
        void load();
        void loadFriends();
      });
    })();
    return () => unsub();
  }, []);

  // Unified search: places (cities/countries) + AirMail-style people who can appear on the map
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setPlaceHits([]);
      setRemotePeople([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const [places, users] = await Promise.all([
          searchPlaces(q, hasMapboxToken ? MAPBOX_TOKEN : undefined),
          chatRepo.searchUsers(q),
        ]);
        if (cancelled) return;
        setPlaceHits(places);

        const mapVisible: UserProfile[] = [];
        const seen = new Set<string>();
        const { chatProfileToMapUser } = await import(
          '../../lib/map/chatProfileToMapUser'
        );
        for (const hit of users) {
          if (seen.has(hit.id) || hit.id === 'user-me') continue;
          const fromRoster = rosterPeople.find((u) => u.id === hit.id);
          const fromFriends = friendPeople.find((u) => u.id === hit.id);
          const local =
            fromRoster ??
            fromFriends ??
            getUserById(hit.id) ??
            allUsers.find(
              (u) =>
                u.fullName.toLowerCase() === hit.fullName.toLowerCase() ||
                (u.firstName.toLowerCase() === hit.firstName.toLowerCase() &&
                  u.lastName.toLowerCase() === hit.lastName.toLowerCase()),
            ) ??
            chatProfileToMapUser(hit, {
              isFriend: (mutualFriendIds ?? friendIds ?? []).includes(hit.id),
            });
          if (!local) continue;
          const located = resolveMapLocation(local);
          if (!located) continue;
          seen.add(local.id);
          mapVisible.push({
            ...local,
            latitude: located.latitude,
            longitude: located.longitude,
            locationLabel: located.locationLabel,
          });
        }
        setRemotePeople(mapVisible);
      } catch {
        if (!cancelled) {
          setPlaceHits([]);
          setRemotePeople([]);
        }
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery, rosterPeople, friendPeople, friendIds, mutualFriendIds]);

  // Clear place pin when search is cleared
  useEffect(() => {
    if (!searchQuery.trim()) setSearchPin(null);
  }, [searchQuery]);

  // When embedded in AppShell, profile is owned by the shell
  const openProfile = (user: UserProfile | null) => {
    if (!user) return;
    if (onOpenProfile) {
      onOpenProfile(user);
      return;
    }
    setProfileUser(user);
    setShowProfile(true);
  };

  const selectedFilters = useMemo(
    () => barChips.filter((c) => selectedFilterIds.includes(c.id)),
    [barChips, selectedFilterIds],
  );

  /** Chips with live Abroadster student counts for pill subtitles */
  const chipsWithFriends = useMemo(() => {
    const people =
      rosterPeople.length > 0
        ? rosterPeople
        : allowDemoSeedMerge()
          ? allUsers
          : friendPeople;
    return barChips.map((chip) => {
      const selected =
        selectedFilterIds.includes(chip.id) && schoolFilterTotal != null;
      const count = selected
        ? schoolFilterTotal!
        : people.filter((u) => friendMatchesChip(u, chip)).length;
      return {
        ...chip,
        subtitle:
          count > 0
            ? `${count} student${count === 1 ? '' : 's'} on Abroadster`
            : 'No students on Abroadster yet',
      };
    });
  }, [barChips, rosterPeople, friendPeople, selectedFilterIds, schoolFilterTotal]);

  const promoteSchoolChip = useCallback(
    (chip: FilterChip) => {
      setBarChips((prev) => {
        if (prev.some((c) => c.id === chip.id)) {
          return [chip, ...prev.filter((c) => c.id !== chip.id)];
        }
        return [chip, ...prev];
      });
      setSelectedFilterIds([chip.id]);
      if (chip.type === 'program') {
        const target = schoolMapTarget(chip.label);
        if (target) {
          setFlyTo(target);
          setCenter({ latitude: target.latitude, longitude: target.longitude });
        }
      }
    },
    [],
  );

  // When a school/program chip is selected: load ALL students at that school
  // from the backend (not friends-only) and show the accurate total up top.
  useEffect(() => {
    if (selectedFilters.length === 0) {
      setSchoolFilterTotal(null);
      setSchoolFilterCohort(null);
      return;
    }
    const chip = selectedFilters[0];
    let cancelled = false;
    (async () => {
      try {
        const me = await chatRepo.getMe();
        const ids = friendIds ?? (await chatRepo.getFriendIds());
        const mutual =
          mutualFriendIds ?? (await chatRepo.getMutualFriendIds());
        const friendSet = new Set(ids);
        const mutualSet = new Set(mutual);
        const { profiles, total } = await chatRepo.listStudentsAtSchool({
          kind: chip.type,
          label: chip.label,
        });
        if (cancelled) return;
        setSchoolFilterTotal(total);

        const { chatProfileToMapUser } = await import(
          '../../lib/map/chatProfileToMapUser'
        );
        const cam = schoolMapTarget(chip.label);
        const gps = deviceGpsRef.current;
        const mapped: UserProfile[] = [];
        let backendMe: UserProfile | null = null;
        for (const p of profiles) {
          // Double-check client-side so a loose backend match can't leak through
          const belongs =
            chip.type === 'program'
              ? matchesStudyProgram(p.studyAbroadProgram || '', chip.label)
              : matchesHomeUniversity(p.homeUniversity || '', chip.label);
          if (!belongs) continue;

          const isMe = p.id === me.id;
          let pin = chatProfileToMapUser(p, {
            isFriend: mutualSet.has(p.id) || isMe,
            isCurrentUser: isMe,
            ...(isMe && gps
              ? { liveLat: gps.latitude, liveLng: gps.longitude }
              : {}),
          });
          if (!pin && cam) {
            // Never invent a school-centered pin for the signed-in user.
            if (isMe) continue;
            const jittered = scatterAround(
              cam.latitude,
              cam.longitude,
              p.id,
              1.0,
            );
            pin = chatProfileToMapUser(
              {
                ...p,
                hostLatitude: jittered.latitude,
                hostLongitude: jittered.longitude,
                hostCity: p.hostCity || chip.label,
              },
              {
                isFriend: friendSet.has(p.id),
                isCurrentUser: false,
              },
            );
          }
          if (!pin) continue;
          if (isMe) {
            backendMe = pin;
            continue;
          }
          mapped.push(pin);
        }

        const liveMe =
          backendMe ||
          rosterPeople.find((u) => u.isCurrentUser || u.id === me.id) ||
          friendPeople.find((u) => u.isCurrentUser || u.id === me.id) ||
          chatProfileToMapUser(me, { isFriend: true, isCurrentUser: true });
        const cohort = mergeLiveMeIntoPeople(
          mapped,
          liveMe ?? undefined,
          gps,
          gpsLabelRef.current,
        );

        setSchoolFilterCohort(cohort);
        setSchoolFilterTotal(mapped.length + (backendMe ? 1 : 0));
        setRosterPeople((prev) => {
          const byId = new Map(prev.map((u) => [u.id, u]));
          for (const u of mapped) byId.set(u.id, u);
          const prevMe = prev.find((u) => u.isCurrentUser);
          const nextMe = prevMe || liveMe;
          if (nextMe) {
            byId.set(
              nextMe.id,
              pinMeAtDeviceGps(nextMe, gps, gpsLabelRef.current),
            );
          }
          return [...byId.values()];
        });
        sheetRef.current?.snapToIndex(2);
      } catch {
        if (!cancelled) {
          const people = rosterPeople.length > 0 ? rosterPeople : friendPeople;
          const matched = people.filter((u) => friendMatchesChip(u, chip));
          setSchoolFilterCohort(matched);
          setSchoolFilterTotal(matched.length);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilters, friendIds]);

  const visible = useMemo(
    () =>
      computeVisibleMapData({
        centerLat: center.latitude,
        centerLng: center.longitude,
        bounds,
        cityName,
        countryName,
        layerFilter,
        selectedFilters,
        searchQuery,
        extraTrips,
        // School filter: ONLY the verified cohort for that school (not the full roster)
        extraPeople:
          selectedFilters.length > 0
            ? mergeLiveMeIntoPeople(
                schoolFilterCohort ?? [],
                rosterPeople.find((u) => u.isCurrentUser) ||
                  friendPeople.find((u) => u.isCurrentUser),
                deviceGpsRef.current,
                gpsLabelRef.current,
              )
            : rosterPeople.length > 0
              ? rosterPeople
              : friendPeople,
        friendIds: friendIds ?? undefined,
        mutualFriendIds: mutualFriendIds ?? undefined,
        currentUserId: meId ?? undefined,
      }),
    [
      center.latitude,
      center.longitude,
      bounds,
      cityName,
      countryName,
      layerFilter,
      selectedFilters,
      searchQuery,
      extraTrips,
      rosterPeople,
      friendPeople,
      friendIds,
      mutualFriendIds,
      meId,
      schoolFilterCohort,
    ],
  );

  // Reverse geocode as map moves
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const result = await reverseGeocodeCity(
        center.latitude,
        center.longitude,
        hasMapboxToken ? MAPBOX_TOKEN : undefined,
      );
      if (!cancelled) {
        setCityName(result.cityName);
        setCountryName(result.countryName);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [center.latitude, center.longitude]);

  // Center on this account's profile pin from the backend (host city / program).
  // When Exact privacy + GPS permission, continuous watch updates the me pin.
  useEffect(() => {
    let cancelled = false;
    let sub: { remove: () => void } | null = null;
    (async () => {
      try {
        await initChat();
        const me = await chatRepo.getMe();
        if (cancelled) return;
        const mePin = chatProfileToMapUser(me, {
          isFriend: true,
          isCurrentUser: true,
        });
        if (!mePin || cancelled) return;

        const home = {
          latitude: mePin.latitude,
          longitude: mePin.longitude,
        };
        hostPinRef.current = home;
        if (!deviceGpsRef.current && !userLocationRef.current) {
          userLocationRef.current = home;
          setUserLocation(home);
        }
        locationPrivacyRef.current = mePin.locationPrivacy ?? 'city';

        if (!didCenterOnMeRef.current && !deviceGpsRef.current) {
          didCenterOnMeRef.current = true;
          setCenter(home);
          setFlyTo({ ...home, zoom: 12.5 });
        }

        const seedMe = pinMeAtDeviceGps(
          mePin,
          locationPrivacyRef.current === 'exact' ? deviceGpsRef.current : null,
          gpsLabelRef.current,
        );
        setRosterPeople((prev) => {
          const others = prev.filter((u) => u.id !== me.id);
          return [seedMe, ...others];
        });
        setFriendPeople((prev) => {
          const others = prev.filter((u) => u.id !== me.id);
          return [seedMe, ...others];
        });

        const granted = await requestLocationPermission();
        if (cancelled || !granted) return;

        // Respect Settings → location privacy (do not force exact just because OS allowed GPS)
        if (locationPrivacyRef.current !== 'exact') return;
        const firstFix = await getCurrentDeviceLocation();
        if (cancelled) return;

        const applyGps = (
          next: { latitude: number; longitude: number },
          label?: string,
        ) => {
          deviceGpsRef.current = next;
          userLocationRef.current = next;
          setUserLocation(next);
          if (label) gpsLabelRef.current = label;
          const patch = (u: UserProfile) =>
            u.isCurrentUser
              ? pinMeAtDeviceGps(u, next, label || gpsLabelRef.current)
              : u;
          setRosterPeople((prev) => prev.map(patch));
          setFriendPeople((prev) => prev.map(patch));
          setSchoolFilterCohort((prev) =>
            prev && prev.length > 0 ? prev.map(patch) : prev,
          );
        };

        if (firstFix) {
          applyGps({
            latitude: firstFix.latitude,
            longitude: firstFix.longitude,
          });
          if (!didCenterOnMeRef.current) {
            didCenterOnMeRef.current = true;
            setCenter(firstFix);
            setFlyTo({ ...firstFix, zoom: 12.5 });
          }
        }

        let lastPublishAt = 0;
        let lastPublishLabel = '';
        sub = await watchDeviceLocation((coords) => {
          if (cancelled) return;
          if (locationPrivacyRef.current !== 'exact') return;
          const next = {
            latitude: coords.latitude,
            longitude: coords.longitude,
          };
          applyGps(next);

          void (async () => {
            try {
              const geo = await reverseGeocodeCity(
                next.latitude,
                next.longitude,
                hasMapboxToken ? MAPBOX_TOKEN : undefined,
              );
              if (cancelled) return;
              const label = geo.countryName
                ? `${geo.cityName}, ${geo.countryName}`
                : geo.cityName;
              applyGps(next, label);
              const now = Date.now();
              if (
                label !== lastPublishLabel ||
                now - lastPublishAt > 90_000
              ) {
                lastPublishAt = now;
                lastPublishLabel = label;
                await chatRepo.publishLiveLocation({
                  latitude: next.latitude,
                  longitude: next.longitude,
                  locationLabel: label,
                });
              }
            } catch {
              // keep pin on GPS even if geocode/publish fails
            }
          })();
        });
      } catch {
        // Friends load / demo seed still places a pin when available
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const flyToMyAccountPin = useCallback(() => {
    const target =
      locationPrivacyRef.current === 'exact'
        ? userLocationRef.current ?? hostPinRef.current ?? userLocation
        : hostPinRef.current ?? userLocation;
    if (!target) return;
    setFlyTo({ ...target, zoom: 12.5 });
    setCenter(target);
  }, [userLocation]);

  const onRegionChange = useCallback(
    (
      nextCenter: { latitude: number; longitude: number },
      nextBounds: LatLngBounds,
    ) => {
      setCenter(nextCenter);
      setBounds(nextBounds);
    },
    [],
  );

  const toggleFilter = useCallback((chip: FilterChip) => {
    setSelectedFilterIds((prev) => {
      // Single-school mode: tap again to clear → friends default
      if (prev.includes(chip.id)) {
        setSchoolFilterTotal(null);
        setSchoolFilterCohort(null);
        return [];
      }
      if (chip.type === 'program') {
        const target = schoolMapTarget(chip.label);
        if (target) {
          setFlyTo(target);
          setCenter({ latitude: target.latitude, longitude: target.longitude });
        }
      }
      return [chip.id];
    });
  }, []);

  const openUser = useCallback((user: UserProfile) => {
    setSearchPin(null);
    setSelectedUser(user);
    setShowPersonSheet(true);
    // Keep this person on the map even if friends-only / viewport filters
    // would otherwise hide their pin after we fly to them.
    setRosterPeople((prev) => {
      if (prev.some((u) => u.id === user.id)) return prev;
      return [user, ...prev];
    });
    setCenter({
      latitude: user.latitude,
      longitude: user.longitude,
    });
    setFlyTo({
      latitude: user.latitude,
      longitude: user.longitude,
      zoom: 13.8,
    });
  }, []);

  const openTrip = useCallback((trip: TripPin) => {
    setSearchPin(null);
    setSelectedTrip(trip);
    setShowGroupSheet(true);
    setFlyTo({
      latitude: trip.latitude,
      longitude: trip.longitude,
      zoom: 13.5,
    });
  }, []);

  /** Pullout list → full trip page when the trip exists in chat/Supabase. */
  const openTripFromList = useCallback(
    async (trip: TripPin) => {
      setSearchPin(null);
      setFlyTo({
        latitude: trip.latitude,
        longitude: trip.longitude,
        zoom: 13.5,
      });
      if (onOpenTrip) {
        try {
          const live = await chatRepo.getTrip(trip.id);
          if (live) {
            onOpenTrip(live.id);
            return;
          }
        } catch {
          // fall through to member sheet for seed-only pins
        }
      }
      setSelectedTrip(trip);
      setShowGroupSheet(true);
    },
    [onOpenTrip],
  );

  const openProgram = useCallback(
    (program: ProgramPin) => {
      setSearchPin(null);
      setSearchQuery('');
      setPlaceHits([]);
      setRemotePeople([]);
      const chip =
        findFilterChipForLabel(program.name, 'program') ||
        findFilterChipForLabel(program.shortName, 'program') ||
        chipFromSchoolLabel(program.name, 'program') ||
        chipFromSchoolLabel(program.shortName || program.name, 'program');
      if (chip) {
        promoteSchoolChip(chip);
      }
      // Always navigate to the program city on the map
      setFlyTo({
        latitude: program.latitude,
        longitude: program.longitude,
        zoom: 13.2,
      });
      setCenter({
        latitude: program.latitude,
        longitude: program.longitude,
      });
      // Mid snap so the student list is visible
      sheetRef.current?.snapToIndex(2);
    },
    [promoteSchoolChip],
  );

  const openPlace = useCallback((place: MapListPlaceItem) => {
    setShowPersonSheet(false);
    setShowGroupSheet(false);
    setSearchPin({
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.cityName,
    });
    setCityName(place.cityName);
    if (place.countryName) setCountryName(place.countryName);
    setCenter({ latitude: place.latitude, longitude: place.longitude });
    // Countries / wide regions get a wider zoom; cities stay closer
    const isCountryScale =
      !place.countryName ||
      place.cityName.toLowerCase() === place.countryName.toLowerCase();
    setFlyTo({
      latitude: place.latitude,
      longitude: place.longitude,
      zoom: isCountryScale ? 5.5 : 11.5,
    });
    setSearchQuery(place.cityName);
    setPlaceHits([]);
  }, []);

  const listItems = useMemo((): MapListItem[] => {
    const base = visible.listItems;
    // School filter: trust the cohort list only — don't append unrelated search hits
    if (selectedFilters.length > 0) {
      const schoolPlaces: MapListPlaceItem[] = placeHits.map((p) => ({
        kind: 'place',
        id: `place-${p.id}`,
        placeName: p.placeName,
        cityName: p.cityName,
        countryName: p.countryName,
        latitude: p.latitude,
        longitude: p.longitude,
      }));
      return [...base.filter((i) => i.kind === 'person'), ...schoolPlaces];
    }

    const seenPeople = new Set(
      base.filter((i) => i.kind === 'person').map((i) => i.id),
    );
    const extraPeople: MapListPersonItem[] = [];
    for (const user of remotePeople) {
      if (seenPeople.has(user.id)) continue;
      seenPeople.add(user.id);
      extraPeople.push({
        kind: 'person',
        id: user.id,
        user,
        status: 'here',
        statusLabel: `In ${user.locationLabel || user.hostCity}`,
        detailLabel: user.homeUniversity,
        newPosts: user.newPosts,
      });
    }

    // Prefer people matches; trim place noise when people are found
    const placeSource =
      remotePeople.length > 0 ? placeHits.slice(0, 3) : placeHits;
    const placeItems: MapListPlaceItem[] = placeSource.map((p) => ({
      kind: 'place',
      id: `place-${p.id}`,
      placeName: p.placeName,
      cityName: p.cityName,
      countryName: p.countryName,
      latitude: p.latitude,
      longitude: p.longitude,
    }));

    // People → Places → (schools/trips already in base after people)
    const peopleFirst = [
      ...extraPeople,
      ...base.filter((i) => i.kind === 'person' || i.kind === 'trip'),
    ];
    const rest = base.filter(
      (i) => i.kind !== 'person' && i.kind !== 'trip',
    );
    return [...peopleFirst, ...placeItems, ...rest];
  }, [placeHits, remotePeople, visible.listItems, selectedFilters.length]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.mapArea}>
        <AbroadsterMap
          styleMode={styleMode}
          people={(() => {
            const base = visible.peopleHere;
            if (
              selectedUser &&
              !base.some((u) => u.id === selectedUser.id)
            ) {
              return [selectedUser, ...base];
            }
            return base;
          })()}
          trips={visible.tripPins}
          programs={visible.programPins}
          onRegionChange={onRegionChange}
          onPersonPress={openUser}
          onTripPress={openTrip}
          onProgramPress={openProgram}
          onClusterPress={(payload) => {
            setFlyTo({
              latitude: payload.latitude,
              longitude: payload.longitude,
              zoom: 14.2,
            });
            sheetRef.current?.snapToIndex(2);
            if (payload.people[0]) {
              setSelectedUser(payload.people[0]);
            }
          }}
          flyTo={flyTo}
          userLocation={userLocation}
          searchPin={searchPin}
          mapActive={mapActive}
          selectedPersonId={selectedUser?.id ?? null}
          onMapPress={() => Keyboard.dismiss()}
        />

        <View style={[styles.topOverlay, { top: topInset }]} pointerEvents="box-none">
          <LocationPill
            cityName={cityName}
            countryName={countryName}
            studentsNearby={visible.stats.studentsNearby}
            friendsStudyingHere={visible.stats.friendsStudyingHere}
            schoolFilter={
              selectedFilters.length > 0
                ? {
                    label: selectedFilters[0].label,
                    totalStudents:
                      schoolFilterTotal ?? visible.stats.studentsNearby,
                    scope: 'program',
                  }
                : null
            }
            onPress={() => {
              setSearchFocusNonce((n) => n + 1);
              sheetRef.current?.snapToIndex(3);
            }}
          />
        </View>

        {!hasMapboxToken && Platform.OS === 'web' && (
          <View
            style={[styles.tokenBanner, { top: topInset + 48 }]}
            pointerEvents="none"
          >
            <Text style={styles.tokenText}>
              Mapbox token missing — check your .env file and restart the app.
            </Text>
          </View>
        )}

        <MapControls
          topInset={topInset}
          styleMode={styleMode}
          layerFilter={layerFilter}
          showLayerMenu={showLayerMenu}
          onToggleStyle={toggleStyleMode}
          onToggleLayerMenu={() => setShowLayerMenu((v) => !v)}
          onSelectLayer={(layer) => {
            setLayerFilter(layer);
            setShowLayerMenu(false);
            // "All pins" = friends view (clear school/program drawer filters)
            if (layer === 'all') {
              setSelectedFilterIds([]);
              setSchoolFilterTotal(null);
              setSchoolFilterCohort(null);
            }
          }}
          onRecenter={flyToMyAccountPin}
          onCreateTrip={() => {
            if (onCreateTrip) onCreateTrip();
            else
              Alert.alert(
                'Create Trip',
                'Open Create Trip from the Trips tab.',
              );
          }}
        />

        <MapDrawer
          sheetRef={sheetRef}
          items={listItems}
          filterChips={chipsWithFriends}
          selectedFilterIds={selectedFilterIds}
          searchQuery={searchQuery}
          searchFocusNonce={searchFocusNonce}
          onSearchChange={(q) => {
            setSearchQuery(q);
            if (!q.trim()) setSearchPin(null);
          }}
          onSearchSubmit={(q) => {
            const needle = q.trim();
            if (needle.length < 2) return;
            // Prefer home-university when the text is a known US school
            // (so "Duke" never becomes a program chip that flies to NC).
            const knownUni = getInstitutionByName(needle);
            const asUni =
              findFilterChipForLabel(needle, 'university') ||
              (knownUni ? chipFromSchoolLabel(needle, 'university') : null);
            const asProg =
              findFilterChipForLabel(needle, 'program') ||
              chipFromSchoolLabel(needle, 'program');
            const chip = knownUni ? asUni || asProg : asProg || asUni;
            if (chip) {
              promoteSchoolChip(chip);
              setSearchQuery('');
              setPlaceHits([]);
              setRemotePeople([]);
              sheetRef.current?.snapToIndex(2);
            }
          }}
          onToggleFilter={(chip) => {
            toggleFilter(chip);
            if (!selectedFilterIds.includes(chip.id)) {
              sheetRef.current?.snapToIndex(2);
            }
          }}
          filterActive={selectedFilterIds.length > 0}
          filterEmptyLabel={
            selectedFilters[0]
              ? `No Abroadster students at ${selectedFilters[0].label} yet`
              : undefined
          }
          onPersonPress={(item) => openUser(item.user)}
          onTripPress={(item) => {
            void openTripFromList(item.trip);
          }}
          onProgramPress={(item) => openProgram(item.program)}
          onPlacePress={openPlace}
          onRequestJoin={async (item) => {
            try {
              await chatRepo.requestTripJoin(item.trip.id);
              Alert.alert(
                'Request sent',
                `You requested to join the trip to ${item.trip.destinationCity}.`,
              );
            } catch {
              Alert.alert(
                'Request sent',
                `You requested to join the trip to ${item.trip.destinationCity}.`,
              );
            }
          }}
        />
      </View>

      {!hideBottomNav ? (
        <BottomNav
          active={activeTab}
          onChange={(tab) => {
            if (tab === 'map' && activeTab === 'map') {
              flyToMyAccountPin();
              return;
            }
            setActiveTab(tab);
            if (tab === 'profile') {
              openProfile(getUserById('user-me') ?? null);
            }
          }}
        />
      ) : null}

      <PersonDetailSheet
        visible={showPersonSheet}
        user={selectedUser}
        cityName={`${cityName}${countryName ? `, ${countryName}` : ''}`}
        upcomingLabel={undefined}
        onClose={() => setShowPersonSheet(false)}
        onViewProfile={() => {
          setShowPersonSheet(false);
          if (selectedUser) openProfile(selectedUser);
        }}
        onMessage={() => {
          setShowPersonSheet(false);
          if (selectedUser && onMessageUser) onMessageUser(selectedUser.id);
        }}
      />

      <GroupMembersSheet
        visible={showGroupSheet}
        trip={selectedTrip}
        onClose={() => setShowGroupSheet(false)}
        onSelectUser={(user) => {
          setShowGroupSheet(false);
          openUser(user);
        }}
      />

      {!hideBottomNav ? (
        <ProfileModal
          visible={showProfile}
          user={profileUser}
          onClose={() => {
            setShowProfile(false);
            setActiveTab('map');
          }}
          onAirMail={(userId) => {
            setShowProfile(false);
            onMessageUser?.(userId);
          }}
        />
      ) : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  mapArea: {
    flex: 1,
    position: 'relative',
  },
  topOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 15,
  },
  tokenBanner: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 14,
    maxWidth: 320,
  },
  tokenText: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
