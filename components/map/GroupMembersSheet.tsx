import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { TripPin, UserProfile } from '../../data/types';
import type { ChatTrip } from '../../data/chatTypes';
import { getUserById } from '../../data/mockMapData';
import {
  chatRepo,
  DEMO_ME_ID,
  isOwnSender,
  isTripParticipant,
} from '../../lib/chat/repository';
import { chatProfileToMapUser } from '../../lib/map/chatProfileToMapUser';
import { Avatar } from '../common/Avatar';

interface GroupMembersSheetProps {
  visible: boolean;
  trip: TripPin | null;
  onClose: () => void;
  onSelectUser: (user: UserProfile) => void;
}

export function GroupMembersSheet({
  visible,
  trip,
  onClose,
  onSelectUser,
}: GroupMembersSheetProps) {
  const [meId, setMeId] = useState(DEMO_ME_ID);
  const [chatTrip, setChatTrip] = useState<ChatTrip | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [joining, setJoining] = useState(false);
  const [requested, setRequested] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !trip) {
      setChatTrip(null);
      setRequested(false);
      setMembers([]);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const me = await chatRepo.getMe();
      if (!cancelled) setMeId(me.id);
      try {
        const t = await chatRepo.getTrip(trip.id);
        if (cancelled) return;
        if (t) {
          setChatTrip(t);
          setRequested(t.myJoinStatus === 'pending');
          const ids = t.memberIds.length > 0 ? t.memberIds : trip.memberIds;
          const profiles = await Promise.all(
            ids.map((id) => chatRepo.getProfile(id)),
          );
          const mapped: UserProfile[] = [];
          for (let i = 0; i < ids.length; i++) {
            const p = profiles[i];
            if (p) {
              const pin = chatProfileToMapUser(p, {
                isFriend: false,
                isCurrentUser: p.id === me.id,
              });
              if (pin) {
                mapped.push(pin);
                continue;
              }
            }
            const stub = trip.members.find((m) => m.userId === ids[i]);
            const seed = getUserById(ids[i]);
            if (seed) {
              mapped.push(seed);
            } else if (stub) {
              mapped.push({
                id: stub.userId,
                firstName: stub.firstName,
                lastName: '',
                fullName: stub.firstName,
                avatar: stub.avatar,
                homeUniversity: '',
                studyAbroadProgram: '',
                hostCity: '',
                hostCountry: '',
                semester: '',
                countriesVisited: 0,
                isFriend: false,
                locationPrivacy: 'city',
                latitude: trip.latitude,
                longitude: trip.longitude,
                locationLabel: trip.destinationCity,
                passportBadges: [],
                albums: [],
                posts: [],
              });
            }
          }
          setMembers(mapped);
        } else {
          setChatTrip(null);
          setRequested(false);
          setMembers(
            trip.members
              .map((m) => getUserById(m.userId))
              .filter(Boolean) as UserProfile[],
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setLoadError(e?.message || 'Could not load trip');
          setMembers(
            trip.members
              .map((m) => getUserById(m.userId))
              .filter(Boolean) as UserProfile[],
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, trip?.id]);

  if (!visible || !trip) return null;

  const openToJoin = chatTrip?.openToJoin ?? trip.openToJoin;
  const status = chatTrip?.status ?? trip.status;
  const isMember =
    members.some((m) => isOwnSender(m.id, meId)) ||
    isTripParticipant(
      chatTrip ?? {
        ownerId: undefined,
        memberIds: trip.memberIds,
        myJoinStatus: requested ? 'pending' : null,
      },
      meId,
    ) ||
    trip.memberIds.some((id) => isOwnSender(id, meId)) ||
    trip.members.some((m) => isOwnSender(m.userId, meId));

  const showJoin =
    openToJoin &&
    !isMember &&
    (status === 'planning' || status === 'upcoming');

  const onRequestJoin = async () => {
    if (joining || isMember) return;
    setJoining(true);
    setLoadError(null);
    try {
      if (requested) {
        await chatRepo.cancelTripJoin(trip.id);
        setRequested(false);
      } else {
        await chatRepo.requestTripJoin(trip.id);
        setRequested(true);
        Alert.alert(
          'Request sent',
          'Trip members will be notified. Tap again to unrequest.',
        );
      }
      const updated = await chatRepo.getTrip(trip.id);
      if (updated) setChatTrip(updated);
    } catch (e: any) {
      Alert.alert(
        'Couldn’t update request',
        e?.message ?? 'Please try again.',
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>Trip members</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>{trip.dateLabel}</Text>
        {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

        {showJoin ? (
          <Pressable
            style={[styles.joinBtn, (requested || joining) && styles.joinBtnOff]}
            onPress={() => void onRequestJoin()}
            disabled={joining}
          >
            {joining ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons
                  name={requested ? 'close-circle' : 'paper-plane'}
                  size={16}
                  color={colors.white}
                />
                <Text style={styles.joinText}>
                  {requested ? 'Unrequest' : 'Request to Join'}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}

        <ScrollView style={{ maxHeight: 360 }}>
          {members.map((user) => (
            <Pressable
              key={user.id}
              style={styles.row}
              onPress={() => onSelectUser(user)}
            >
              <Avatar source={user.avatar} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{user.fullName}</Text>
                <Text style={styles.meta}>
                  {[user.homeUniversity, user.studyAbroadProgram]
                    .filter(Boolean)
                    .join(' · ') || 'Abroadster'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
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
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.black,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 10,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.brandCoral,
    marginBottom: 8,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brandTeal,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  joinBtnOff: {
    opacity: 0.7,
  },
  joinText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  name: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.black,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
