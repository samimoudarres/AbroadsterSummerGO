import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type {
  FilterChip,
  MapListItem,
  MapListPersonItem,
  MapListPlaceItem,
  MapListProgramItem,
  MapListTripItem,
} from '../../data/types';
import { GroupAvatar } from './GroupAvatar';
import { Avatar } from '../common/Avatar';
import { toImageSource } from '../../lib/images';
import { isOwnSender, isTripParticipant } from '../../lib/chat/repository';

type RowItem =
  | MapListItem
  | { kind: 'section'; id: string; title: string }
  | { kind: 'empty'; id: string; title: string };

interface MapDrawerProps {
  items: MapListItem[];
  filterChips: FilterChip[];
  selectedFilterIds: string[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit?: (q: string) => void;
  onToggleFilter: (chip: FilterChip) => void;
  onPersonPress: (item: MapListPersonItem) => void;
  onTripPress: (item: MapListTripItem) => void;
  onProgramPress: (item: MapListProgramItem) => void;
  onPlacePress: (item: MapListPlaceItem) => void;
  onRequestJoin: (item: MapListTripItem) => void;
  sheetRef?: React.RefObject<BottomSheet | null>;
  /** Bump to open the search field (e.g. from the location pill). */
  searchFocusNonce?: number;
  /** School/program chip is active — show people list (or empty state). */
  filterActive?: boolean;
  filterEmptyLabel?: string;
}

export function MapDrawer({
  items,
  filterChips,
  selectedFilterIds,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onToggleFilter,
  onPersonPress,
  onTripPress,
  onProgramPress,
  onPlacePress,
  onRequestJoin,
  sheetRef,
  searchFocusNonce = 0,
  filterActive = false,
  filterEmptyLabel,
}: MapDrawerProps) {
  const internalRef = useRef<BottomSheet>(null);
  const ref = sheetRef ?? internalRef;
  const inputRef = useRef<TextInput>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const snapPoints = useMemo(() => [72, 320, '62%', '76%'], []);
  // Peek (72) → mid list → tall → search; start mid so list is usable

  useEffect(() => {
    if (searchOpen) {
      ref.current?.snapToIndex(3);
      setTimeout(() => inputRef.current?.focus(), 180);
    }
  }, [searchOpen, ref]);

  useEffect(() => {
    if (!searchFocusNonce) return;
    setSearchOpen(true);
  }, [searchFocusNonce]);

  const rows: RowItem[] = useMemo(() => {
    const places = items.filter((i) => i.kind === 'place');
    const peopleAndTrips = items.filter(
      (i) => i.kind === 'person' || i.kind === 'trip',
    );
    const people = items.filter((i) => i.kind === 'person');
    const schools = items.filter((i) => i.kind === 'program');
    const out: RowItem[] = [];

    if (filterActive) {
      out.push({
        kind: 'section',
        id: 'section-people',
        title: 'Students',
      });
      if (people.length === 0) {
        out.push({
          kind: 'empty',
          id: 'empty-school',
          title:
            filterEmptyLabel ||
            'No Abroadster students here yet',
        });
      } else {
        out.push(...people);
      }
      if (places.length > 0) {
        out.push({ kind: 'section', id: 'section-places', title: 'Places' });
        out.push(...places);
      }
      return out;
    }

    // People → Places → Schools (search + browse)
    if (peopleAndTrips.length > 0) {
      if (searchQuery.trim().length > 0) {
        out.push({
          kind: 'section',
          id: 'section-people',
          title: 'People & trips',
        });
      }
      out.push(...peopleAndTrips);
    }
    if (places.length > 0) {
      out.push({ kind: 'section', id: 'section-places', title: 'Places' });
      out.push(...places);
    }
    if (schools.length > 0) {
      out.push({ kind: 'section', id: 'section-schools', title: 'Schools' });
      out.push(...schools);
    }
    return out;
  }, [items, searchQuery, filterActive, filterEmptyLabel]);

  const dismissKeyboard = () => {
    Keyboard.dismiss();
    inputRef.current?.blur();
  };

  const closeSearch = () => {
    setSearchOpen(false);
    onSearchChange('');
    dismissKeyboard();
  };

  return (
    <BottomSheet
      ref={ref}
      index={1}
      snapPoints={snapPoints}
      enablePanDownToClose={false}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBg}
      style={styles.sheet}
      keyboardBehavior="extend"
      android_keyboardInputMode="adjustResize"
      onChange={(index) => {
        if (index <= 1) dismissKeyboard();
      }}
    >
      <View style={styles.searchRow}>
        <View style={styles.searchTrack}>
          <Pressable
            onPress={() => setSearchOpen(true)}
            hitSlop={8}
            style={styles.searchIconBtn}
          >
            <MaterialIcons name="search" size={22} color="#555" />
          </Pressable>

          {searchOpen ? (
            <View style={styles.expandedSearch}>
              <TextInput
                ref={inputRef}
                value={searchQuery}
                onChangeText={onSearchChange}
                onSubmitEditing={() => {
                  dismissKeyboard();
                  onSearchSubmit?.(searchQuery);
                }}
                placeholder="Search people, schools, places"
                placeholderTextColor={colors.textMuted}
                style={styles.expandedInput}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
              <Pressable onPress={closeSearch} hitSlop={8}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chipsContent}
              keyboardShouldPersistTaps="handled"
            >
              {[...filterChips]
                .sort((a, b) => {
                  const aOn = selectedFilterIds.includes(a.id) ? 0 : 1;
                  const bOn = selectedFilterIds.includes(b.id) ? 0 : 1;
                  return aOn - bOn;
                })
                .map((chip) => {
                const selected = selectedFilterIds.includes(chip.id);
                return (
                  <Pressable
                    key={chip.id}
                    onPress={() => onToggleFilter(chip)}
                    style={[
                      styles.chip,
                      selected
                        ? {
                            borderColor: chip.accent,
                            shadowColor: chip.accent,
                            backgroundColor: `${chip.accent}18`,
                          }
                        : styles.chipIdle,
                    ]}
                  >
                    {chip.logo ? (
                      <Image
                        source={toImageSource(chip.logo)}
                        style={styles.chipLogo}
                      />
                    ) : (
                      <View
                        style={[styles.chipDot, { backgroundColor: chip.accent }]}
                      />
                    )}
                    <View style={styles.chipText}>
                      <Text
                        style={styles.chipLabel}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {chip.label}
                      </Text>
                      {chip.subtitle ? (
                        <Text
                          style={styles.chipSub}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {chip.subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>

      <BottomSheetFlatList
        data={rows}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          searchOpen && searchQuery.trim().length >= 2 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                No people, schools, or places match “{searchQuery.trim()}”
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === 'section') {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{item.title}</Text>
              </View>
            );
          }
          if (item.kind === 'empty') {
            return (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>{item.title}</Text>
              </View>
            );
          }
          if (item.kind === 'person') {
            return (
              <PersonRow
                item={item}
                onPress={() => {
                  dismissKeyboard();
                  onPersonPress(item);
                }}
              />
            );
          }
          if (item.kind === 'trip') {
            return (
              <TripRow
                item={item}
                onPress={() => {
                  dismissKeyboard();
                  onTripPress(item);
                }}
                onRequestJoin={() => {
                  dismissKeyboard();
                  onRequestJoin(item);
                }}
              />
            );
          }
          if (item.kind === 'place') {
            return (
              <PlaceRow
                item={item}
                onPress={() => {
                  dismissKeyboard();
                  onPlacePress(item);
                }}
              />
            );
          }
          return (
            <ProgramRow
              item={item}
              onPress={() => {
                dismissKeyboard();
                onProgramPress(item);
              }}
            />
          );
        }}
      />
    </BottomSheet>
  );
}

function PersonRow({
  item,
  onPress,
}: {
  item: MapListPersonItem;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Avatar source={item.user.avatar} size={44} style={styles.avatar} />
      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
            {item.user.fullName}
          </Text>
          {item.newPosts ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaMuted}>{item.newPosts} new post</Text>
              <View style={styles.newPostDot} />
            </View>
          ) : null}
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: colors.statusGreen }]} />
          <Text style={[styles.statusText, { color: colors.statusGreen }]}>
            {item.statusLabel}
          </Text>
          <View style={styles.tinyDot} />
          <Text style={styles.detailText} numberOfLines={1}>
            {item.detailLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function TripRow({
  item,
  onPress,
  onRequestJoin,
}: {
  item: MapListTripItem;
  onPress: () => void;
  onRequestJoin: () => void;
}) {
  const statusColor =
    item.status === 'past'
      ? colors.filterGray
      : item.status === 'upcoming'
        ? colors.statusOrange
        : colors.statusYellow;
  // Never offer join on a trip you're already on (owner or member)
  const isParticipant =
    isTripParticipant(
      {
        ownerId: undefined,
        memberIds: item.trip.memberIds,
        myJoinStatus: null,
      },
      null,
    ) ||
    item.trip.members.some((m) => isOwnSender(m.userId, null));
  const showJoin =
    !isParticipant &&
    item.trip.openToJoin &&
    (item.status === 'planning' || item.status === 'upcoming');
  const destination = [item.trip.destinationCity, item.trip.destinationCountry]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <GroupAvatar avatars={item.trip.members.map((m) => m.avatar)} />
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {item.title}
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {item.statusLabel}
          </Text>
          {item.trip.openToJoin ? (
            <>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: colors.openJoin, marginLeft: 8 },
                ]}
              />
              <Text style={[styles.statusText, { color: colors.openJoin }]}>
                Open to Join!
              </Text>
            </>
          ) : null}
        </View>
        <Text style={styles.detailText} numberOfLines={2}>
          {destination
            ? `${destination}${item.trip.dateLabel ? ` · ${item.trip.dateLabel}` : ''}`
            : item.detailLabel}
        </Text>
      </View>
      {showJoin ? (
        <Pressable style={styles.joinBtn} onPress={onRequestJoin}>
          <View style={styles.joinCircle}>
            <Ionicons name="paper-plane" size={14} color={colors.white} />
          </View>
          <Text style={styles.joinText}>Request to Join</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function PlaceRow({
  item,
  onPress,
}: {
  item: MapListPlaceItem;
  onPress: () => void;
}) {
  const subtitle = [item.cityName, item.countryName]
    .filter(Boolean)
    .filter((part, i, arr) => arr.indexOf(part) === i)
    .join(', ');

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.avatar, styles.placeAvatar]}>
        <Ionicons name="location" size={22} color={colors.programBlue} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {item.cityName}
        </Text>
        <View style={styles.statusRow}>
          <View
            style={[styles.statusDot, { backgroundColor: colors.programBlue }]}
          />
          <Text
            style={[styles.statusText, { color: colors.programBlue }]}
            numberOfLines={1}
          >
            {subtitle || item.placeName}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function ProgramRow({
  item,
  onPress,
}: {
  item: MapListProgramItem;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Image
        source={toImageSource(item.program.logo)}
        style={[styles.avatar, styles.programAvatar]}
      />
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {item.program.name}
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: colors.programBlue }]} />
          <Text style={[styles.statusText, { color: colors.programBlue }]}>
            Study abroad program
          </Text>
          <View style={styles.tinyDot} />
          <Text style={styles.detailText}>
            {item.program.studentCount === 0
              ? 'No students on Abroadster yet'
              : `${item.program.studentCount} student${
                  item.program.studentCount === 1 ? '' : 's'
                } on Abroadster`}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    zIndex: 30,
    elevation: 30,
  },
  sheetBg: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -1 },
  },
  handle: {
    width: 47,
    height: 3,
    backgroundColor: '#C8C8C8',
    borderRadius: 2,
  },
  searchRow: {
    paddingHorizontal: 13,
    paddingTop: 4,
    paddingBottom: 8,
  },
  searchTrack: {
    backgroundColor: colors.searchTrack,
    height: 41,
    borderRadius: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 8,
    overflow: 'hidden',
  },
  searchIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  expandedSearch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandedInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.black,
    paddingVertical: 6,
  },
  cancelText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.programBlue,
    paddingRight: 4,
  },
  chipsScroll: {
    flex: 1,
    minWidth: 0,
  },
  chipsContent: {
    alignItems: 'center',
    paddingRight: 12,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 40,
    borderWidth: 1,
    height: 30,
    maxHeight: 30,
    paddingHorizontal: 10,
    marginRight: 8,
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
    maxWidth: 200,
    overflow: 'hidden',
    flexShrink: 0,
  },
  chipIdle: {
    borderColor: colors.filterGray,
    shadowColor: colors.filterGray,
  },
  chipDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
    flexShrink: 0,
  },
  chipLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
    backgroundColor: '#F2F2F2',
    flexShrink: 0,
  },
  chipText: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 152,
    overflow: 'hidden',
  },
  chipLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.black,
    overflow: 'hidden',
  },
  chipSub: {
    fontFamily: fonts.regular,
    fontSize: 8,
    color: colors.textMuted,
    marginTop: -2,
    overflow: 'hidden',
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyWrap: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 12,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 6,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5E5',
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
    gap: 10,
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 100,
    backgroundColor: colors.groupAvatarBg,
  },
  programAvatar: {
    borderWidth: 2,
    borderColor: colors.white,
  },
  placeAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandMint,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.black,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaMuted: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.textMuted,
  },
  newPostDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.newPost,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    flexWrap: 'wrap',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontFamily: fonts.regular,
    fontSize: 10,
  },
  tinyDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textMuted,
    marginHorizontal: 5,
  },
  detailText: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.textMuted,
    flexShrink: 1,
  },
  joinBtn: {
    width: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinCircle: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: colors.openJoin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinText: {
    fontFamily: fonts.regular,
    fontSize: 8,
    color: colors.openJoin,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 9,
  },
});
