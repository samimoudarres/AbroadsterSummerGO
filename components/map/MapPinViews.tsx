import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/theme';
import { shortTripTitle } from '../../lib/geo';
import { defaultAvatarUrl, ensureImageUri, toImageUri } from '../../lib/images';
import type { ProgramPin, TripPin, UserProfile } from '../../data/types';
import type { MapCluster } from '../../lib/map/clusterPins';

function PinCaption({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.captionChip}>
      <Text style={styles.captionTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.captionSub} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Soft outer halo so Mapbox MarkerViews show colored glow. */
function GlowHalo({ color, size }: { color: string; size: number }) {
  const halo = size + 20;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.glowHalo,
        {
          width: halo,
          height: halo,
          borderRadius: halo / 2,
          backgroundColor: color,
          left: (size - halo) / 2,
          top: (size - halo) / 2,
        },
      ]}
    />
  );
}

/** Figma-style circular person pin with caption chip. */
export function PersonPinView({
  person,
  selected,
  onPress,
}: {
  person: UserProfile;
  selected: boolean;
  onPress: () => void;
}) {
  const emphasize = Boolean(person.isCurrentUser) || selected;
  const size = emphasize ? 52 : 45;
  const glow = emphasize ? colors.brandTeal : colors.statusGreenGlow;
  const uri = useResolvedUri(
    person.avatar,
    person.fullName || person.firstName,
  );
  return (
    <Pressable onPress={onPress} style={styles.pinWrap} hitSlop={6}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <GlowHalo color={glow} size={size} />
        <View
          style={[
            styles.personRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: emphasize ? 3 : 2.5,
              borderColor: emphasize ? colors.brandTeal : colors.white,
              shadowColor: glow,
            },
            emphasize ? styles.personRingMe : styles.personRingGlow,
          ]}
        >
          <Image source={{ uri }} style={styles.pinImg} />
        </View>
      </View>
      <PinCaption
        title={person.isCurrentUser ? 'You' : person.firstName}
        subtitle={
          person.isCurrentUser
            ? person.hostCity || person.homeUniversity
            : person.homeUniversity
        }
      />
    </Pressable>
  );
}

/** Stacked-avatar trip pin with status glow. */
export function TripPinView({
  trip,
  onPress,
}: {
  trip: TripPin;
  onPress: () => void;
}) {
  const size = 45;
  const glow =
    trip.status === 'past'
      ? colors.filterGray
      : trip.status === 'upcoming'
        ? colors.statusOrangeGlow
        : colors.statusYellowGlow;
  const title =
    shortTripTitle(trip.members.map((m) => m.firstName)) ||
    trip.destinationCity;
  const [uris, setUris] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: string[] = [];
      for (const m of trip.members.slice(0, 4)) {
        const uri =
          (await ensureImageUri(m.avatar as any)) ||
          toImageUri(m.avatar) ||
          defaultAvatarUrl(m.firstName);
        next.push(uri);
      }
      if (!cancelled) setUris(next);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trip.members]);

  const positions = [
    { left: 3, top: 5, size: 21 },
    { left: 22, top: 14, size: 17 },
    { left: 8, top: 26, size: 15 },
    { left: 24, top: 4, size: 13 },
  ];

  return (
    <Pressable onPress={onPress} style={styles.pinWrap} hitSlop={6}>
      <View style={{ width: size, height: size }}>
        <GlowHalo color={glow} size={size} />
        <View
          style={[
            styles.personRing,
            styles.tripRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              shadowColor: glow,
            },
          ]}
        >
          {uris.length === 0 ? (
            <View
              style={[styles.pinImg, { backgroundColor: colors.groupAvatarBg }]}
            />
          ) : (
            uris.map((uri, i) => {
              const pos = positions[i] ?? positions[0];
              return (
                <Image
                  key={`${trip.id}-a-${i}`}
                  source={{ uri }}
                  style={{
                    position: 'absolute',
                    left: pos.left,
                    top: pos.top,
                    width: pos.size,
                    height: pos.size,
                    borderRadius: pos.size / 2,
                    borderWidth: 1,
                    borderColor: colors.white,
                  }}
                />
              );
            })
          )}
        </View>
      </View>
      <PinCaption title={title} subtitle={trip.destinationCity} />
    </Pressable>
  );
}

/** Circular program logo pin. */
export function ProgramPinView({
  program,
  onPress,
}: {
  program: ProgramPin;
  onPress: () => void;
}) {
  const size = 48;
  const letter = (program.shortName || program.name || '?').charAt(0);
  const logoUri = useOptionalImageUri(program.logo);
  const glow = colors.programBlue;
  return (
    <Pressable onPress={onPress} style={styles.pinWrap} hitSlop={6}>
      <View style={{ width: size, height: size }}>
        <GlowHalo color={glow} size={size} />
        <View
          style={[
            styles.personRing,
            styles.programRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: program.accent || colors.programBlue,
              shadowColor: glow,
            },
          ]}
        >
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.pinImg} />
          ) : (
            <Text style={styles.programLetter}>{letter}</Text>
          )}
        </View>
      </View>
      <PinCaption
        title={program.shortName || program.name}
        subtitle={program.city}
      />
    </Pressable>
  );
}

/** Cluster of nearby pins (Snap Map style). */
export function ClusterPinView({
  cluster,
  onPress,
}: {
  cluster: MapCluster;
  onPress: () => void;
}) {
  const size = 52;
  const glow =
    cluster.glowKind === 'person'
      ? colors.statusGreenGlow
      : cluster.glowKind === 'upcoming'
        ? colors.statusOrangeGlow
        : cluster.glowKind === 'planning'
          ? colors.statusYellowGlow
          : cluster.glowKind === 'past'
            ? colors.filterGray
            : colors.programBlue;
  const faces = cluster.faceSources.slice(0, 4);
  const [uris, setUris] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: string[] = [];
      for (const src of faces) {
        const uri =
          (await ensureImageUri(src as any)) ||
          toImageUri(src as any) ||
          defaultAvatarUrl('A');
        next.push(uri);
      }
      if (!cancelled) setUris(next);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cluster.id, faces.join('|')]);

  const positions =
    uris.length <= 1
      ? [{ left: 0, top: 0, size }]
      : [
          { left: 2, top: 4, size: 28 },
          { left: 22, top: 10, size: 24 },
          { left: 6, top: 26, size: 20 },
          { left: 26, top: 2, size: 18 },
        ];

  return (
    <Pressable onPress={onPress} style={styles.pinWrap} hitSlop={6}>
      <View style={{ width: size, height: size }}>
        <GlowHalo color={glow} size={size} />
        <View
          style={[
            styles.personRing,
            styles.tripRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              shadowColor: glow,
              backgroundColor:
                cluster.glowKind === 'program'
                  ? colors.programBlue
                  : colors.groupAvatarBg,
            },
          ]}
        >
          {uris.length === 0 ? (
            <View
              style={[styles.pinImg, { backgroundColor: colors.groupAvatarBg }]}
            />
          ) : uris.length === 1 ? (
            <Image source={{ uri: uris[0] }} style={styles.pinImg} />
          ) : (
            uris.map((uri, i) => {
              const pos = positions[i] ?? positions[0];
              return (
                <Image
                  key={`${cluster.id}-f-${i}`}
                  source={{ uri }}
                  style={{
                    position: 'absolute',
                    left: pos.left,
                    top: pos.top,
                    width: pos.size,
                    height: pos.size,
                    borderRadius: pos.size / 2,
                    borderWidth: 1.5,
                    borderColor: colors.white,
                  }}
                />
              );
            })
          )}
        </View>
      </View>
      <PinCaption title={cluster.title} subtitle={cluster.subtitle} />
    </Pressable>
  );
}

/** Teal GPS accuracy dot. */
export function GpsDotView() {
  return <View style={styles.gpsDot} />;
}

/** Red search result pin. */
export function SearchPinView({ label }: { label?: string }) {
  return (
    <View style={styles.searchWrap}>
      <View style={styles.searchPin} />
      {label ? <PinCaption title={label} /> : null}
    </View>
  );
}

function useResolvedUri(source: unknown, nameFallback: string): string {
  const [uri, setUri] = useState(() => {
    if (source == null || source === '') {
      return nameFallback ? defaultAvatarUrl(nameFallback) : '';
    }
    return (
      (typeof source === 'string' && source) ||
      toImageUri(source as any) ||
      (nameFallback ? defaultAvatarUrl(nameFallback) : '')
    );
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (source == null || source === '') {
        if (!cancelled) {
          setUri(nameFallback ? defaultAvatarUrl(nameFallback) : '');
        }
        return;
      }
      const next =
        (await ensureImageUri(source as any)) ||
        toImageUri(source as any) ||
        (nameFallback ? defaultAvatarUrl(nameFallback) : '');
      if (!cancelled) setUri(next);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source, nameFallback]);
  return uri;
}

function useOptionalImageUri(source: unknown): string {
  const [uri, setUri] = useState(() => {
    if (source == null || source === '') return '';
    return (
      (typeof source === 'string' && source) ||
      toImageUri(source as any) ||
      ''
    );
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (source == null || source === '') {
        if (!cancelled) setUri('');
        return;
      }
      const next =
        (await ensureImageUri(source as any)) ||
        toImageUri(source as any) ||
        '';
      if (!cancelled) setUri(next);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source]);
  return uri;
}

const styles = StyleSheet.create({
  pinWrap: {
    alignItems: 'center',
    maxWidth: 110,
  },
  glowHalo: {
    position: 'absolute',
    opacity: 0.38,
    zIndex: 0,
  },
  personRing: {
    overflow: 'hidden',
    backgroundColor: '#eee',
    borderWidth: 2.5,
    borderColor: colors.white,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 14,
    elevation: 8,
    zIndex: 1,
  },
  personRingGlow: {
    shadowOpacity: 0.9,
    shadowRadius: 16,
  },
  personRingMe: {
    shadowOpacity: 0.85,
    shadowRadius: 18,
  },
  tripRing: {
    overflow: 'hidden',
    backgroundColor: colors.groupAvatarBg,
    shadowOpacity: 0.9,
    shadowRadius: 16,
  },
  programRing: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.white,
    shadowOpacity: 0.85,
    shadowRadius: 16,
  },
  pinImg: {
    width: '100%',
    height: '100%',
  },
  programLetter: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 18,
  },
  captionChip: {
    marginTop: 4,
    backgroundColor: colors.white,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    maxWidth: 92,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 3,
  },
  captionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000',
    textAlign: 'center',
  },
  captionSub: {
    fontSize: 8,
    fontWeight: '600',
    color: '#555',
    textAlign: 'center',
    marginTop: 1,
  },
  gpsDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brandTeal,
    borderWidth: 3,
    borderColor: colors.white,
    shadowColor: colors.brandTeal,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  searchWrap: { alignItems: 'center' },
  searchPin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E53935',
    borderWidth: 2.5,
    borderColor: colors.white,
  },
});
