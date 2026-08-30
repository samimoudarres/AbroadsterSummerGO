import type { LatLngBounds } from '../lib/geo';
import { isNearby } from '../lib/geo';
import { resolveMapLocation } from '../lib/userLocation';
import { allowDemoSeedMerge } from '../lib/demoFlags';
import {
  matchesHomeUniversity,
  matchesStudyProgram,
} from '../lib/schools/matchSchool';
import { spreadPeopleAroundProgramPins } from '../lib/map/spreadAroundPrograms';
import {
  getTripDisplayStatus,
  tripStatusLabel,
} from '../lib/trips/status';
import {
  allUsers as seedAllUsers,
  programs as seedPrograms,
  trips as seedTrips,
} from './mockMapData';
import type {
  FilterChip,
  MapLayerFilter,
  MapListItem,
  MapViewportStats,
  ProgramPin,
  TripPin,
  UserProfile,
} from './types';

/** Demo people/trips for local density — disabled in production / store builds.
 *  Program pins always stay (real study-abroad catalog, not fake users). */
const allUsers: UserProfile[] = allowDemoSeedMerge() ? seedAllUsers : [];
const programs: ProgramPin[] = seedPrograms;
const trips: TripPin[] = allowDemoSeedMerge() ? seedTrips : [];

function isSeedUserId(id: string): boolean {
  return id.startsWith('user-') || id.startsWith('trip-');
}

/** Live friend ids must not wipe demo seed friendship flags used for map density. */
function applyFriendFlag(
  u: UserProfile,
  friendSet: Set<string> | null,
  mutualSet: Set<string> | null,
): UserProfile {
  if (!friendSet && !mutualSet) return u;
  if (u.isCurrentUser) {
    return { ...u, isFriend: true };
  }
  const isMutual = mutualSet?.has(u.id) ?? friendSet?.has(u.id) ?? u.isFriend;
  if (allowDemoSeedMerge() && isSeedUserId(u.id)) {
    return { ...u, isFriend: u.isFriend || isMutual };
  }
  return { ...u, isFriend: isMutual };
}

function canPinUser(
  user: UserProfile,
  mutualSet: Set<string> | null,
): boolean {
  if (user.isCurrentUser) return user.locationPrivacy !== 'hidden';
  if (user.locationPrivacy === 'hidden') return false;
  if (!mutualSet) return user.isFriend;
  return mutualSet.has(user.id);
}

export interface VisibleMapData {
  peopleHere: UserProfile[];
  tripPins: TripPin[];
  programPins: ProgramPin[];
  stats: MapViewportStats;
  listItems: MapListItem[];
}

/** Apply privacy-aware coordinates before any map / nearby math. */
function locateUser(user: UserProfile): UserProfile | null {
  const resolved = resolveMapLocation(user);
  if (!resolved) return null;
  return {
    ...user,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    locationLabel: resolved.locationLabel,
  };
}

function matchesProgramLabel(programName: string, label: string): boolean {
  return matchesStudyProgram(programName, label);
}

function matchesUniversityLabel(homeUniversity: string, label: string): boolean {
  return matchesHomeUniversity(homeUniversity, label);
}

function matchesDrawerFilters(
  user: UserProfile,
  selectedFilters: FilterChip[],
): boolean {
  // Default map: friends (+ you). Active school chip → match school fields only
  // (you only appear in the school list if you actually attend that school).
  if (selectedFilters.length === 0) {
    return Boolean(user.isFriend || user.isCurrentUser);
  }
  const programFilters = selectedFilters.filter((f) => f.type === 'program');
  const uniFilters = selectedFilters.filter((f) => f.type === 'university');

  const programOk =
    programFilters.length === 0 ||
    programFilters.some((f) =>
      matchesProgramLabel(user.studyAbroadProgram || '', f.label),
    );

  const uniOk =
    uniFilters.length === 0 ||
    uniFilters.some((f) =>
      matchesUniversityLabel(user.homeUniversity || '', f.label),
    );

  return programOk && uniOk;
}

function matchesSearch(user: UserProfile, q: string): boolean {
  if (!q) return true;
  return (
    user.fullName.toLowerCase().includes(q) ||
    user.firstName.toLowerCase().includes(q) ||
    user.lastName.toLowerCase().includes(q) ||
    user.homeUniversity.toLowerCase().includes(q) ||
    user.studyAbroadProgram.toLowerCase().includes(q) ||
    user.hostCity.toLowerCase().includes(q)
  );
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseTripDay(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return startOfDay(d);
}

function weekdayName(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function programCityOf(user: UserProfile): string {
  return user.hostCity || user.studyAbroadProgram || 'abroad';
}

/** Grey status under a person in the map drawer — driven by real trip dates. */
function personDetailLabel(user: UserProfile, trips: TripPin[]): string {
  const programCity = programCityOf(user);
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const mine = trips.filter(
    (t) =>
      t.memberIds.includes(user.id) ||
      t.members.some((m) => m.userId === user.id),
  );

  for (const trip of mine) {
    const start = parseTripDay(trip.dateStart);
    const end = parseTripDay(trip.dateEnd);
    if (start && end && today >= start && today <= end) {
      return `Returning to ${programCity} on ${weekdayName(end)}`;
    }
  }

  for (const trip of mine) {
    const start = parseTripDay(trip.dateStart);
    if (start && start.getTime() === tomorrow.getTime()) {
      const dest = trip.destinationCity || 'trip';
      return `Leaving for ${dest} Tomorrow`;
    }
  }

  return `Studying in ${programCity}`;
}

function personStatusLabel(user: UserProfile): string {
  const label = (user.locationLabel || '').trim();
  if (label) {
    return label.toLowerCase().startsWith('in ') ? label : `In ${label}`;
  }
  const city = user.hostCity || 'abroad';
  const country = user.hostCountry;
  return country ? `In ${city}, ${country}` : `In ${city}`;
}

function tripTitle(trip: TripPin): string {
  const names = trip.members.map((m) => m.firstName);
  if (names.length <= 3) {
    if (names.length === 3) return `${names[0]}, ${names[1]} & ${names[2]}`;
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return names[0] ?? 'Trip';
  }
  return `${names[0]}, ${names[1]}, ${names[2]}, ${names[3].slice(0, 2)}...`;
}

function tripMatchesFilters(
  trip: TripPin,
  selectedFilters: FilterChip[],
  friendIds?: string[],
  currentUserId?: string,
): boolean {
  const members = trip.members
    .map((m) => {
      const raw = allUsers.find((u) => u.id === m.userId);
      return raw ? locateUser(raw) : null;
    })
    .filter(Boolean) as UserProfile[];

  const isPast = trip.status === 'past';
  const isParticipant =
    currentUserId != null && trip.memberIds.includes(currentUserId);

  // Upcoming/planning: show if you're on the trip or a friend/mutual is on it
  if (!isPast && !isParticipant) {
    if (friendIds && friendIds.length > 0) {
      if (!trip.memberIds.some((id) => friendIds.includes(id))) {
        if (!(allowDemoSeedMerge() && members.some((m) => m.isFriend))) {
          return false;
        }
      }
    } else if (members.length > 0 && !members.some((m) => m.isFriend)) {
      return false;
    }
  }

  if (selectedFilters.length === 0) {
    if (isParticipant) return true;
    if (friendIds && friendIds.length > 0) {
      if (trip.memberIds.some((id) => friendIds.includes(id))) return true;
      if (allowDemoSeedMerge() && members.some((m) => m.isFriend)) return true;
      return isPast;
    }
    if (members.length === 0) return true;
    return members.some((m) => m.isFriend) || isPast;
  }
  return members.some((m) => matchesDrawerFilters(m, selectedFilters));
}

export function computeVisibleMapData(options: {
  centerLat: number;
  centerLng: number;
  bounds: LatLngBounds;
  cityName: string;
  countryName: string;
  layerFilter: MapLayerFilter;
  selectedFilters: FilterChip[];
  searchQuery: string;
  /** Live/demo trips created in-app (merged with mock pins). */
  extraTrips?: TripPin[];
  /** Live friends (and other real users) to show as people pins. */
  extraPeople?: UserProfile[];
  /** Directed friend ids (legacy) — prefer mutualFriendIds for pins. */
  friendIds?: string[];
  /** Mutual friend ids — only these users get map pins (plus you). */
  mutualFriendIds?: string[];
  /** Current viewer — own trips always show on All pins. */
  currentUserId?: string;
}): VisibleMapData {
  const {
    centerLat,
    centerLng,
    bounds,
    cityName,
    countryName,
    layerFilter,
    selectedFilters,
    searchQuery,
    extraTrips = [],
    extraPeople = [],
    friendIds,
    mutualFriendIds,
    currentUserId,
  } = options;

  const q = searchQuery.trim().toLowerCase();
  const searching = q.length > 0;
  const friendSet =
    friendIds != null ? new Set(friendIds) : null;
  const mutualSet =
    mutualFriendIds != null
      ? new Set(mutualFriendIds)
      : friendSet;

  // Privacy-aware positions for every visible user
  const seedUsers = allUsers
    .map((u) => locateUser(applyFriendFlag(u, friendSet, mutualSet)))
    .filter(Boolean) as UserProfile[];

  const liveUsers = extraPeople
    .map((u) => locateUser(applyFriendFlag(u, friendSet, mutualSet)))
    .filter(Boolean) as UserProfile[];

  const byId = new Map<string, UserProfile>();
  for (const u of seedUsers) byId.set(u.id, u);
  for (const u of liveUsers) byId.set(u.id, u); // live overrides seed
  const locatedUsers = [...byId.values()];

  // Stats always from current map viewport
  const nearbyUsers = locatedUsers.filter((u) =>
    isNearby(u.latitude, u.longitude, centerLat, centerLng, bounds),
  );

  const schoolFilterOn = selectedFilters.length > 0;
  const programFiltersActive = selectedFilters.filter((f) => f.type === 'program');
  const uniFiltersActive = selectedFilters.filter((f) => f.type === 'university');

  const inView = (lat: number, lng: number) =>
    isNearby(lat, lng, centerLat, centerLng, bounds);

  // School-matched people (friends OR not) — always the full Abroadster roster
  // for that school/program. Pullout lists everyone; pins use the same set.
  // (Tapping a US-uni chip does not fly to campus — only person taps do.)
  const filteredPeople = locatedUsers
    .filter((u) => u.id !== 'user-me')
    .filter((u) => matchesDrawerFilters(u, selectedFilters))
    .filter((u) => matchesSearch(u, q))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const allTrips = (() => {
    const tripById = new Map<string, TripPin>();
    for (const t of trips) tripById.set(t.id, t);
    for (const t of extraTrips) tripById.set(t.id, t);
    return [...tripById.values()];
  })();

  const tripPool = allTrips;

  const tripPinsForMap = allTrips.filter((t) => {
    // Trip pins are global (not viewport-clipped) so destinations still appear
    // when the camera is elsewhere — zoom out / search to find them.
    if (layerFilter === 'here') return false;
    if (layerFilter === 'upcoming') return t.status === 'upcoming';
    if (layerFilter === 'planning') return t.status === 'planning';
    if (layerFilter === 'programs') return false;
    return tripMatchesFilters(t, selectedFilters, friendIds, currentUserId);
  });

  const withLiveProgramCounts = (pins: ProgramPin[]): ProgramPin[] =>
    pins.map((p) => {
      const n = locatedUsers.filter(
        (u) =>
          u.id !== 'user-me' &&
          matchesProgramLabel(u.studyAbroadProgram || '', p.name),
      ).length;
      return { ...p, studentCount: n };
    });

  const programPinsForMap =
    layerFilter === 'here' || layerFilter === 'upcoming' || layerFilter === 'planning'
      ? []
      : uniFiltersActive.length > 0 && programFiltersActive.length === 0
        ? // Home-uni filter: don't clutter with unrelated program pins
          []
        : withLiveProgramCounts(
            programs.filter((p) => {
              if (programFiltersActive.length > 0) {
                return programFiltersActive.some(
                  (f) =>
                    matchesProgramLabel(p.name, f.label) ||
                    matchesProgramLabel(p.shortName || '', f.label),
                );
              }
              return isNearby(
                p.latitude,
                p.longitude,
                centerLat,
                centerLng,
                bounds,
              );
            }),
          );

  // Pins: mutual friends only (school list still shows everyone in filteredPeople).
  const mapPeopleBase =
    layerFilter === 'upcoming' ||
    layerFilter === 'planning' ||
    layerFilter === 'programs'
      ? ([] as UserProfile[])
      : schoolFilterOn
        ? filteredPeople.filter((u) => canPinUser(u, mutualSet))
        : nearbyUsers
            .filter((u) => u.id !== 'user-me')
            .filter((u) => canPinUser(u, mutualSet))
            .filter((u) => matchesDrawerFilters(u, selectedFilters))
            .slice(0, 40);

  // Ensure "me" is always pinned even when outside the current viewport filter.
  const mePin = locatedUsers.find(
    (u) => u.isCurrentUser && u.locationPrivacy !== 'hidden',
  );
  const mapPeopleRaw =
    mePin && !mapPeopleBase.some((u) => u.id === mePin.id)
      ? [mePin, ...mapPeopleBase]
      : mapPeopleBase;

  // Fan out students sitting on a program logo so avatars stay visible
  const mapPeople = spreadPeopleAroundProgramPins(
    mapPeopleRaw,
    programPinsForMap,
  );

  const personItems: MapListItem[] = [];
  const tripItems: MapListItem[] = [];

  // People: everyone matching filters; sorted in-view first below
  if (layerFilter === 'all' || layerFilter === 'here') {
    for (const u of filteredPeople) {
      personItems.push({
        kind: 'person',
        id: u.id,
        user: u,
        status: 'here',
        statusLabel: personStatusLabel(u),
        detailLabel: personDetailLabel(u, tripPool),
        newPosts: u.newPosts,
      });
    }
  }

  // Trips: friend trips matching filters
  if (layerFilter === 'all' || layerFilter === 'upcoming' || layerFilter === 'planning') {
    for (const trip of tripPool) {
      if (layerFilter === 'upcoming' && trip.status !== 'upcoming') continue;
      if (layerFilter === 'planning' && trip.status !== 'planning') continue;
      if (!tripMatchesFilters(trip, selectedFilters, friendIds, currentUserId)) continue;

      if (q) {
        const title = tripTitle(trip).toLowerCase();
        const memberHit = trip.members.some((m) =>
          m.firstName.toLowerCase().includes(q),
        );
        if (
          !title.includes(q) &&
          !trip.dateLabel.toLowerCase().includes(q) &&
          !trip.destinationCity.toLowerCase().includes(q) &&
          !memberHit
        ) {
          continue;
        }
      }

      const displayStatus =
        trip.status === 'past'
          ? 'past'
          : getTripDisplayStatus({
              status: trip.status,
              dateStart: trip.dateStart,
              dateEnd: trip.dateEnd,
            });
      tripItems.push({
        kind: 'trip',
        id: trip.id,
        trip,
        status: displayStatus,
        statusLabel: tripStatusLabel(displayStatus),
        detailLabel: [
          [trip.destinationCity, trip.destinationCountry].filter(Boolean).join(', '),
          trip.dateLabel,
        ]
          .filter(Boolean)
          .join(' · '),
        title: tripTitle(trip),
      });
    }
  }

  // Relevance: people/trips currently on the map first, then the rest
  const personInView = personItems.filter(
    (i) => i.kind === 'person' && inView(i.user.latitude, i.user.longitude),
  );
  const personOut = personItems.filter(
    (i) => i.kind === 'person' && !inView(i.user.latitude, i.user.longitude),
  );
  const tripInView = tripItems.filter(
    (i) => i.kind === 'trip' && inView(i.trip.latitude, i.trip.longitude),
  );
  const tripOut = tripItems.filter(
    (i) => i.kind === 'trip' && !inView(i.trip.latitude, i.trip.longitude),
  );

  const ordered: MapListItem[] = [
    ...personInView,
    ...tripInView,
    ...personOut,
    ...tripOut,
  ];

  // Schools section — hide whenever a school/program chip is active so the
  // drawer focuses on the student list.
  if ((layerFilter === 'all' || layerFilter === 'programs') && !schoolFilterOn) {
    const programPool = searching
      ? withLiveProgramCounts(
          programs.filter((p) =>
            programFiltersActive.length === 0
              ? true
              : programFiltersActive.some(
                  (f) =>
                    matchesProgramLabel(p.name, f.label) ||
                    matchesProgramLabel(p.shortName || '', f.label),
                ),
          ),
        )
      : programPinsForMap;
    for (const program of programPool) {
      if (q) {
        const hay = `${program.name} ${program.shortName} ${program.city}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      ordered.push({
        kind: 'program',
        id: program.id,
        program,
      });
    }
  }

  return {
    peopleHere: mapPeople,
    tripPins: tripPinsForMap,
    programPins: programPinsForMap,
    stats: {
      cityName,
      countryName,
      studentsNearby: schoolFilterOn
        ? filteredPeople.length
        : locatedUsers.filter(
            (u) =>
              u.id !== 'user-me' &&
              u.locationPrivacy !== 'hidden' &&
              isNearby(u.latitude, u.longitude, centerLat, centerLng, bounds),
          ).length,
      friendsStudyingHere: schoolFilterOn
        ? filteredPeople.filter((u) => u.isFriend).length
        : (() => {
            const nearbyPrograms = programs.filter((p) =>
              isNearby(p.latitude, p.longitude, centerLat, centerLng, bounds),
            );
            if (nearbyPrograms.length === 0) return 0;
            return locatedUsers.filter((u) => {
              if (!u.isFriend || u.id === 'user-me') return false;
              return nearbyPrograms.some(
                (p) =>
                  matchesProgramLabel(u.studyAbroadProgram || '', p.name) ||
                  matchesProgramLabel(u.studyAbroadProgram || '', p.shortName || ''),
              );
            }).length;
          })(),
    },
    listItems: ordered,
  };
}
