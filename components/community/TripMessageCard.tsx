import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatTrip } from '../../data/chatTypes';
import {
  canRequestTripJoin,
  getTripDisplayStatus,
  tripPlannerLine,
  tripStatusColor,
  tripStatusLabel,
} from '../../lib/trips/status';

interface TripMessageCardProps {
  trip: ChatTrip;
  plannerName: string;
  onPeoplePress: () => void;
  onRequestJoin: () => void;
  onCancelRequest?: () => void;
  onAcceptInvite?: () => void;
  onOpenTrip?: () => void;
  isMember: boolean;
  isInvited?: boolean;
}

export function TripMessageCard({
  trip,
  plannerName,
  onPeoplePress,
  onRequestJoin,
  onCancelRequest,
  onAcceptInvite,
  onOpenTrip,
  isMember,
  isInvited = false,
}: TripMessageCardProps) {
  const requested = trip.myJoinStatus === 'pending';
  const displayStatus = getTripDisplayStatus(trip);
  const statusColor = tripStatusColor(displayStatus);
  const showJoin = canRequestTripJoin(trip, { isMember, isInvited });
  const showAccept = isInvited && !isMember;
  const travelerCount =
    trip.memberIds.length + (trip.pendingInviteeIds?.length ?? 0);
  const capacity =
    typeof trip.maxMembers === 'number' && trip.maxMembers > 0
      ? trip.maxMembers
      : null;

  return (
    <Pressable style={styles.card} onPress={onOpenTrip}>
      <View style={styles.headerRow}>
        <Ionicons name="location-sharp" size={18} color={colors.black} />
        <Text style={styles.city}>
          {trip.destinationCity}
          {trip.destinationCountry ? `, ${trip.destinationCountry}` : ''}
        </Text>
      </View>

      <View style={styles.badgeRow}>
        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {tripStatusLabel(displayStatus)}
          </Text>
        </View>
        {trip.openToJoin && displayStatus !== 'past' ? (
          <View style={styles.openBadge}>
            <View style={styles.openDot} />
            <Text style={styles.openText}>Open to Join!</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.planning}>
        {tripPlannerLine(plannerName, displayStatus)}
      </Text>

      {trip.description?.trim() ? (
        <Text style={styles.desc} numberOfLines={3}>
          {trip.description.trim()}
        </Text>
      ) : null}

      <View style={styles.metaRow}>
        <MaterialIcons name="calendar-today" size={16} color={colors.black} />
        <Text style={styles.metaText}>{trip.dateLabel}</Text>
      </View>
      {trip.leavingTime ? (
        <Text style={styles.leaving}>Leaving: {trip.leavingTime}</Text>
      ) : null}
      {capacity != null ? (
        <Text style={styles.leaving}>
          Spots: {travelerCount}/{capacity}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={styles.peopleBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            onPeoplePress();
          }}
        >
          <Ionicons name="people" size={16} color={colors.black} />
          <Text style={styles.peopleText}>
            {travelerCount} People Going
          </Text>
        </Pressable>
        {showAccept ? (
          <Pressable
            style={styles.joinBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              onAcceptInvite?.();
            }}
          >
            <Ionicons name="checkmark-circle" size={14} color={colors.white} />
            <Text style={styles.joinText}>Accept{'\n'}invite</Text>
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
              {requested ? 'Unrequest' : 'Request\nto Join'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 270,
    backgroundColor: colors.brandMint,
    borderWidth: 1,
    borderColor: colors.statusYellow,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    shadowColor: 'rgba(224,194,1,0.25)',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  city: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.black,
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  openDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.openJoin,
  },
  openText: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.openJoin,
  },
  planning: {
    fontSize: 16,
    color: '#040000',
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 6,
  },
  desc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: 'rgba(4,0,0,0.7)',
    lineHeight: 18,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 16,
    color: 'rgba(4,0,0,0.5)',
    lineHeight: 22,
    flex: 1,
  },
  leaving: {
    fontSize: 15,
    color: 'rgba(4,0,0,0.5)',
    lineHeight: 20,
    marginLeft: 22,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  peopleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECECEC',
    borderRadius: 18,
    height: 41,
    paddingHorizontal: 10,
    flexShrink: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  peopleText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.black,
    maxWidth: 78,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.openJoin,
    borderRadius: 18,
    height: 41,
    paddingHorizontal: 12,
    minWidth: 112,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  joinRequested: {
    backgroundColor: '#0039B8',
  },
  joinText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
    textAlign: 'center',
    lineHeight: 15,
  },
});
