import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/theme';
import type { AlbumPhoto, ChatProfile, ChatTrip } from '../../data/chatTypes';
import { chatRepo, initChat, isOwnSender, isTripParticipant, subscribeChat } from '../../lib/chat/repository';
import { copyText } from '../../lib/clipboard';
import { demoChat } from '../../lib/chat/demoStore';
import { confirmChoice } from '../../lib/confirm';
import { pickExtraFromLibrary } from '../../lib/feed/galleryAssets';
import { useEdgeSwipeBack } from '../../lib/gestures/useEdgeSwipeBack';
import { shortCalendarRange } from '../../lib/trips/dates';
import { buildTripInviteShareMessage } from '../../lib/trips/inviteLinks';
import {
  canRequestTripJoin,
  getTripDisplayStatus,
  tripStatusColor,
  tripStatusLabel,
} from '../../lib/trips/status';
import { presentLocalNotification } from '../../lib/trips/push';
import { ensureImageUri, toImageSource } from '../../lib/images';
import { PHONE_SAFE_INSETS } from '../layout/PhoneShell';
import { Avatar } from '../common/Avatar';
import { ConfirmTripSlider } from './ConfirmTripSlider';
import { AlbumPhotoViewer } from './AlbumPhotoViewer';
import { InviteTravelersSheet } from './InviteTravelersSheet';

const GRID = 3;
const GAP = 1.5;

interface TripAlbumScreenProps {
  tripId: string;
  /** From deep link — enables Join via invite link for non-members. */
  inviteToken?: string | null;
  onClose: () => void;
  onOpenProfile?: (user: ChatProfile) => void;
  /** Open the trip group chat channel (members only). */
  onOpenTripChat?: (channelId: string) => void;
}

async function withResolvedAvatar(
  p: ChatProfile,
  fallback?: ChatProfile | null,
): Promise<ChatProfile> {
  try {
    const primary = await ensureImageUri(p.avatar as any);
    if (primary) return { ...p, avatar: primary };
  } catch {
    // fall through
  }
  if (fallback?.avatar) {
    try {
      const fb = await ensureImageUri(fallback.avatar as any);
      if (fb) return { ...p, avatar: fb };
    } catch {
      // ignore
    }
  }
  return p;
}

export function TripAlbumScreen({
  tripId,
  inviteToken = null,
  onClose,
  onOpenProfile,
  onOpenTripChat,
}: TripAlbumScreenProps) {
  const insets = useSafeAreaInsets();
  const edgeBack = useEdgeSwipeBack(onClose);
  const topPad =
    (insets.top > 0 ? insets.top : Platform.OS === 'web' ? PHONE_SAFE_INSETS.top : 12) +
    6;

  const [trip, setTrip] = useState<ChatTrip | null>(null);
  const [members, setMembers] = useState<ChatProfile[]>([]);
  const [pending, setPending] = useState<ChatProfile[]>([]);
  const [joinRequests, setJoinRequests] = useState<
    Array<{ id: string; requesterId: string; profile: ChatProfile | null }>
  >([]);
  const [meId, setMeId] = useState('');
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [pendingUris, setPendingUris] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteHits, setInviteHits] = useState<ChatProfile[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [joinBusyId, setJoinBusyId] = useState<string | null>(null);
  const [joinRequested, setJoinRequested] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savingPhotos, setSavingPhotos] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const gridTopRef = useRef(0);
  const tileLayouts = useRef<Record<string, { x: number; y: number; w: number; h: number }>>(
    {},
  );
  const dragSelectingRef = useRef(false);

  const isOwner = trip ? isOwnSender(trip.ownerId, meId) : false;
  const isMember = trip ? isTripParticipant(trip, meId) : false;
  const isInvited = Boolean(
    trip &&
      !isMember &&
      (trip.myPendingInviteId ||
        (trip.pendingInviteeIds ?? []).some((id) => isOwnSender(id, meId))),
  );

  const dateText = useMemo(() => {
    if (!trip) return '';
    return (
      shortCalendarRange(trip.dateStart, trip.dateEnd, trip.dateLabel) ||
      trip.dateLabel ||
      ''
    );
  }, [trip]);

  useEffect(() => {
    if (isMember && joinRequests.length > 0) setShowManage(true);
  }, [isMember, joinRequests.length]);

  const refresh = useCallback(async () => {
    await initChat();
    const me = await chatRepo.getMe();
    const demoMe = await demoChat.getMe();
    setMeId(me.id);
    const t = await chatRepo.getTrip(tripId);
    if (!t) return;
    setTrip(t);
    setJoinRequested(t.myJoinStatus === 'pending');

    const memberProfiles = (
      await Promise.all(t.memberIds.map((id) => chatRepo.getProfile(id)))
    ).filter(Boolean) as ChatProfile[];
    const resolvedMembers = await Promise.all(
      memberProfiles.map((p) =>
        withResolvedAvatar(p, isOwnSender(p.id, me.id) ? demoMe : null),
      ),
    );
    setMembers(resolvedMembers);

    const pendingIds = t.pendingInviteeIds ?? [];
    const pendingProfiles = (
      await Promise.all(pendingIds.map((id) => chatRepo.getProfile(id)))
    ).filter(Boolean) as ChatProfile[];
    setPending(await Promise.all(pendingProfiles.map((p) => withResolvedAvatar(p))));

    try {
      const reqs = await chatRepo.listTripJoinRequests(tripId);
      const withProfiles = await Promise.all(
        reqs.map(async (r) => {
          const p = await chatRepo.getProfile(r.requesterId);
          return {
            id: r.id,
            requesterId: r.requesterId,
            profile: p ? await withResolvedAvatar(p) : null,
          };
        }),
      );
      setJoinRequests(withProfiles);
    } catch {
      setJoinRequests([]);
    }

    const albumPhotos = await chatRepo.getTripAlbumPhotos(tripId);
    const resolvedPhotos = await Promise.all(
      albumPhotos.map(async (ph) => {
        try {
          return {
            ...ph,
            imageUrl: await ensureImageUri(ph.imageUrl as any),
          };
        } catch {
          return ph;
        }
      }),
    );
    setPhotos(resolvedPhotos);

    const map: Record<string, ChatProfile> = {};
    for (const m of resolvedMembers) map[m.id] = m;
    for (const ph of resolvedPhotos) {
      if (!map[ph.uploaderId]) {
        const p = await chatRepo.getProfile(ph.uploaderId);
        if (p) map[ph.uploaderId] = await withResolvedAvatar(p);
      }
    }
    setProfiles(map);
  }, [tripId]);

  useEffect(() => {
    void refresh();
    return subscribeChat(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    if (!isMember) return;
    let cancelled = false;
    (async () => {
      const q = inviteQuery.trim();
      const raw = q
        ? await chatRepo.searchUsers(q)
        : await chatRepo.suggestTripInvitees();
      const memberIds = new Set(trip?.memberIds ?? []);
      const pendingIds = new Set(trip?.pendingInviteeIds ?? []);
      const filtered = raw
        .filter((u) => !memberIds.has(u.id) && !pendingIds.has(u.id))
        .slice(0, 4);
      const resolved = await Promise.all(filtered.map((p) => withResolvedAvatar(p)));
      if (!cancelled) setInviteHits(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteQuery, isMember, trip?.memberIds, trip?.pendingInviteeIds]);

  const pickPhotos = async () => {
    const assets = await pickExtraFromLibrary(20);
    if (!assets.length) {
      Alert.alert(
        'Photos',
        'No photos selected. Allow photo library access in Settings if you blocked it.',
      );
      return;
    }
    const uris = assets
      .map((a) => (typeof a.uri === 'string' ? a.uri : ''))
      .filter(Boolean);
    setPendingUris((prev) => [...prev, ...uris]);
  };

  const confirmUpload = async () => {
    if (!trip || !pendingUris.length || uploading) return;
    setUploading(true);
    try {
      const count = pendingUris.length;
      await chatRepo.uploadTripAlbumPhotos(trip.id, pendingUris);
      setPendingUris([]);
      await refresh();
      Alert.alert(
        'Photos uploaded',
        `${count} photo${count === 1 ? '' : 's'} added to the album.`,
      );
      await presentLocalNotification({
        title: 'Album updated',
        body: `You uploaded ${count} photo${count === 1 ? '' : 's'} to ${trip.destinationCity}.`,
        data: { tripId: trip.id, kind: 'album_photos_uploaded' },
      });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Try again');
    } finally {
      setUploading(false);
    }
  };

  const copyLink = async () => {
    if (!trip) return;
    let inviter = 'A friend';
    try {
      const me = await chatRepo.getMe();
      inviter = me.fullName || me.firstName || inviter;
    } catch {
      // ignore
    }
    const message = buildTripInviteShareMessage({
      inviterName: inviter,
      trip,
    });
    const ok = await copyText(message);
    Alert.alert(
      ok ? 'Invite copied' : 'Invite message',
      ok
        ? 'Share it in Messages, Instagram, or anywhere — friends can open Abroadster or download it from the App Store.'
        : message,
    );
  };

  const joinViaLink = async () => {
    if (!trip || isMember || joinBusy) return;
    const token = inviteToken || trip.inviteToken;
    if (!token) {
      Alert.alert('Invite unavailable', 'Ask the host to send a fresh invite link.');
      return;
    }
    setJoinBusy(true);
    try {
      await chatRepo.joinTripViaInviteToken(token);
      await refresh();
      Alert.alert('You’re in!', `Welcome to the trip to ${trip.destinationCity}.`);
    } catch (e: any) {
      Alert.alert('Couldn’t join', e?.message ?? 'Try again or request to join.');
    } finally {
      setJoinBusy(false);
    }
  };

  const toggleFollow = async () => {
    if (!trip) return;
    try {
      if (trip.isFollowingAlbum) {
        await chatRepo.unfollowTripAlbum(trip.id);
      } else {
        await chatRepo.followTripAlbum(trip.id);
        await presentLocalNotification({
          title: 'Following album',
          body: `You're now following the ${trip.destinationCity} trip album.`,
          data: { tripId: trip.id, kind: 'album_followed' },
        });
      }
      await refresh();
    } catch (e: any) {
      Alert.alert('Couldn’t update', e?.message ?? 'Try again');
    }
  };

  const requestJoin = async () => {
    if (!trip || joinBusy || isMember || isInvited) return;
    setJoinBusy(true);
    try {
      if (joinRequested || trip.myJoinStatus === 'pending') {
        await chatRepo.cancelTripJoin(trip.id);
        setJoinRequested(false);
        await refresh();
      } else {
        await chatRepo.requestTripJoin(trip.id);
        setJoinRequested(true);
        await refresh();
        Alert.alert(
          'Request sent',
          `You requested to join the trip to ${trip.destinationCity}. Tap again to unrequest.`,
        );
      }
    } catch (e: any) {
      Alert.alert('Couldn’t update request', e?.message ?? 'Try again');
    } finally {
      setJoinBusy(false);
    }
  };

  const openTripChat = async () => {
    if (!trip || !isMember || chatBusy) return;
    setChatBusy(true);
    try {
      const ch = await chatRepo.ensureTripChannel(trip.id);
      if (!ch?.channelId) {
        Alert.alert(
          'Chat unavailable',
          'Couldn’t open the trip chat yet. Try again in a moment.',
        );
        return;
      }
      onOpenTripChat?.(ch.channelId);
      onClose();
    } catch (e: any) {
      Alert.alert('Couldn’t open chat', e?.message ?? 'Try again');
    } finally {
      setChatBusy(false);
    }
  };

  const acceptInvite = async () => {
    if (!trip || inviteBusy || isMember) return;
    let inviteId = trip.myPendingInviteId;
    if (!inviteId) {
      // Resolve invite id if hydration omitted it
      try {
        const notifs = await chatRepo.getNotifications();
        const hit = notifs.find((n) => {
          if (n.kind !== 'trip_invite' && n.kind !== 'trip_invite_reminder') {
            return false;
          }
          const d = (n.data ?? {}) as Record<string, unknown>;
          const tid =
            (typeof d.tripId === 'string' && d.tripId) ||
            (typeof d.trip_id === 'string' && d.trip_id) ||
            '';
          return tid === trip.id;
        });
        const hd = (hit?.data ?? {}) as Record<string, unknown>;
        inviteId =
          (typeof hd.inviteId === 'string' && hd.inviteId) ||
          (typeof hd.invite_id === 'string' && hd.invite_id) ||
          null;
      } catch {
        // ignore
      }
    }
    if (!inviteId) {
      Alert.alert(
        'Invite not found',
        'Open the invite from Notifications, or ask the host to invite you again.',
      );
      return;
    }
    setInviteBusy(true);
    try {
      await chatRepo.respondTripInvite(inviteId, true);
      await refresh();
      Alert.alert('You’re in!', `Welcome to the trip to ${trip.destinationCity}.`);
    } catch (e: any) {
      Alert.alert('Couldn’t accept', e?.message ?? 'Try again');
    } finally {
      setInviteBusy(false);
    }
  };

  if (!trip) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.loading}>Loading album…</Text>
      </View>
    );
  }

  const selectAtPoint = (x: number, y: number) => {
    for (const [id, box] of Object.entries(tileLayouts.current)) {
      if (
        x >= box.x &&
        x <= box.x + box.w &&
        y >= box.y &&
        y <= box.y + box.h
      ) {
        setSelectedIds((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        break;
      }
    }
  };

  const saveSelectedPhotos = async () => {
    if (selectedIds.size === 0) return;
    setSavingPhotos(true);
    try {
      const perm = await requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert(
          'Permission needed',
          'Allow photo library access to save album photos.',
        );
        return;
      }
      const chosen = photos.filter((p) => selectedIds.has(p.id));
      let saved = 0;
      for (const ph of chosen) {
        const url = typeof ph.imageUrl === 'string' ? ph.imageUrl : '';
        if (!url) continue;
        const target = `${FileSystem.cacheDirectory}album-${ph.id}.jpg`;
        const dl = await FileSystem.downloadAsync(url, target);
        await Asset.create(dl.uri);
        saved += 1;
      }
      Alert.alert(
        'Saved',
        saved === 1
          ? '1 photo saved to your library.'
          : `${saved} photos saved to your library.`,
      );
      setSelectMode(false);
      setSelectedIds(new Set());
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    } finally {
      setSavingPhotos(false);
    }
  };

  const following = Boolean(trip.isFollowingAlbum);
  const showAcceptInvite = isInvited;
  const displayStatus = getTripDisplayStatus(trip);
  const statusColor = tripStatusColor(displayStatus);
  const showJoin =
    Boolean(meId) &&
    canRequestTripJoin(trip, { isMember, isInvited });
  const travelerCount = members.length + pending.length;
  const capacity =
    typeof trip.maxMembers === 'number' && trip.maxMembers > 0
      ? trip.maxMembers
      : null;

  return (
    <GestureDetector gesture={edgeBack}>
    <View style={styles.root}>
      <View style={[styles.wash, { height: topPad + 110 }]} />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <Pressable onPress={onClose} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={colors.programBlue} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Album
        </Text>
        <View style={styles.headerActions}>
          {isMember ? (
            <Pressable
              onPress={() => void openTripChat()}
              style={[styles.chatHeaderBtn, chatBusy && { opacity: 0.6 }]}
              hitSlop={8}
              disabled={chatBusy}
              accessibilityLabel="Open trip chat"
            >
              {chatBusy ? (
                <ActivityIndicator size="small" color={colors.programBlue} />
              ) : (
                <Ionicons
                  name="chatbubbles-outline"
                  size={20}
                  color={colors.programBlue}
                />
              )}
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
          <Pressable
            onPress={() => void toggleFollow()}
            onLongPress={() => void copyLink()}
            style={[styles.followBtn, following && styles.followBtnOn]}
            hitSlop={8}
            accessibilityLabel={following ? 'Following album' : 'Follow album'}
          >
            <Ionicons
              name={following ? 'checkmark' : 'images-outline'}
              size={18}
              color={following ? colors.openJoin : colors.programBlue}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <View style={styles.heroCard}>
          <View style={styles.placeRow}>
            <View style={styles.pinBubble}>
              <Ionicons name="location-sharp" size={18} color={colors.openJoin} />
            </View>
            <Text style={styles.destination}>
              {trip.destinationCity}
              {trip.destinationCountry ? `, ${trip.destinationCountry}` : ''}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { borderColor: statusColor }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {tripStatusLabel(displayStatus)}
              </Text>
            </View>
            {trip.openToJoin && displayStatus !== 'past' ? (
              <View style={styles.openBadge}>
                <View style={styles.openDot} />
                <Text style={styles.openText}>Open to Join</Text>
              </View>
            ) : null}
          </View>

          {dateText ? (
            <View style={styles.dateChip}>
              <Ionicons name="calendar-outline" size={14} color={colors.programBlue} />
              <Text style={styles.dates}>{dateText}</Text>
            </View>
          ) : null}
          {trip.leavingTime ? (
            <Text style={styles.metaLine}>Leaving: {trip.leavingTime}</Text>
          ) : null}
          {capacity != null ? (
            <Text style={styles.metaLine}>
              Capacity: {travelerCount}/{capacity}
            </Text>
          ) : null}
          {trip.description ? (
            <Text style={styles.desc}>{trip.description}</Text>
          ) : null}

          {isOwner ? (
            <View style={styles.lockWrap}>
              <ConfirmTripSlider
                locked={trip.status === 'upcoming'}
                busy={confirming}
                onLock={() => void lockIn()}
                onUnlock={() => void unlock()}
              />
            </View>
          ) : null}

          <View style={styles.travelersHead}>
            <Ionicons name="people" size={16} color={colors.black} />
            <Text style={styles.travelersLabel}>Travelers</Text>
            <Text style={styles.travelersCount}>{travelerCount}</Text>
            {showJoin ? (
              <Pressable
                style={[
                  styles.joinBeside,
                  joinRequested && styles.joinBesideRequested,
                  joinBusy && styles.joinWideOff,
                ]}
                onPress={() => void requestJoin()}
                disabled={joinBusy}
              >
                {joinBusy ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <>
                    <Ionicons
                      name={joinRequested ? 'time-outline' : 'paper-plane'}
                      size={14}
                      color={colors.white}
                    />
                    <Text style={styles.joinBesideText}>
                      {joinRequested ? 'Pending' : 'Request to Join'}
                    </Text>
                  </>
                )}
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
                onPress={() => onOpenProfile?.(m)}
              >
                <Avatar source={m.avatar} size={52} />
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
                onPress={() => {
                  if (isMember) {
                    const req = joinRequests.find((r) => r.profile?.id === u.id);
                    if (req) {
                      Alert.alert(
                        'Join request',
                        `Approve ${u.firstName} to join this trip?`,
                        [
                          { text: 'Decline', style: 'destructive', onPress: () => void respondJoinRequest(req.id, false) },
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Approve', onPress: () => void respondJoinRequest(req.id, true) },
                        ],
                      );
                      return;
                    }
                  }
                  onOpenProfile?.(u);
                }}
              >
                <Avatar source={u.avatar} size={52} />
                <Text style={styles.travelerName} numberOfLines={1}>
                  {u.firstName}
                </Text>
                <Text style={styles.pendingTag}>Pending</Text>
              </Pressable>
            ))}
            {isMember ? (
              <Pressable
                style={styles.traveler}
                onPress={() => setInviteSheetOpen(true)}
                accessibilityLabel="Invite travelers"
              >
                <View style={styles.addTravelerBtn}>
                  <Ionicons name="add" size={28} color={colors.brandTeal} />
                </View>
                <Text style={styles.travelerName}>Invite</Text>
              </Pressable>
            ) : null}
          </ScrollView>

          {showAcceptInvite ? (
            <Pressable
              style={[styles.joinWide, inviteBusy && styles.joinWideOff]}
              onPress={() => void acceptInvite()}
              disabled={inviteBusy}
            >
              {inviteBusy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color={colors.white} />
                  <Text style={styles.joinWideText}>Accept invite</Text>
                </>
              )}
            </Pressable>
          ) : null}

          {!isMember &&
          !showAcceptInvite &&
          !joinRequested &&
          trip.myJoinStatus !== 'pending' &&
          (inviteToken || trip.inviteToken) ? (
            <Pressable
              style={[styles.joinWide, joinBusy && styles.joinWideOff]}
              onPress={() => void joinViaLink()}
              disabled={joinBusy}
            >
              {joinBusy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="airplane" size={16} color={colors.white} />
                  <Text style={styles.joinWideText}>Join this trip</Text>
                </>
              )}
            </Pressable>
          ) : null}

          {!isMember &&
          !showAcceptInvite &&
          (joinRequested || trip.myJoinStatus === 'pending') ? (
            <Pressable
              style={[styles.joinWide, styles.joinBesideRequested, joinBusy && styles.joinWideOff]}
              onPress={() => void requestJoin()}
              disabled={joinBusy}
            >
              {joinBusy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="time-outline" size={16} color={colors.white} />
                  <Text style={styles.joinWideText}>Pending</Text>
                </>
              )}
            </Pressable>
          ) : null}

          {isMember ? (
            <Pressable
              style={[styles.chatWide, chatBusy && styles.joinWideOff]}
              onPress={() => void openTripChat()}
              disabled={chatBusy}
            >
              {chatBusy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="chatbubbles" size={16} color={colors.white} />
                  <Text style={styles.joinWideText}>Trip chat</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>

        {isMember ? (
          <View style={styles.uploadBar}>
            <Pressable style={styles.uploadBtn} onPress={() => void pickPhotos()}>
              <Ionicons name="images-outline" size={20} color={colors.white} />
              <Text style={styles.uploadBtnText}>Add photos</Text>
            </Pressable>
            {pendingUris.length > 0 ? (
              <View style={styles.pendingBox}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {pendingUris.map((uri, i) => (
                    <View key={`${uri}-${i}`} style={styles.pendingThumbWrap}>
                      <Image
                        source={toImageSource(uri)}
                        style={styles.pendingThumb}
                      />
                      <Pressable
                        style={styles.pendingRemove}
                        onPress={() =>
                          setPendingUris((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <Ionicons name="close" size={12} color={colors.white} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
                <Pressable
                  style={[styles.confirmUpload, uploading && { opacity: 0.6 }]}
                  disabled={uploading}
                  onPress={() => void confirmUpload()}
                >
                  {uploading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.confirmUploadText}>
                      Upload {pendingUris.length} photo
                      {pendingUris.length === 1 ? '' : 's'}
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionEyebrow}>Photos</Text>
        {isMember && selectMode ? (
          <View style={styles.selectBar}>
            <Pressable
              onPress={() => {
                setSelectMode(false);
                setSelectedIds(new Set());
              }}
            >
              <Text style={styles.selectBarAction}>Cancel</Text>
            </Pressable>
            <Text style={styles.selectBarCount}>
              {selectedIds.size} selected
            </Text>
            <Pressable
              disabled={selectedIds.size === 0 || savingPhotos}
              onPress={() => void saveSelectedPhotos()}
            >
              {savingPhotos ? (
                <ActivityIndicator color={colors.programBlue} />
              ) : (
                <Text
                  style={[
                    styles.selectBarAction,
                    selectedIds.size === 0 && { opacity: 0.4 },
                  ]}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}
        <View
          style={styles.gallery}
          onLayout={(e) => {
            gridTopRef.current = e.nativeEvent.layout.y;
          }}
          onStartShouldSetResponder={() => selectMode && isMember}
          onMoveShouldSetResponder={() => selectMode && isMember}
          onResponderGrant={(e) => {
            if (!selectMode || !isMember) return;
            dragSelectingRef.current = true;
            selectAtPoint(e.nativeEvent.locationX, e.nativeEvent.locationY);
          }}
          onResponderMove={(e) => {
            if (!dragSelectingRef.current) return;
            selectAtPoint(e.nativeEvent.locationX, e.nativeEvent.locationY);
            const y = e.nativeEvent.pageY;
            if (y < 140) {
              scrollRef.current?.scrollTo({
                y: Math.max(0, scrollYRef.current - 28),
                animated: false,
              });
            } else if (y > 620) {
              scrollRef.current?.scrollTo({
                y: scrollYRef.current + 28,
                animated: false,
              });
            }
          }}
          onResponderRelease={() => {
            dragSelectingRef.current = false;
          }}
        >
          {photos.length === 0 ? (
            <View style={styles.emptyGallery}>
              <Ionicons name="images-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No photos yet</Text>
              <Text style={styles.emptySub}>
                {isMember
                  ? 'Be the first to add photos from this trip.'
                  : 'Photos from this trip will show up here.'}
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {photos.map((ph, i) => {
                const selected = selectedIds.has(ph.id);
                return (
                  <Pressable
                    key={ph.id}
                    style={[
                      styles.tile,
                      {
                        width: `${100 / GRID}%`,
                        padding: GAP / 2,
                      },
                    ]}
                    onLayout={(e: LayoutChangeEvent) => {
                      const { x, y, width, height } = e.nativeEvent.layout;
                      tileLayouts.current[ph.id] = {
                        x,
                        y,
                        w: width,
                        h: height,
                      };
                    }}
                    onLongPress={() => {
                      if (!isMember) return;
                      setSelectMode(true);
                      setSelectedIds(new Set([ph.id]));
                    }}
                    delayLongPress={280}
                    onPress={() => {
                      if (selectMode && isMember) {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(ph.id)) next.delete(ph.id);
                          else next.add(ph.id);
                          return next;
                        });
                        return;
                      }
                      setViewerIndex(i);
                    }}
                  >
                    <View
                      style={[
                        styles.tileInner,
                        selected && styles.tileInnerSelected,
                      ]}
                    >
                      <Image
                        source={toImageSource(ph.imageUrl)}
                        style={styles.tileImg}
                        resizeMode="cover"
                      />
                      {selectMode && isMember ? (
                        <View
                          style={[
                            styles.selectCheck,
                            selected && styles.selectCheckOn,
                          ]}
                        >
                          {selected ? (
                            <Ionicons
                              name="checkmark"
                              size={14}
                              color={colors.white}
                            />
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {isMember ? (
          <View style={styles.manageSection}>
            <Pressable
              style={styles.manageToggle}
              onPress={() => setShowManage((v) => !v)}
            >
              <Text style={styles.manageTitle}>Trip settings</Text>
              <Ionicons
                name={showManage ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
            {showManage ? (
              <View style={styles.manageBody}>
                {isOwner && displayStatus !== 'past' ? (
                  <Pressable
                    style={styles.openJoinRow}
                    onPress={() => void toggleOpen(!trip.openToJoin)}
                  >
                    <Text style={styles.openJoinLabel}>
                      Open to join
                      {trip.status === 'upcoming' ? ' (upcoming)' : ''}
                    </Text>
                    <Ionicons
                      name={trip.openToJoin ? 'toggle' : 'toggle-outline'}
                      size={34}
                      color={trip.openToJoin ? colors.openJoin : colors.textMuted}
                    />
                  </Pressable>
                ) : null}
                <Pressable style={styles.copyInviteBtn} onPress={() => void copyLink()}>
                  <Ionicons name="link" size={18} color={colors.openJoin} />
                  <Text style={styles.copyInviteText}>Copy invite link</Text>
                </Pressable>
                <Text style={styles.inviteLabel}>Invite travelers</Text>
                <TextInput
                  value={inviteQuery}
                  onChangeText={setInviteQuery}
                  placeholder="Find friends to invite"
                  placeholderTextColor={colors.textMuted}
                  style={styles.inviteInput}
                />
                {inviteHits.map((u) => (
                  <View key={u.id} style={styles.inviteRow}>
                    <Avatar source={u.avatar} size={36} />
                    <Text style={styles.inviteName}>{u.fullName}</Text>
                    <Pressable
                      style={styles.inviteBtn}
                      onPress={() => void inviteUser(u)}
                    >
                      <Text style={styles.inviteBtnText}>Invite</Text>
                    </Pressable>
                  </View>
                ))}
                {pending.length > 0 ? (
                  <>
                    <Text style={styles.inviteLabel}>Pending invites</Text>
                    {pending.map((u) => (
                      <View key={u.id} style={styles.inviteRow}>
                        <Avatar source={u.avatar} size={36} />
                        <Text style={styles.inviteName}>{u.fullName}</Text>
                      </View>
                    ))}
                  </>
                ) : null}
                {isMember && joinRequests.length > 0 ? (
                  <>
                    <Text style={styles.inviteLabel}>Join requests</Text>
                    {joinRequests.map((r) => (
                      <View key={r.id} style={styles.inviteRow}>
                        <Avatar source={r.profile?.avatar} size={36} />
                        <Text style={styles.inviteName} numberOfLines={1}>
                          {r.profile?.fullName ?? 'Traveler'}
                        </Text>
                        <Pressable
                          style={[styles.inviteBtn, styles.declineJoinBtn]}
                          disabled={joinBusyId === r.id}
                          onPress={() => void respondJoinRequest(r.id, false)}
                        >
                          <Text style={styles.declineJoinText}>Decline</Text>
                        </Pressable>
                        <Pressable
                          style={styles.inviteBtn}
                          disabled={joinBusyId === r.id}
                          onPress={() => void respondJoinRequest(r.id, true)}
                        >
                          <Text style={styles.inviteBtnText}>Accept</Text>
                        </Pressable>
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ height: 48 }} />
      </ScrollView>

      {viewerIndex != null ? (
        <AlbumPhotoViewer
          photos={photos}
          initialIndex={viewerIndex}
          profiles={profiles}
          onClose={() => setViewerIndex(null)}
          onOpenProfile={onOpenProfile}
        />
      ) : null}

      <InviteTravelersSheet
        visible={inviteSheetOpen}
        excludeIds={[
          ...(trip?.memberIds ?? []),
          ...(trip?.pendingInviteeIds ?? []),
        ]}
        inviteLink={trip ? chatRepo.tripInviteLink(trip) : null}
        onClose={() => setInviteSheetOpen(false)}
        onConfirm={async (userIds) => {
          const failures: string[] = [];
          for (const id of userIds) {
            try {
              await chatRepo.inviteToTrip(tripId, id);
            } catch {
              failures.push(id);
            }
          }
          await refresh();
          if (failures.length === userIds.length) {
            Alert.alert(
              'Invite failed',
              'Couldn’t send invites. Try again.',
            );
          } else if (failures.length > 0) {
            Alert.alert(
              'Some invites failed',
              'A few people weren’t invited. Check Trip settings and retry.',
            );
          }
        }}
      />
    </View>
    </GestureDetector>
  );

  async function inviteUser(user: ChatProfile) {
    if (!trip) return;
    try {
      await chatRepo.inviteToTrip(trip.id, user.id);
      setInviteQuery('');
      await refresh();
    } catch (e: any) {
      Alert.alert('Invite failed', e?.message ?? 'Try again');
    }
  }

  async function respondJoinRequest(requestId: string, accept: boolean) {
    setJoinBusyId(requestId);
    try {
      await chatRepo.respondTripJoinRequest(requestId, accept);
      await refresh();
    } catch (e: any) {
      Alert.alert(
        accept ? 'Couldn’t accept' : 'Couldn’t decline',
        e?.message ?? 'Try again',
      );
    } finally {
      setJoinBusyId(null);
    }
  }

  async function lockIn() {
    if (!trip || !isOwner || confirming) return;
    let pendingCount = joinRequests.length;
    try {
      pendingCount = await chatRepo.countPendingJoinRequests(trip.id);
    } catch {
      // use local count
    }
    if (pendingCount > 0) {
      const ok = await confirmChoice(
        'Lock in this trip?',
        `${pendingCount} pending join request${pendingCount === 1 ? '' : 's'} will be declined. Accept anyone you want first.`,
        'Lock in anyway',
        true,
      );
      if (!ok) return;
    }
    setConfirming(true);
    try {
      await chatRepo.confirmTrip(trip.id);
      await refresh();
    } catch (e: any) {
      Alert.alert('Couldn’t lock trip', e?.message ?? 'Try again');
    } finally {
      setConfirming(false);
    }
  }

  async function unlock() {
    if (!trip || !isOwner || confirming) return;
    const ok = await confirmChoice(
      'Unlock trip?',
      'Move this trip back to planning?',
      'Unlock',
    );
    if (!ok) return;
    setConfirming(true);
    try {
      await chatRepo.unconfirmTrip(trip.id);
      await refresh();
    } catch (e: any) {
      Alert.alert('Couldn’t unlock', e?.message ?? 'Try again');
    } finally {
      setConfirming(false);
    }
  }

  async function toggleOpen(open: boolean) {
    if (!trip || !isOwner) return;
    try {
      await chatRepo.setTripOpenToJoin(trip.id, open);
      await refresh();
    } catch (e: any) {
      Alert.alert('Couldn’t update', e?.message ?? 'Try again');
    }
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7FAFF' },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(23,88,100,0.06)',
  },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loading: { fontFamily: fonts.bold, color: colors.textMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.12)',
  },
  followBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.12)',
  },
  followBtnOn: {
    backgroundColor: '#E8F6FC',
    borderColor: 'rgba(23,88,100,0.35)',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.programBlue,
  },
  scroll: { paddingBottom: 20 },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.08)',
    shadowColor: colors.brandTeal,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F6FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destination: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.black,
  },
  dateChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandMint,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dates: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.programBlue,
  },
  desc: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  metaLine: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F7FBFC',
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: fonts.bold, fontSize: 12 },
  openBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.openJoin,
  },
  openText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.openJoin,
  },
  lockWrap: {
    marginTop: 10,
    marginBottom: 4,
    width: '100%',
  },
  travelersHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  travelersLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
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
  joinBesideRequested: {
    backgroundColor: '#0039B8',
  },
  joinBesideText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
  },
  travelersRow: { gap: 12, paddingRight: 4, paddingTop: 4 },
  traveler: { width: 60, alignItems: 'center', gap: 4 },
  travelerName: {
    fontFamily: fonts.bold,
    fontSize: 12,
    textAlign: 'center',
    width: 60,
  },
  hostTag: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.programBlue,
  },
  pendingTag: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: '#E67E22',
  },
  addTravelerBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.brandTeal,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7F2F1',
  },
  joinWide: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.openJoin,
    borderRadius: 14,
    paddingVertical: 12,
  },
  joinWideRequested: {
    backgroundColor: '#0039B8',
  },
  joinWideOff: {
    opacity: 0.65,
  },
  joinWideText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
  chatWide: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.programBlue,
    borderRadius: 14,
    paddingVertical: 12,
  },
  uploadBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 10,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.programBlue,
    borderRadius: 14,
    paddingVertical: 12,
  },
  uploadBtnText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 15,
  },
  pendingBox: { gap: 10 },
  pendingThumbWrap: { position: 'relative' },
  pendingThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#EEE',
  },
  pendingRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmUpload: {
    backgroundColor: colors.openJoin,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 12,
  },
  confirmUploadText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 15,
  },
  sectionEyebrow: {
    marginTop: 14,
    marginBottom: 8,
    marginHorizontal: 16,
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.openJoin,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  gallery: { marginTop: 0 },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 4,
  },
  selectBarAction: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.programBlue,
  },
  selectBarCount: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.black,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  tile: {
    aspectRatio: 1,
  },
  tileInner: {
    flex: 1,
    backgroundColor: '#E8EEF6',
    overflow: 'hidden',
    borderRadius: 2,
  },
  tileInnerSelected: {
    borderWidth: 3,
    borderColor: colors.programBlue,
  },
  selectCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCheckOn: {
    backgroundColor: colors.programBlue,
    borderColor: colors.white,
  },
  tileImg: {
    width: '100%',
    height: '100%',
  },
  emptyGallery: {
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.08)',
  },
  emptyTitle: { fontFamily: fonts.extraBold, fontSize: 16 },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  manageSection: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.08)',
  },
  manageToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  manageTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.textMuted },
  manageBody: { gap: 12, paddingBottom: 12 },
  unlockBtn: { paddingVertical: 8 },
  unlockText: { fontFamily: fonts.bold, color: colors.programBlue },
  openJoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  openJoinLabel: { fontFamily: fonts.bold, fontSize: 14 },
  copyInviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
  },
  copyInviteText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.openJoin,
  },
  inviteLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    marginTop: 4,
  },
  inviteInput: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.regular,
    fontSize: 14,
    backgroundColor: colors.brandMint,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inviteName: { flex: 1, fontFamily: fonts.bold, fontSize: 14 },
  inviteBtn: {
    backgroundColor: colors.programBlue,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  inviteBtnText: { fontFamily: fonts.bold, color: colors.white, fontSize: 12 },
  declineJoinBtn: {
    backgroundColor: '#EFEFEF',
  },
  declineJoinText: {
    fontFamily: fonts.bold,
    color: colors.black,
    fontSize: 12,
  },
});
