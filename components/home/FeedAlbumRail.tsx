import React, { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile, FeedAlbumCard } from '../../data/chatTypes';
import { AlbumPreviewCard } from './AlbumPreviewCard';

/** Max albums shown in a home-feed rail (2 visible columns × up to 3). */
const HOME_ALBUM_CAP = 6;

interface FeedAlbumRailProps {
  albums: FeedAlbumCard[];
  profiles: Record<string, ChatProfile>;
  onOpenAlbum: (tripId: string) => void;
  /** Show the “Albums” title (home feed). */
  showTitle?: boolean;
}

/**
 * Home feed albums: 2×2 visible (two columns), horizontal scroll for up to 6.
 * Profile should use a single-row rail separately.
 */
export function FeedAlbumRail({
  albums,
  profiles,
  onOpenAlbum,
  showTitle = true,
}: FeedAlbumRailProps) {
  const [railW, setRailW] = useState(0);

  const capped = useMemo(
    () => albums.slice(0, HOME_ALBUM_CAP),
    [albums],
  );

  const columns = useMemo(() => {
    const cols: FeedAlbumCard[][] = [];
    for (let i = 0; i < capped.length; i += 2) {
      cols.push(capped.slice(i, i + 2));
    }
    return cols;
  }, [capped]);

  if (capped.length === 0) return null;

  const padX = 12;
  const colGap = 12;
  // Exactly two columns fit on screen → 4 albums visible; more columns scroll
  const colW =
    railW > 0 ? Math.floor((railW - padX * 2 - colGap) / 2) : 168;
  const cardW = Math.max(120, colW - 8);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== railW) setRailW(w);
  };

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {showTitle ? <Text style={styles.title}>Albums</Text> : null}
      {railW > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          contentContainerStyle={[
            styles.rail,
            { paddingHorizontal: padX, gap: colGap },
          ]}
        >
          {columns.map((col, ci) => (
            <View
              key={`col-${ci}`}
              style={[styles.col, { width: colW, gap: 14 }]}
            >
              {col.map((al) => (
                <AlbumPreviewCard
                  key={al.tripId}
                  album={al}
                  profiles={profiles}
                  width={cardW}
                  tilt
                  onPress={() => onOpenAlbum(al.tripId)}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={{ height: cardW * 2 + 40 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 8, paddingBottom: 12 },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 25,
    color: colors.openJoin,
    marginBottom: 10,
    paddingHorizontal: 12,
    textShadowColor: 'rgba(23,88,100,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  rail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  col: {
    flexDirection: 'column',
  },
});
