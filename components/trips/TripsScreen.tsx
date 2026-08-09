import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile, ChatTrip } from '../../data/chatTypes';
import {
  chatRepo,
  initChat,
  isTripParticipant,
  subscribeChat,
} from '../../lib/chat/repository';
import {
  upcomingWeekends,
  tripOverlapsWeekend,
  tripInDateRange,
} from '../../lib/trips/dates';
import { presentLocalNotification } from '../../lib/trips/push';
import { PHONE_SAFE_INSETS } from '../layout/PhoneShell';
import { ProfileModal } from '../profile/ProfileModal';
import { getUserById } from '../../data/mockMapData';
import type { UserProfile } from '../../data/types';
import { CalendarRangeModal } from './CalendarRangeModal';
import { CountryFilterModal } from './CountryFilterModal';
import { TripCard } from './TripCard';
import { TripDetailSheet } from './TripDetailSheet';

const CREATE_PLANE = require('../../assets/trips/create-plane.png');
const GLOBE = require('../../assets/trips/globe.png');

type FriendFilter = 'all' | 'home' | 'abroad';
type FeedTab = 'friends' | 'mine';

interface TripsScreenProps {
  onOpenProfile?: (user: UserProfile) => void;
  onCreateTrip?: () => void;
  onOpenAlbum?: (trip: ChatTrip) => void;
  onAirMail?: (userId: string) => void;
}

export function TripsScreen({
  onOpenProfile,
  onCreateTrip,
  onOpenAlbum,
  onAirMail,
}: TripsScreenProps) {
  const insets = useSafeAreaInsets();
  const topPad =
    (insets.top > 0 ? insets.top : Platform.OS === 'web' ? PHONE_SAFE_INSETS.top : 12) +
    8;

  const [me, setMe] = useState<ChatProfile | null>(null);
  const [trips, setTrips] = useState<ChatTrip[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [feedTab, setFeedTab] = useState<FeedTab>('friends');

  const [countries, setCountries] = useState<string[]>([]);
  const [dateStart, setDateStart] = useState<Date | null>(null);
  const [dateEnd, setDateEnd] = useState<Date | null>(null);
  const [friendFilter, setFriendFilter] = useState<FriendFilter>('all');

  const [countryOpen, setCountryOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<ChatTrip | null>(null);
  const [profileUser, setProfileUser] = useState<UserProfile | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const refresh = useCallback(async () => {
    await initChat();
    const meProfile = await chatRepo.getMe();
    const feed = await chatRepo.listTripsFeed();
    const friends = await chatRepo.getFriendIds();
    const map: Record<string, ChatProfile> = {};
    for (const t of feed) {
      for (const id of t.memberIds) {
        if (!map[id]) {
          const p = await chatRepo.getProfile(id);
          if (p) map[id] = p;
        }
      }
    }
    setMe(meProfile);
    setTrips(feed);
    setFriendIds(friends);
    setProfiles(map);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribeChat(() => {
      refresh();
    });
    return () => {
      unsub();
    };
  }, [refresh]);

  const schoolHome = me?.homeUniversity ?? 'Home school';
  const schoolAbroad = me?.studyAbroadProgram ?? 'Abroad program';

  const filtered = useMemo(() => {
    const friendSet = new Set(friendIds);
    return trips.filter((t) => {
      if (countries.length > 0 && !countries.includes(t.destinationCountry)) {
        return false;
      }
      if (dateStart && dateEnd) {
        if (!tripInDateRange(t.dateStart, t.dateEnd, dateStart, dateEnd)) {
          return false;
        }
      }

      const isMine = isTripParticipant(t, me?.id);

      if (feedTab === 'mine') {
        return isMine;
      }

      const members = t.memberIds.map((id) => profiles[id]).filter(Boolean);
      if (friendFilter === 'all') {
        const myIds = new Set([me?.id, 'user-me'].filter(Boolean) as string[]);
        return (
          t.memberIds.some((id) => myIds.has(id)) ||
          t.memberIds.some((id) => friendSet.has(id))
        );
      }
      if (friendFilter === 'home') {
        return members.some((p) => p.homeUniversity === schoolHome);
      }
      return members.some((p) => p.studyAbroadProgram === schoolAbroad);
    });
  }, [
    trips,
    countries,
    dateStart,
    dateEnd,
    friendFilter,
    friendIds,
    profiles,
    me,
    schoolHome,
    schoolAbroad,
    feedTab,
  ]);

  const sections = useMemo(() => {
    const weekends = upcomingWeekends(10);
    return weekends
      .map((w) => ({
        ...w,
        trips: filtered.filter((t) =>
          tripOverlapsWeekend(t.dateStart, t.dateEnd, w),
        ),
      }))
      .filter((s) => s.trips.length > 0);
  }, [filtered]);

  const openFriendsFilter = () => setFriendsOpen(true);

  const pickFriendFilter = (value: FriendFilter) => {
    setFriendFilter(value);
    setFriendsOpen(false);
  };

  const followAlbum = async (trip: ChatTrip) => {
    if (trip.isFollowingAlbum) {
      await chatRepo.unfollowTripAlbum(trip.id);
      await refresh();
      if (selectedTrip?.id === trip.id) {
        const updated = await chatRepo.getTrip(trip.id);
        setSelectedTrip(updated);
      }
      return;
    }
    await chatRepo.followTripAlbum(trip.id);
    await presentLocalNotification({
      title: 'Following album',
      body: `You're now following the ${trip.destinationCity} trip album.`,
      data: { tripId: trip.id },
    });
    for (const memberId of trip.memberIds) {
      if (memberId === me?.id || memberId === 'user-me') continue;
      const member = profiles[memberId];
      await presentLocalNotification({
        title: 'Album follow',
        body: `${me?.fullName ?? 'Someone'} followed your ${trip.destinationCity} album`,
        data: { tripId: trip.id, forUser: member?.id },
      });
      break;
    }
    await refresh();
    if (selectedTrip?.id === trip.id) {
      const updated = await chatRepo.getTrip(trip.id);
      setSelectedTrip(updated);
    }
  };

  const requestJoin = async (trip: ChatTrip) => {
    if (trip.myJoinStatus === 'pending') {
      await chatRepo.cancelTripJoin(trip.id);
      await refresh();
      if (selectedTrip?.id === trip.id) {
        const updated = await chatRepo.getTrip(trip.id);
        setSelectedTrip(updated);
      }
      return;
    }
    await chatRepo.requestTripJoin(trip.id);
    Alert.alert(
      'Request sent',
      `Your join request for ${trip.destinationCity} was sent. Tap again to unrequest.`,
    );
    await refresh();
    if (selectedTrip?.id === trip.id) {
      const updated = await chatRepo.getTrip(trip.id);
      setSelectedTrip(updated);
    }
  };

  const cancelJoin = async (trip: ChatTrip) => {
    await chatRepo.cancelTripJoin(trip.id);
    await refresh();
    if (selectedTrip?.id === trip.id) {
      const updated = await chatRepo.getTrip(trip.id);
      setSelectedTrip(updated);
    }
  };

  const acceptInvite = async (trip: ChatTrip) => {
    const inviteId = trip.myPendingInviteId;
    if (!inviteId) {
      Alert.alert(
        'Invite not found',
        'Open the invite from Notifications to accept it.',
      );
      return;
    }
    await chatRepo.respondTripInvite(inviteId, true);
    Alert.alert('You’re in!', `Welcome to the trip to ${trip.destinationCity}.`);
    await refresh();
    if (selectedTrip?.id === trip.id) {
      const updated = await chatRepo.getTrip(trip.id);
      setSelectedTrip(updated);
    }
  };

  const countryLabel =
    countries.length === 0
      ? 'Any country'
      : countries.length === 1
        ? countries[0]
        : `${countries.length} countries`;

  const dateLabel =
    dateStart && dateEnd
      ? `${dateStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${dateEnd.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
      : 'Upcoming';

  const friendLabel =
    friendFilter === 'all'
      ? 'All friends'
      : friendFilter === 'home'
        ? schoolHome
        : schoolAbroad;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad, paddingBottom: 24 }}
        stickyHeaderIndices={[]}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>Trips</Text>
          <Pressable
            style={styles.createWrap}
            onPress={() => onCreateTrip?.()}
          >
            <Text style={styles.createText}>Create Trip</Text>
            {/* Figma: 55px ring + 66px plane overlay (offset -9,-11) so arc sits on rim */}
            <View style={styles.createIcon}>
              <View style={styles.createCircle}>
                <Ionicons name="add" size={30} color={colors.openJoin} />
              </View>
              <Image
                source={CREATE_PLANE}
                style={styles.createPlane}
                resizeMode="contain"
              />
            </View>
          </Pressable>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, feedTab === 'friends' && styles.tabActive]}
            onPress={() => setFeedTab('friends')}
          >
            <Text
              style={[styles.tabText, feedTab === 'friends' && styles.tabTextActive]}
            >
              Friends
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, feedTab === 'mine' && styles.tabActive]}
            onPress={() => setFeedTab('mine')}
          >
            <Text
              style={[styles.tabText, feedTab === 'mine' && styles.tabTextActive]}
            >
              My trips
            </Text>
          </Pressable>
        </View>

        <View style={styles.filters}>
          <FilterPill
            icon={
              <Image
                source={GLOBE}
                style={styles.globeIcon}
                resizeMode="contain"
              />
            }
            label={countryLabel}
            wide
            onPress={() => setCountryOpen(true)}
          />
          <View style={styles.filterRow}>
            <FilterPill
              icon={
                <MaterialIcons name="calendar-today" size={18} color="#555" />
              }
              label={dateLabel}
              onPress={() => setCalendarOpen(true)}
            />
            {feedTab === 'friends' ? (
              <FilterPill
                icon={<Ionicons name="people" size={18} color="#555" />}
                label={friendLabel}
                onPress={openFriendsFilter}
              />
            ) : (
              <View style={[styles.pill, styles.pillMuted]}>
                <Ionicons name="person" size={18} color="#555" />
                <Text style={styles.pillLabel} numberOfLines={1}>
                  Just yours
                </Text>
              </View>
            )}
          </View>
        </View>

        {sections.length === 0 ? (
          <Text style={styles.empty}>
            {feedTab === 'mine'
              ? 'You don’t have any trips yet. Tap Create Trip to plan one.'
              : 'No trips match these filters. Add friends or clear filters to see more.'}
          </Text>
        ) : (
          sections.map((section, idx) => (
            <View key={section.key} style={styles.section}>
              <View style={styles.sectionHead}>
                <Text
                  style={[
                    styles.sectionTitle,
                    idx === 0 && styles.sectionTitleAccent,
                  ]}
                >
                  {section.label}
                </Text>
                <Text style={styles.sectionCount}>{section.trips.length}</Text>
              </View>
              <View style={styles.sectionLine} />
              {section.trips.map((trip) => {
                const isParticipant = isTripParticipant(trip, me?.id);
                return (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  members={trip.memberIds
                    .map((id) => profiles[id])
                    .filter(Boolean) as ChatProfile[]}
                  isParticipant={isParticipant}
                  onPress={() => {
                    if (isParticipant && onOpenAlbum) onOpenAlbum(trip);
                    else setSelectedTrip(trip);
                  }}
                  onFollowAlbum={() => followAlbum(trip)}
                  onRequestJoin={() => requestJoin(trip)}
                  onCancelRequest={() => void cancelJoin(trip)}
                  onAcceptInvite={() => void acceptInvite(trip)}
                />
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      <CountryFilterModal
        visible={countryOpen}
        selected={countries}
        onClose={() => setCountryOpen(false)}
        onChange={setCountries}
      />
      <CalendarRangeModal
        visible={calendarOpen}
        start={dateStart}
        end={dateEnd}
        onClose={() => setCalendarOpen(false)}
        onChange={(s, e) => {
          setDateStart(s);
          setDateEnd(e);
        }}
      />

      <Modal visible={friendsOpen} transparent animationType="fade">
        <View style={styles.friendsOverlay}>
          <Pressable
            style={styles.friendsBackdrop}
            onPress={() => setFriendsOpen(false)}
          />
          <View style={styles.friendsSheet}>
            <Text style={styles.friendsTitle}>Whose trips?</Text>
            {(
              [
                { id: 'all' as const, label: 'All friends' },
                { id: 'home' as const, label: schoolHome },
                { id: 'abroad' as const, label: schoolAbroad },
              ]
            ).map((opt) => (
              <Pressable
                key={opt.id}
                style={styles.friendsRow}
                onPress={() => pickFriendFilter(opt.id)}
              >
                <Text style={styles.friendsRowText}>{opt.label}</Text>
                {friendFilter === opt.id ? (
                  <Ionicons name="checkmark" size={20} color={colors.openJoin} />
                ) : null}
              </Pressable>
            ))}
            <Pressable
              style={styles.friendsCancel}
              onPress={() => setFriendsOpen(false)}
            >
              <Text style={styles.friendsCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <TripDetailSheet
        visible={Boolean(selectedTrip)}
        trip={selectedTrip}
        onClose={() => setSelectedTrip(null)}
        onFollowAlbum={followAlbum}
        onRequestJoin={requestJoin}
        onCancelRequest={(t) => void cancelJoin(t)}
        onAcceptInvite={(t) => void acceptInvite(t)}
        onSelectUser={(user) => {
          const mapped =
            getUserById(user.id) ??
            ({
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              fullName: user.fullName,
              avatar: user.avatar,
              homeUniversity: user.homeUniversity,
              studyAbroadProgram: user.studyAbroadProgram,
              hostCity: '',
              hostCountry: '',
              semester: '',
              countriesVisited: 0,
              isFriend: true,
              locationPrivacy: 'city',
              latitude: 0,
              longitude: 0,
              locationLabel: '',
              passportBadges: [],
              posts: [],
              albums: [],
            } as unknown as UserProfile);
          setSelectedTrip(null);
          if (onOpenProfile) onOpenProfile(mapped);
          else {
            setProfileUser(mapped);
            setShowProfile(true);
          }
        }}
      />

      <ProfileModal
        visible={showProfile}
        user={profileUser}
        onClose={() => setShowProfile(false)}
        onAirMail={(userId) => {
          setShowProfile(false);
          onAirMail?.(userId);
        }}
      />
    </View>
  );
}

function FilterPill({
  icon,
  label,
  onPress,
  wide,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <Pressable style={[styles.pill, wide && styles.pillWide]} onPress={onPress}>
      {icon}
      <Text style={styles.pillLabel} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="caret-down" size={12} color="#666" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brandCream },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 35,
    color: colors.openJoin,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: colors.brandMint,
    borderRadius: 14,
    padding: 3,
    gap: 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.openJoin,
  },
  createWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  createText: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.brandTealDeep,
    marginRight: 4,
  },
  createIcon: {
    width: 66,
    height: 66,
    position: 'relative',
  },
  createCircle: {
    position: 'absolute',
    // Figma: circle at (324,69), plane at (315,58) → circle inset (9,11) in 66 box
    left: 9,
    top: 11,
    width: 55,
    height: 55,
    borderRadius: 27.5,
    borderWidth: 2,
    borderColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  createPlane: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 66,
    height: 66,
  },
  globeIcon: {
    width: 22,
    height: 22,
  },
  filters: { paddingHorizontal: 14, gap: 10, marginBottom: 18 },
  filterRow: { flexDirection: 'row', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 37,
    paddingHorizontal: 12,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: colors.filterGray,
    backgroundColor: colors.white,
    shadowColor: colors.filterGray,
    shadowOpacity: 1,
    shadowRadius: 4,
    flexShrink: 1,
    maxWidth: '48%',
  },
  pillMuted: {
    shadowOpacity: 0,
    backgroundColor: colors.brandCream,
  },
  pillWide: { maxWidth: 220, alignSelf: 'flex-start' },
  pillLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.black,
    flexShrink: 1,
  },
  friendsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  friendsBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  friendsSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    paddingTop: 12,
  },
  friendsTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    paddingHorizontal: 18,
    paddingBottom: 8,
    color: colors.textMuted,
  },
  friendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
  },
  friendsRowText: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.black,
    flex: 1,
    paddingRight: 12,
  },
  friendsCancel: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  friendsCancelText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textMuted,
  },
  section: { marginBottom: 8 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.black,
    flex: 1,
  },
  sectionTitleAccent: {
    color: colors.openJoin,
  },
  sectionCount: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: 'rgba(0,0,0,0.5)',
  },
  sectionLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#CFCFCF',
    marginHorizontal: 18,
    marginBottom: 2,
  },
  empty: {
    padding: 24,
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: fonts.regular,
  },
});
