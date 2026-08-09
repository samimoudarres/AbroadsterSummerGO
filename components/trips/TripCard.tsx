import React from 'react';
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile, ChatTrip } from '../../data/chatTypes';
import { formatTripNames, shortWeekdayRange } from '../../lib/trips/dates';
import {
  canRequestTripJoin,
  getTripDisplayStatus,
  tripStatusColor,
  tripStatusLabel,
} from '../../lib/trips/status';
import { isOwnSender, isTripParticipant } from '../../lib/chat/repository';
import { Avatar } from '../common/Avatar';
import { GroupAvatar } from '../map/GroupAvatar';

const ALBUM_BTN_BG = require('../../assets/trips/album-btn-bg.png');

interface TripCardProps {
  trip: ChatTrip;
  members: ChatProfile[];
  onPress: () => void;
  onFollowAlbum: () => void;
  onRequestJoin: () => void;
  onCancelRequest?: () => void;
  onAcceptInvite?: () => void;
  /** True when the viewer owns or is already on this trip. */
  isParticipant?: boolean;
}

export function TripCard({
  trip,
  members,
  onPress,
  onFollowAlbum,
  onRequestJoin,
  onCancelRequest,
  onAcceptInvite,
  isParticipant: isParticipantProp = false,
}: TripCardProps) {
  const names = formatTripNames(members.map((m) => m.firstName));
  const place = `${trip.destinationCity}, ${trip.destinationCountry}`;
  const placeShort = place.length > 14 ? place.slice(0, 12) + '..' : place;
  const dateText = shortWeekdayRange(trip.dateStart, trip.dateEnd, trip.dateLabel);
  const displayStatus = getTripDisplayStatus(trip);
  const statusColor = tripStatusColor(displayStatus);
  const statusLabel = tripStatusLabel(displayStatus);
  const showFollow = displayStatus === 'upcoming';
  const isParticipant = isParticipantProp || isTripParticipant(trip, null);
  const isInvited =
    !isParticipant &&
    Boolean(
      trip.myPendingInviteId ||
        (trip.pendingInviteeIds ?? []).some((id) => isOwnSender(id, null)),
    );
  const showJoin = canRequestTripJoin(trip, {
    isMember: isParticipant,
    isInvited,
  });
  const requested = trip.myJoinStatus === 'pending';

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.left}>
        {members.length <= 1 ? (
          <Avatar source={members[0]?.avatar} size={68} />
        ) : (
          <GroupAvatar
            avatars={members.slice(0, 4).map((m) => m.avatar)}
            size={68}
          />
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.names} numberOfLines={1}>
          {names}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            <View style={styles.placeRow}>
              <Ionicons name="location-sharp" size={18} color={colors.black} />
              <Text style={styles.place} numberOfLines={1}>
                {placeShort}
              </Text>
            </View>
            <View style={styles.dateRow}>
              <MaterialIcons name="calendar-today" size={16} color={colors.black} />
              <Text style={styles.date}>{dateText}</Text>
            </View>
          </View>

          <View style={styles.right}>
            {showFollow ? (
              <Pressable
                style={styles.followBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  onFollowAlbum();
                }}
              >
                <ImageBackground
                  source={ALBUM_BTN_BG}
                  style={styles.followBg}
                  imageStyle={{ borderRadius: 15 }}
                >
                  <View style={styles.followDim} />
                  <Ionicons
                    name={trip.isFollowingAlbum ? 'checkmark-circle' : 'images'}
                    size={18}
                    color={colors.white}
                  />
                  <Text style={styles.followText}>
                    {trip.isFollowingAlbum ? 'Following' : 'Follow Album'}
                  </Text>
                </ImageBackground>
              </Pressable>
            ) : null}

            {isInvited ? (
              <Pressable
                style={styles.joinBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  onAcceptInvite?.();
                }}
              >
                <Ionicons name="checkmark-circle" size={14} color={colors.white} />
                <Text style={styles.joinText}>Accept invite</Text>
              </Pressable>
            ) : null}

            {showJoin ? (
              <Pressable
                style={[styles.joinBtn, requested && styles.joinRequested]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  if (requested) onCancelRequest?.();
                  else onRequestJoin();
                }}
              >
                {!requested ? (
                  <Ionicons name="paper-plane" size={14} color={colors.white} />
                ) : (
                  <Ionicons name="close-circle" size={14} color={colors.white} />
                )}
                <Text style={styles.joinText}>
                  {requested ? 'Unrequest' : 'Request to Join'}
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D0D0D0',
  },
  left: { width: 68 },
  body: { flex: 1, minWidth: 0, paddingTop: 2 },
  names: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.black,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaLeft: { flex: 1, minWidth: 0 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  place: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.black,
    flexShrink: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  date: {
    fontSize: 14,
    color: 'rgba(4,0,0,0.5)',
  },
  right: {
    width: 132,
    alignItems: 'flex-end',
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  statusText: {
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  followBtn: {
    width: 131,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.openJoin,
    shadowColor: colors.openJoin,
    shadowOpacity: 1,
    shadowRadius: 3,
  },
  followBg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  followDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
  },
  followText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.white,
  },
  joinBtn: {
    width: 131,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.openJoin,
    borderWidth: 1,
    borderColor: colors.openJoin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: colors.openJoin,
    shadowOpacity: 1,
    shadowRadius: 3,
  },
  joinRequested: {
    backgroundColor: '#8BBAD0',
    borderColor: '#8BBAD0',
  },
  joinText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.white,
  },
});
