import React from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile, FeedAlbumCard } from '../../data/chatTypes';
import { shortCalendarRange } from '../../lib/trips/dates';
import {
  ALBUM_PLACEHOLDER_DEFAULT,
  ALBUM_PLACEHOLDER_PHOTOS,
} from '../../lib/trips/albumPlaceholders';
import { toImageSource } from '../../lib/images';
import { Avatar } from '../common/Avatar';

/** Default card width used in profile / feed rails (~smaller than half-width). */
export const ALBUM_CARD_WIDTH = 148;

/**
 * Real album photos (string URI or require id) pass through.
 * Bundled placeholder uses raw require() — converting it to a URI can fail and look grey.
 */
function coverSource(src: string | number) {
  if (typeof src === 'number') return src;
  return toImageSource(src);
}

interface AlbumPreviewCardProps {
  album: FeedAlbumCard;
  profiles: Record<string, ChatProfile>;
  onPress: () => void;
  /** Slight counter-clockwise tilt (Figma). Default on. */
  tilt?: boolean;
  width?: number;
  style?: object;
}

/** Shared album cover — stacked, rounded, tilted; same look on profile + feed. */
export function AlbumPreviewCard({
  album,
  profiles,
  onPress,
  tilt = true,
  width = ALBUM_CARD_WIDTH,
  style,
}: AlbumPreviewCardProps) {
  const owner = profiles[album.ownerId];
  // Keep real covers as-is; only fill missing slots with the placeholder.
  const covers = [0, 1, 2].map((i) => {
    const c = album.coverUrls[i];
    if (c != null && c !== '') return c;
    return ALBUM_PLACEHOLDER_PHOTOS[i] ?? ALBUM_PLACEHOLDER_DEFAULT;
  });

  const dateText =
    shortCalendarRange(album.dateStart, album.dateEnd, album.dateLabel ?? '') ||
    album.dateLabel ||
    '';

  const members = album.memberIds
    .map((id) => profiles[id])
    .filter(Boolean) as ChatProfile[];
  const others = members.filter((m) => m.id !== album.ownerId);
  const shown = others.slice(0, 2);
  const extra = Math.max(0, others.length - shown.length);
  const withLabel =
    others.length === 0
      ? null
      : others.length === 1
        ? `with ${others[0].firstName}`
        : `with ${others[0].firstName} and ${others.length - 1} other${
            others.length - 1 === 1 ? '' : 's'
          }`;

  const size = width;
  const stackPad = 10;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.outer,
        { width: size + stackPad, height: size + stackPad, marginRight: 4 },
        tilt && styles.tilt,
        style,
      ]}
    >
      {/* Back stack layers */}
      <View
        style={[
          styles.stackLayer,
          {
            width: size,
            height: size,
            top: 0,
            left: stackPad,
            transform: [{ rotate: '6deg' }],
          },
        ]}
      >
        <Image
          source={coverSource(covers[2])}
          style={styles.stackImg}
          resizeMode="cover"
        />
      </View>
      <View
        style={[
          styles.stackLayer,
          {
            width: size,
            height: size,
            top: 3,
            left: stackPad * 0.55,
            transform: [{ rotate: '3deg' }],
          },
        ]}
      >
        <Image
          source={coverSource(covers[1])}
          style={styles.stackImg}
          resizeMode="cover"
        />
      </View>

      {/* Front card */}
      <ImageBackground
        source={coverSource(covers[0])}
        style={[styles.front, { width: size, height: size }]}
        imageStyle={styles.frontImg}
        resizeMode="cover"
      >
        <View style={styles.dim} />
        <View style={styles.topBlock}>
          <View style={styles.ownerRow}>
            {owner ? <Avatar source={owner.avatar} size={26} /> : null}
            <Text style={styles.owner} numberOfLines={1}>
              {owner?.fullName ?? 'Trip album'}
            </Text>
          </View>
          {withLabel ? (
            <View style={styles.withRow}>
              {shown.map((m, j) => (
                <View
                  key={m.id}
                  style={[styles.avWrap, j > 0 && { marginLeft: -8 }]}
                >
                  <Avatar source={m.avatar} size={16} />
                </View>
              ))}
              {extra > 0 ? (
                <View style={[styles.avWrap, styles.extraAv, { marginLeft: -6 }]}>
                  <Text style={styles.extraTxt}>+{extra}</Text>
                </View>
              ) : null}
              <Text style={styles.withText} numberOfLines={1}>
                {withLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bottomBlock}>
          <View style={styles.placeRow}>
            <Ionicons name="location" size={15} color={colors.white} />
            <Text style={styles.place} numberOfLines={2}>
              {album.destinationCity}
              {album.destinationCountry
                ? `, ${album.destinationCountry}`
                : ''}
            </Text>
          </View>
          {dateText ? (
            <Text style={styles.dates} numberOfLines={1}>
              {dateText}
            </Text>
          ) : null}
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const R = 22;

const styles = StyleSheet.create({
  outer: {
    position: 'relative',
    justifyContent: 'flex-end',
  },
  tilt: {
    transform: [{ rotate: '-4deg' }],
  },
  stackLayer: {
    position: 'absolute',
    borderRadius: R,
    overflow: 'hidden',
    backgroundColor: '#D8DEE8',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  stackImg: {
    width: '100%',
    height: '100%',
    borderRadius: R,
  },
  front: {
    borderRadius: R,
    overflow: 'hidden',
    padding: 10,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 2, height: 6 },
    elevation: 8,
  },
  frontImg: { borderRadius: R },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: R,
  },
  topBlock: { gap: 4 },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  owner: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  withRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 2,
  },
  avWrap: {
    borderWidth: 1.5,
    borderColor: colors.white,
    borderRadius: 12,
  },
  extraAv: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraTxt: {
    fontFamily: fonts.bold,
    fontSize: 7,
    color: colors.white,
  },
  withText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.white,
    opacity: 0.95,
  },
  bottomBlock: { gap: 2 },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 3,
  },
  place: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.white,
    lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  dates: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.white,
    marginLeft: 18,
  },
});
