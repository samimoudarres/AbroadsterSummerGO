import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { AlbumPhoto, ChatProfile, ChatTrip } from '../../data/chatTypes';
import { chatRepo, isOwnSender, isTripParticipant } from '../../lib/chat/repository';
import { shortCalendarRange } from '../../lib/trips/dates';
import {
  canRequestTripJoin,
  getTripDisplayStatus,
  tripStatusColor,
  tripStatusLabel,
} from '../../lib/trips/status';
import { toImageSource } from '../../lib/images';
import { Avatar } from '../common/Avatar';
import { FollowAlbumBanner } from './FollowAlbumBanner';

interface TaggedTripSheetProps {
  visible: boolean;
  tripId: string | null;
  onClose: () => void;
  onSelectUser: (user: ChatProfile) => void;
  onOpenFullAlbum: (tripId: string) => void;
  onFollowAlbum?: (trip: ChatTrip) => void;
  onRequestJoin?: (trip: ChatTrip) => void;
  onCancelRequest?: (trip: ChatTrip) => void;
}

/**
 * Instagram-style bottom sheet for a trip tagged on a post.
 * Shows destination / dates / travelers + album photo grid.
 */
export function TaggedTripSheet({
  visible,
  tripId,
  onClose,
  onSelectUser,
  onOpenFullAlbum,
  onFollowAlbum,
  onRequestJoin,
  onCancelRequest,
}: TaggedTripSheetProps) {
  const [trip, setTrip] = useState<ChatTrip | null>(null);
  const [members, setMembers] = useState<ChatProfile[]>([]);
  const [pending, setPending] = useState<ChatProfile[]>([]);
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [meId, setMeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [followingBusy, setFollowingBusy] = useState(false);

  useEffect(() => {
    if (!visible || !tripId) {
      setTrip(null);
      setMembers([]);
      setPending([]);
      setPhotos([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const me = await chatRepo.getMe();
        const t = await chatRepo.getTrip(tripId);
        if (!t || cancelled) return;
        const memberProfiles = (
          await Promise.all(t.memberIds.map((id) => chatRepo.getProfile(id)))
        ).filter(Boolean) as ChatProfile[];
        const pendingProfiles = (
          await Promise.all(
            (t.pendingInviteeIds ?? []).map((id) => chatRepo.getProfile(id)),
          )
        ).filter(Boolean) as ChatProfile[];
        const albumPhotos = await chatRepo.getTripAlbumPhotos(tripId);
        if (cancelled) return;
        setMeId(me.id);
        setTrip(t);
        setMembers(memberProfiles);
        setPending(pendingProfiles);
        setPhotos(albumPhotos);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, tripId]);

  const dateText = useMemo(() => {
    if (!trip) return '';
    return (
      shortCalendarRange(trip.dateStart, trip.dateEnd, trip.dateLabel) ||
      trip.dateLabel ||
      ''
    );
  }, [trip]);

  if (!visible || !tripId) return null;

  const displayStatus = trip ? getTripDisplayStatus(trip) : 'planning';
  const statusColor = tripStatusColor(displayStatus);
  const showFollow = displayStatus === 'upcoming';
  const isMember = isTripParticipant(trip, meId);
  const isInvited =
    Boolean(trip) &&
    !isMember &&
    Boolean(
      trip!.myPendingInviteId ||
        (trip!.pendingInviteeIds ?? []).some((id) => isOwnSender(id, meId)),
    );
  const showJoin = canRequestTripJoin(trip, { isMember, isInvited });
  const requested = trip?.myJoinStatus === 'pending';
  const travelerCount = members.length + pending.length;

  const toggleFollow = async () => {
    if (!trip || followingBusy) return;
    setFollowingBusy(true);
    try {
      if (trip.isFollowingAlbum) {
        await chatRepo.unfollowTripAlbum(trip.id);
      } else {
        await chatRepo.followTripAlbum(trip.id);
      }
      const updated = await chatRepo.getTrip(trip.id);
      if (updated) setTrip(updated);
      onFollowAlbum?.(updated ?? trip);
    } finally {
      setFollowingBusy(false);
    }
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {loading && !trip ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.programBlue} />
            <Text style={styles.loadingText}>Loading trip…</Text>
          </View>
        ) : trip ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            <View style={styles.header}>
              <View style={styles.planeBubble}>
                <Ionicons name="airplane" size={16} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>Trip</Text>
                <Text style={styles.title} numberOfLines={2}>
                  {trip.destinationCity}
                  {trip.destinationCountry ? `, ${trip.destinationCountry}` : ''}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusLabel, { color: statusColor }]}>
                {tripStatusLabel(displayStatus)}
              </Text>
              {trip.openToJoin && displayStatus !== 'past' ? (
                <Text style={styles.openLabel}>· Open to Join</Text>
              ) : null}
            </View>

            {dateText ? (
              <View style={styles.dateChip}>
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={colors.programBlue}
                />
                <Text style={styles.dateText}>{dateText}</Text>
              </View>
            ) : null}
            {isMember && trip.leavingTime ? (
              <Text style={styles.desc}>Leaving: {trip.leavingTime}</Text>
            ) : null}
            {typeof trip.maxMembers === 'number' && trip.maxMembers > 0 ? (
              <Text style={styles.desc}>
                Capacity: {travelerCount}/{trip.maxMembers}
              </Text>
            ) : null}

            {isMember && trip.description ? (
              <Text style={styles.desc}>{trip.description}</Text>
            ) : null}

            {showFollow && onFollowAlbum ? (
              <View style={{ marginTop: 8 }}>
                <FollowAlbumBanner
                  trip={trip}
                  members={members}
                  onFollow={() => void toggleFollow()}
                />
              </View>
            ) : !isMember ? (
              <Pressable
                style={[
                  styles.followRow,
                  trip.isFollowingAlbum && styles.followRowOn,
                ]}
                onPress={() => void toggleFollow()}
                disabled={followingBusy}
              >
                <Ionicons
                  name={trip.isFollowingAlbum ? 'checkmark-circle' : 'images-outline'}
                  size={18}
                  color={trip.isFollowingAlbum ? colors.openJoin : colors.programBlue}
                />
                <Text
                  style={[
                    styles.followRowText,
                    trip.isFollowingAlbum && { color: colors.openJoin },
                  ]}
                >
                  {trip.isFollowingAlbum ? 'Following album' : 'Follow album'}
                </Text>
              </Pressable>
            ) : null}

            {isInvited ? (
              <Pressable
                style={styles.joinWide}
                onPress={async () => {
                  if (!trip?.myPendingInviteId) return;
                  try {
                    await chatRepo.respondTripInvite(trip.myPendingInviteId, true);
                    const updated = await chatRepo.getTrip(trip.id);
                    if (updated) setTrip(updated);
                  } catch {
                    // keep sheet open
                  }
                }}
              >
                <Ionicons name="checkmark-circle" size={16} color={colors.white} />
                <Text style={styles.joinWideText}>Accept invite</Text>
              </Pressable>
            ) : null}

            <View style={styles.travelersHead}>
              <Ionicons name="people" size={16} color={colors.black} />
              <Text style={styles.travelersTitle}>Travelers</Text>
              <Text style={styles.travelersCount}>{travelerCount}</Text>
              {showJoin && onRequestJoin ? (
                <Pressable
                  style={[styles.joinBeside, requested && styles.joinBesideOff]}
                  onPress={() =>
                    requested ? onCancelRequest?.(trip) : onRequestJoin(trip)
                  }
                >
                  <Ionicons
                    name={requested ? 'close-circle' : 'paper-plane'}
                    size={14}
                    color={colors.white}
                  />
                  <Text style={styles.joinBesideText}>
                    {requested ? 'Unrequest' : 'Request to Join'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.travelersRow}
            >
              {members.map((m) => (
                <Pressable
                  key={m.id}
                  style={styles.traveler}
                  onPress={() => onSelectUser(m)}
                >
                  <Avatar source={m.avatar} size={48} />
                  <Text style={styles.travelerName} numberOfLines={1}>
                    {m.firstName}
                  </Text>
                  {isOwnSender(m.id, trip.ownerId) ? (
                    <Text style={styles.hostTag}>Host</Text>
                  ) : null}
                </Pressable>
              ))}
              {pending.map((u) => (
                <Pressable
                  key={`pending-${u.id}`}
                  style={styles.traveler}
                  onPress={() => onSelectUser(u)}
                >
                  <Avatar source={u.avatar} size={48} />
                  <Text style={styles.travelerName} numberOfLines={1}>
                    {u.firstName}
                  </Text>
                  <Text style={styles.hostTag}>Pending</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.photosHead}>
              <Text style={styles.photosTitle}>Album photos</Text>
              <Pressable
                onPress={() => {
                  onClose();
                  onOpenFullAlbum(trip.id);
                }}
                hitSlop={8}
              >
                <Text style={styles.openAlbum}>Open album</Text>
              </Pressable>
            </View>

            {photos.length === 0 ? (
              <View style={styles.emptyPhotos}>
                <Ionicons name="images-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>No photos in this album yet</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {photos.slice(0, 12).map((ph) => (
                  <Pressable
                    key={ph.id}
                    style={styles.tile}
                    onPress={() => {
                      onClose();
                      onOpenFullAlbum(trip.id);
                    }}
                  >
                    <Image
                      source={toImageSource(ph.imageUrl)}
                      style={styles.tileImg}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable
              style={styles.openFullBtn}
              onPress={() => {
                onClose();
                onOpenFullAlbum(trip.id);
              }}
            >
              <Ionicons name="images" size={18} color={colors.white} />
              <Text style={styles.openFullText}>View full album</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingText}>Trip not found</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 110,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    marginTop: 10,
    marginBottom: 6,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  loadingBox: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: { fontFamily: fonts.bold, color: colors.textMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  planeBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.programBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.openJoin,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.black,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: colors.brandMint,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dateText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.programBlue,
  },
  desc: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  followRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.brandMint,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  followRowOn: { backgroundColor: '#E8F6FC' },
  followRowText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.programBlue,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontFamily: fonts.bold, fontSize: 13 },
  openLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.openJoin,
  },
  joinWide: {
    marginTop: 12,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.openJoin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  joinWideOff: { backgroundColor: '#8BBAD0' },
  joinWideText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
  travelersHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 8,
  },
  travelersTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    flexShrink: 0,
  },
  travelersCount: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.openJoin,
    marginRight: 'auto',
  },
  joinBeside: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.openJoin,
    borderRadius: 16,
    height: 34,
    paddingHorizontal: 10,
  },
  joinBesideOff: { backgroundColor: '#0039B8' },
  joinBesideText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
  },
  travelersRow: { gap: 12, paddingRight: 8, paddingBottom: 4 },
  traveler: { width: 58, alignItems: 'center', gap: 4 },
  travelerName: {
    fontFamily: fonts.bold,
    fontSize: 11,
    textAlign: 'center',
    width: 58,
  },
  hostTag: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.programBlue,
  },
  photosHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  photosTitle: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 15,
  },
  openAlbum: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.openJoin,
  },
  emptyPhotos: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 24,
    backgroundColor: '#F7FAFF',
    borderRadius: 14,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -1,
  },
  tile: {
    width: '33.333%',
    aspectRatio: 1,
    padding: 1,
  },
  tileImg: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#E8EEF6',
    borderRadius: 2,
  },
  openFullBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.programBlue,
    borderRadius: 14,
    paddingVertical: 12,
  },
  openFullText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 15,
  },
});
