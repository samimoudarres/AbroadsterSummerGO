import type { ProgramPin, TripPin, UserProfile } from '../../data/types';

export type ClusterGlowKind = 'person' | 'upcoming' | 'planning' | 'program';

export type MapClusterMember =
  | { kind: 'person'; person: UserProfile }
  | { kind: 'trip'; trip: TripPin }
  | { kind: 'program'; program: ProgramPin };

export interface MapCluster {
  id: string;
  latitude: number;
  longitude: number;
  members: MapClusterMember[];
  /** Highest-priority glow for the stack. */
  glowKind: ClusterGlowKind;
  title: string;
  subtitle?: string;
  /** Avatar / logo sources for stacked faces (people first). */
  faceSources: unknown[];
  /** True when only one underlying entity (forward presses). */
  isSingleton: boolean;
}

function cellSizeDegrees(zoom: number): number {
  // Larger cells when zoomed out → more clustering; shrink as you zoom in.
  if (zoom >= 14.5) return 0;
  if (zoom >= 13) return 0.004;
  if (zoom >= 12) return 0.01;
  if (zoom >= 11) return 0.02;
  if (zoom >= 10) return 0.04;
  if (zoom >= 8) return 0.08;
  return 0.16;
}

function memberPriority(m: MapClusterMember): number {
  if (m.kind === 'person') return 0;
  if (m.kind === 'trip' && m.trip.status === 'upcoming') return 1;
  if (m.kind === 'trip') return 2;
  return 3;
}

function sortMembers(members: MapClusterMember[]): MapClusterMember[] {
  return [...members].sort((a, b) => memberPriority(a) - memberPriority(b));
}

function glowFor(members: MapClusterMember[]): ClusterGlowKind {
  const sorted = sortMembers(members);
  const top = sorted[0];
  if (!top) return 'person';
  if (top.kind === 'person') return 'person';
  if (top.kind === 'trip') {
    return top.trip.status === 'upcoming' ? 'upcoming' : 'planning';
  }
  return 'program';
}

function captionFor(members: MapClusterMember[]): {
  title: string;
  subtitle?: string;
} {
  const people = members.filter((m) => m.kind === 'person') as Extract<
    MapClusterMember,
    { kind: 'person' }
  >[];
  const trips = members.filter((m) => m.kind === 'trip') as Extract<
    MapClusterMember,
    { kind: 'trip' }
  >[];
  const programs = members.filter((m) => m.kind === 'program') as Extract<
    MapClusterMember,
    { kind: 'program' }
  >[];

  if (members.length === 1) {
    const only = members[0];
    if (only.kind === 'person') {
      const p = only.person;
      return {
        title: p.isCurrentUser ? 'You' : p.firstName,
        subtitle: p.isCurrentUser
          ? p.hostCity || p.homeUniversity
          : p.homeUniversity,
      };
    }
    if (only.kind === 'trip') {
      const names = only.trip.members.map((m) => m.firstName);
      const title =
        names.length === 0
          ? only.trip.destinationCity
          : names.length === 1
            ? names[0]
            : names.length === 2
              ? `${names[0]} & ${names[1]}`
              : `${names[0]}, ${names[1].slice(0, 3)}...`;
      return { title, subtitle: only.trip.destinationCity };
    }
    return {
      title: only.program.shortName || only.program.name,
      subtitle: only.program.city,
    };
  }

  if (people.length > 0) {
    const lead = people[0].person;
    const name = lead.isCurrentUser ? 'You' : lead.firstName;
    const others = members.length - 1;
    return {
      title: others > 0 ? `${name} & ${others} others` : name,
      subtitle:
        trips.length > 0
          ? `${trips.length} trip${trips.length === 1 ? '' : 's'}`
          : programs.length > 0
            ? `${programs.length} program${programs.length === 1 ? '' : 's'}`
            : undefined,
    };
  }

  if (trips.length > 0) {
    return {
      title: `${trips.length} trip${trips.length === 1 ? '' : 's'}`,
      subtitle:
        programs.length > 0
          ? `${programs.length} program${programs.length === 1 ? '' : 's'}`
          : trips[0].trip.destinationCity,
    };
  }

  return {
    title: `${programs.length} program${programs.length === 1 ? '' : 's'}`,
    subtitle: programs[0]?.program.city,
  };
}

function faceSourcesFor(members: MapClusterMember[]): unknown[] {
  const sorted = sortMembers(members);
  const out: unknown[] = [];
  for (const m of sorted) {
    if (out.length >= 4) break;
    if (m.kind === 'person') {
      out.push(m.person.avatar);
    } else if (m.kind === 'trip') {
      for (const mem of m.trip.members) {
        if (out.length >= 4) break;
        out.push(mem.avatar);
      }
    } else if (m.program.logo) {
      out.push(m.program.logo);
    }
  }
  return out;
}

/**
 * Proximity-cluster map pins by zoom. Priority: people > upcoming trips >
 * planning trips > programs. Zoomed in enough → every pin is a singleton.
 */
export function clusterMapPins(
  people: UserProfile[],
  trips: TripPin[],
  programs: ProgramPin[],
  zoom: number,
): MapCluster[] {
  const size = cellSizeDegrees(zoom);
  const items: MapClusterMember[] = [
    ...people.map((person) => ({ kind: 'person' as const, person })),
    ...trips.map((trip) => ({ kind: 'trip' as const, trip })),
    ...programs.map((program) => ({ kind: 'program' as const, program })),
  ];

  if (size <= 0 || items.length === 0) {
    return items.map((m, i) => singletonCluster(m, i));
  }

  const buckets = new Map<string, MapClusterMember[]>();
  for (const m of items) {
    const { latitude, longitude } = coordsOf(m);
    const gx = Math.floor(longitude / size);
    const gy = Math.floor(latitude / size);
    const key = `${gx}:${gy}`;
    const list = buckets.get(key);
    if (list) list.push(m);
    else buckets.set(key, [m]);
  }

  const clusters: MapCluster[] = [];
  let idx = 0;
  for (const group of buckets.values()) {
    if (group.length === 1) {
      clusters.push(singletonCluster(group[0], idx++));
      continue;
    }
    const sorted = sortMembers(group);
    let lat = 0;
    let lng = 0;
    for (const m of sorted) {
      const c = coordsOf(m);
      lat += c.latitude;
      lng += c.longitude;
    }
    lat /= sorted.length;
    lng /= sorted.length;
    const { title, subtitle } = captionFor(sorted);
    clusters.push({
      id: `cluster:${idx++}:${sorted
        .map((m) =>
          m.kind === 'person'
            ? `p${m.person.id}`
            : m.kind === 'trip'
              ? `t${m.trip.id}`
              : `g${m.program.id}`,
        )
        .join('+')}`,
      latitude: lat,
      longitude: lng,
      members: sorted,
      glowKind: glowFor(sorted),
      title,
      subtitle,
      faceSources: faceSourcesFor(sorted),
      isSingleton: false,
    });
  }
  return clusters;
}

function coordsOf(m: MapClusterMember): {
  latitude: number;
  longitude: number;
} {
  if (m.kind === 'person') {
    return { latitude: m.person.latitude, longitude: m.person.longitude };
  }
  if (m.kind === 'trip') {
    return { latitude: m.trip.latitude, longitude: m.trip.longitude };
  }
  return { latitude: m.program.latitude, longitude: m.program.longitude };
}

function singletonCluster(m: MapClusterMember, idx: number): MapCluster {
  const c = coordsOf(m);
  const { title, subtitle } = captionFor([m]);
  return {
    id:
      m.kind === 'person'
        ? `person:${m.person.id}`
        : m.kind === 'trip'
          ? `trip:${m.trip.id}`
          : `program:${m.program.id}`,
    latitude: c.latitude,
    longitude: c.longitude,
    members: [m],
    glowKind: glowFor([m]),
    title,
    subtitle,
    faceSources: faceSourcesFor([m]),
    isSingleton: true,
  };
}
