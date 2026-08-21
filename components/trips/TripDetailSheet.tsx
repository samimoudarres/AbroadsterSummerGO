import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile, ChatTrip } from '../../data/chatTypes';
import { chatRepo, isOwnSender, isTripParticipant } from '../../lib/chat/repository';
import {
  canRequestTripJoin,
  getTripDisplayStatus,
  tripStatusColor,
  tripStatusLabel,
} from '../../lib/trips/status';
import { Avatar } from '../common/Avatar';
import { FollowAlbumBanner } from './FollowAlbumBanner';

interface TripDetailSheetProps {
  visible: boolean;
  trip: ChatTrip | null;
  onClose: () => void;
  onSelectUser: (user: ChatProfile) => void;
  onFollowAlbum: (trip: ChatTrip) => void;
  onRequestJoin?: (trip: ChatTrip) => void;
  onCancelRequest?: (trip: ChatTrip) => void;
  onAcceptInvite?: (trip: ChatTrip) => void;
}

export function TripDetailSheet({
  visible,
  trip,
  onClose,
  onSelectUser,
  onFollowAlbum,
  onRequestJoin,
  onCancelRequest,
  onAcceptInvite,
}: TripDetailSheetProps) {
  const [members, setMembers] = useState<ChatProfile[]>([]);
  const [pending, setPending] = useState<ChatProfile[]>([]);
  const [friendMap, setFriendMap] = useState<Record<string, boolean>>({});
  const [meId, setMeId] = useState('');

  useEffect(() => {
    if (!visible || !trip) return;
    let cancelled = false;
    (async () => {
      const me = await chatRepo.getMe();
      const list = (
        await Promise.all(trip.memberIds.map((id) => chatRepo.getProfile(id)))
      ).filter(Boolean) as ChatProfile[];
      const pendingList = (
        await Promise.all(
          (trip.pendingInviteeIds ?? []).map((id) => chatRepo.getProfile(id)),
        )
      ).filter(Boolean) as ChatProfile[];
      const flags: Record<string, boolean> = {};
      await Promise.all(
        [...list, ...pendingList].map(async (u) => {
          flags[u.id] = await chatRepo.isFriend(u.id);
        }),
      );
      if (!cancelled) {
        setMeId(me.id);
        setMembers(list);
        setPending(pendingList);
        setFriendMap(flags);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, trip]);

  if (!visible || !trip) return null;

  const isParticipant = isTripParticipant(trip, meId);
  const isInvited =
    !isParticipant &&
    Boolean(
      trip.myPendingInviteId ||
        (trip.pendingInviteeIds ?? []).some((id) => isOwnSender(id, meId)),
    );
  const displayStatus = getTripDisplayStatus(trip);
  const statusColor = tripStatusColor(displayStatus);
  const showFollow = displayStatus === 'upcoming';
  const showJoin = canRequestTripJoin(trip, {
    isMember: isParticipant,
    isInvited,
  });
  const requested = trip.myJoinStatus === 'pending';
  const travelerCount = members.length + pending.length;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Ionicons name="location-sharp" size={22} color={colors.black} />
          <Text style={styles.title} numberOfLines={2}>
            {trip.destinationCity}, {trip.destinationCountry}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
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

        <Text style={styles.dateSub}>{trip.dateLabel}</Text>
        {isParticipant && trip.leavingTime ? (
          <Text style={styles.dateSub}>Leaving: {trip.leavingTime}</Text>
        ) : null}
        {isParticipant && trip.description ? (
          <Text style={styles.dateSub}>{trip.description}</Text>
        ) : null}
        {isParticipant &&
        typeof trip.maxMembers === 'number' &&
        trip.maxMembers > 0 ? (
          <Text style={styles.dateSub}>
            Capacity: {travelerCount}/{trip.maxMembers}
          </Text>
        ) : null}

        {showFollow ? (
          <FollowAlbumBanner
            trip={trip}
            members={members}
            onFollow={() => onFollowAlbum(trip)}
          />
        ) : null}

        {isInvited && onAcceptInvite ? (
          <Pressable
            style={styles.joinWide}
            onPress={() => onAcceptInvite(trip)}
          >
            <Ionicons name="checkmark-circle" size={16} color={colors.white} />
            <Text style={styles.joinWideText}>Accept invite</Text>
          </Pressable>
        ) : null}

        <View style={styles.travelersHead}>
          <Ionicons name="people" size={18} color={colors.black} />
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

        <ScrollView style={{ maxHeight: 280 }}>
          {members.map((user) => {
            const isMe = isOwnSender(user.id, meId);
            const isFriend = friendMap[user.id];
            return (
              <View key={user.id} style={styles.row}>
                <Pressable
                  style={styles.userHit}
                  onPress={() => onSelectUser(user)}
                >
                  <Avatar source={user.avatar} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{user.fullName}</Text>
                    <Text style={styles.meta}>
                      {user.homeUniversity} · {user.studyAbroadProgram}
                    </Text>
                    {isOwnSender(user.id, trip.ownerId) ? (
                      <Text style={styles.pendingLabel}>Host</Text>
                    ) : null}
                  </View>
                </Pressable>
                {!isMe ? (
                  isFriend ? (
                    <View style={styles.friendBtn}>
                      <Ionicons name="checkmark" size={14} color={colors.openJoin} />
                      <Text style={styles.friendText}>Friend</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.addBtn}
                      onPress={async () => {
                        await chatRepo.addFriend(user.id);
                        setFriendMap((m) => ({ ...m, [user.id]: true }));
                      }}
                    >
                      <Text style={styles.addText}>+Add</Text>
                    </Pressable>
                  )
                ) : null}
              </View>
            );
          })}
          {pending.map((user) => {
            const isMe = isOwnSender(user.id, meId);
            const isFriend = friendMap[user.id];
            return (
              <View key={`pending-${user.id}`} style={styles.row}>
                <Pressable
                  style={styles.userHit}
                  onPress={() => onSelectUser(user)}
                >
                  <Avatar source={user.avatar} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{user.fullName}</Text>
                    <Text style={styles.meta}>
                      {user.homeUniversity} · {user.studyAbroadProgram}
                    </Text>
                    <Text style={styles.pendingLabel}>Pending invite</Text>
                  </View>
                </Pressable>
                {!isMe ? (
                  isFriend ? (
                    <View style={styles.friendBtn}>
                      <Ionicons name="checkmark" size={14} color={colors.openJoin} />
                      <Text style={styles.friendText}>Friend</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.addBtn}
                      onPress={async () => {
                        await chatRepo.addFriend(user.id);
                        setFriendMap((m) => ({ ...m, [user.id]: true }));
                      }}
                    >
                      <Text style={styles.addText}>+Add</Text>
                    </Pressable>
                  )
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 85,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
    paddingTop: 10,
    maxHeight: '78%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  title: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.black,
  },
  dateSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontFamily: fonts.bold, fontSize: 13 },
  openLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.openJoin,
  },
  joinWide: {
    marginHorizontal: 16,
    marginBottom: 8,
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
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  travelersTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    flexShrink: 0,
  },
  travelersCount: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textMuted,
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
  pendingLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.statusOrange,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
  },
  userHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  name: { fontFamily: fonts.extraBold, fontSize: 15 },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  addBtn: {
    backgroundColor: colors.openJoin,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
  },
  friendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.openJoin,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  friendText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.openJoin,
  },
});
