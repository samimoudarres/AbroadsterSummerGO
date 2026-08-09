import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile, ChatTrip } from '../../data/chatTypes';
import { shortCalendarRange } from '../../lib/trips/dates';
import { albumPreviewSources } from '../../lib/trips/albumPlaceholders';
import { ensureImageUri, toImageSource } from '../../lib/images';
import { Avatar } from '../common/Avatar';

interface FollowAlbumBannerProps {
  trip: ChatTrip;
  members: ChatProfile[];
  onFollow: () => void;
}

function StackPhoto({
  source,
  style,
}: {
  source: string | number;
  style: object;
}) {
  const [uri, setUri] = useState<string | null>(
    typeof source === 'string' ? source : null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof source === 'string') {
        if (!cancelled) setUri(source);
        return;
      }
      try {
        const resolved = await ensureImageUri(source);
        if (!cancelled) setUri(resolved || null);
      } catch {
        if (!cancelled) setUri(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (uri) {
    return <Image source={{ uri }} style={style} resizeMode="cover" />;
  }
  return <Image source={toImageSource(source)} style={style} resizeMode="cover" />;
}

/** Pixel-matched to Figma 138:95 — stacked album preview + gradient CTA. */
export function FollowAlbumBanner({
  trip,
  members,
  onFollow,
}: FollowAlbumBannerProps) {
  const owner = members[0];
  const other = members[1];
  const extras = Math.max(0, members.length - 2);

  // Front card = previews[0]; cards behind = [1], [2]. Your 3 scenic placeholders until real uploads.
  const previews = albumPreviewSources(trip.albumPreviewUrls);

  const dateText = shortCalendarRange(
    trip.dateStart,
    trip.dateEnd,
    trip.dateLabel,
  );

  return (
    <Pressable style={styles.row} onPress={onFollow}>
      <View style={styles.stackWrap}>
        {[2, 1, 0].map((i) => {
          const src = previews[i];
          const rot = i === 0 ? -8.7 : i === 1 ? -4.6 : -1;
          return (
            <View
              key={i}
              style={[
                styles.card,
                {
                  transform: [{ rotate: `${rot}deg` }],
                  zIndex: 3 - i,
                  left: i * 6,
                  top: i * 2,
                },
              ]}
            >
              <StackPhoto source={src} style={styles.cardImg} />
              <View style={styles.cardDim} />
            </View>
          );
        })}

        <View style={styles.overlayContent} pointerEvents="none">
          <View style={styles.peopleRow}>
            {owner ? <Avatar source={owner.avatar} size={31} /> : null}
            <View style={{ marginLeft: 6, flex: 1, paddingRight: 28 }}>
              <Text style={styles.ownerName} numberOfLines={1}>
                {owner?.fullName ?? 'Traveler'}
              </Text>
              <View style={styles.withRow}>
                {other ? (
                  <Avatar
                    source={other.avatar}
                    size={18}
                    style={{ marginRight: 4 }}
                  />
                ) : null}
                <Text style={styles.withText}>
                  with{' '}
                  <Text style={styles.withBold}>{other?.firstName ?? 'friends'}</Text>
                  {extras > 0 ? (
                    <>
                      {' '}
                      and <Text style={styles.withBold}>{extras} others</Text>
                    </>
                  ) : null}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.placeBlock}>
            <Ionicons name="location-outline" size={22} color={colors.white} />
            <View style={{ flex: 1, paddingRight: 4 }}>
              <Text style={styles.city}>
                {trip.destinationCity},{'\n'}
                {trip.destinationCountry}
              </Text>
              <Text style={styles.dates} numberOfLines={1}>
                {dateText}
              </Text>
            </View>
          </View>
        </View>

        {trip.isFollowingAlbum ? (
          <View style={styles.followedBadge} pointerEvents="none">
            <Ionicons name="checkmark-circle" size={26} color={colors.white} />
          </View>
        ) : null}
      </View>

      <View style={styles.cta}>
        <Text style={styles.ctaText}>
          {trip.isFollowingAlbum
            ? "Following this\ntrip's Album"
            : "Follow this\ntrip's Album"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  stackWrap: {
    width: 168,
    height: 186,
    position: 'relative',
  },
  card: {
    position: 'absolute',
    width: 137,
    height: 161,
    borderRadius: 27,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  cardImg: { width: '100%', height: '100%' },
  cardDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  overlayContent: {
    position: 'absolute',
    left: 8,
    top: 28,
    right: 8,
    bottom: 16,
    zIndex: 10,
    justifyContent: 'space-between',
  },
  peopleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  ownerName: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.white,
  },
  withRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  withText: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.white,
  },
  withBold: { fontFamily: fonts.bold },
  placeBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  city: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.white,
    lineHeight: 20,
  },
  dates: {
    fontSize: 12,
    color: colors.white,
    marginTop: 4,
  },
  // Top-right so it never covers the date line at the bottom
  followedBadge: {
    position: 'absolute',
    right: 14,
    top: 18,
    zIndex: 12,
    backgroundColor: 'rgba(23,88,100,0.95)',
    borderRadius: 20,
    padding: 2,
  },
  cta: { flex: 1, paddingLeft: 4 },
  ctaText: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    lineHeight: 30,
    color: colors.openJoin,
    textShadowColor: 'rgba(23,88,100,0.35)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
});
