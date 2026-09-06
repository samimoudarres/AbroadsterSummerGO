import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { CommunityScreen } from '../community/CommunityScreen';
import { TripsScreen } from '../trips/TripsScreen';
import { CreateTripScreen } from '../trips/CreateTripScreen';
import { TripAlbumScreen } from '../trips/TripAlbumScreen';
import { TaggedTripSheet } from '../trips/TaggedTripSheet';
import { HomeFeedScreen } from '../home/HomeFeedScreen';
import {
  NotificationsScreen,
  type NotificationNav,
} from '../home/NotificationsScreen';
import { CreatePostScreen } from '../home/CreatePostScreen';
import { BottomNav } from '../navigation/BottomNav';
import { ProfileModal } from '../profile/ProfileModal';
import { SuggestedAccountsOverlay } from '../profile/SuggestedAccountsOverlay';
import { getUserById } from '../../data/mockMapData';
import {
  allowDemoSeedMerge,
  chatRepo,
  initChat,
} from '../../lib/chat/repository';
import { warmOwnProfileCache } from '../../lib/profile/profileCache';
import { schoolMapTarget } from '../../lib/schoolMapTarget';
import { useAuth } from '../../lib/auth/AuthContext';
import { useBottomNavClearance } from '../../lib/layout/safeArea';
import { startNotificationResponseRouting } from '../../lib/push/notificationRouting';
import { parseTripInviteTokenFromUrl } from '../../lib/trips/inviteLinks';
import type { UserProfile } from '../../data/types';
import type { ChatProfile, ChatTrip, FeedPost } from '../../data/chatTypes';
import type { MapCamera } from '../map/mapTypes';
import { BRAND_TEAL } from '../../constants/theme';

const MapScreen = lazy(() =>
  import('../map/MapScreen').then((m) => ({ default: m.MapScreen })),
);

type TabKey = 'home' | 'messages' | 'trips' | 'map' | 'profile';

/** Rough city centers for demo posts without coords. */
const LOCATION_COORDS: Record<string, { latitude: number; longitude: number; zoom: number }> = {
  'Santorini, Greece': { latitude: 36.3932, longitude: 25.4615, zoom: 11.5 },
  'Paris, France': { latitude: 48.8566, longitude: 2.3522, zoom: 12.2 },
  'Rome, Italy': { latitude: 41.9028, longitude: 12.4964, zoom: 12 },
  'Barcelona, Spain': { latitude: 41.3874, longitude: 2.1686, zoom: 12 },
  'Lisbon, Portugal': { latitude: 38.7223, longitude: -9.1393, zoom: 12 },
  'London, UK': { latitude: 51.5074, longitude: -0.1278, zoom: 11.8 },
  'Amsterdam, Netherlands': { latitude: 52.3676, longitude: 4.9041, zoom: 12 },
  'Athens, Greece': { latitude: 37.9838, longitude: 23.7275, zoom: 12 },
  'Sicily, Italy': { latitude: 37.5994, longitude: 14.0154, zoom: 8.8 },
  'Nice, France': { latitude: 43.7102, longitude: 7.262, zoom: 12 },
};

function chatToUserProfile(
  user: ChatProfile,
  friend = false,
): UserProfile {
  const mock = allowDemoSeedMerge() ? getUserById(user.id) : undefined;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    avatar: user.avatar,
    homeUniversity: user.homeUniversity,
    studyAbroadProgram: user.studyAbroadProgram,
    hostCity: user.hostCity || mock?.hostCity || '',
    hostCountry: user.hostCountry || mock?.hostCountry || '',
    semester: user.semester || mock?.semester || '',
    bio: user.bio || mock?.bio || undefined,
    countriesVisited: user.countriesVisited ?? mock?.countriesVisited ?? 0,
    isFriend: friend || mock?.isFriend || false,
    locationPrivacy: mock?.locationPrivacy ?? 'city',
    latitude: mock?.latitude ?? 48.8566,
    longitude: mock?.longitude ?? 2.3522,
    locationLabel: mock?.locationLabel ?? '',
    passportBadges: mock?.passportBadges ?? [],
    albums: [],
    posts: [],
    isVerifiedStudent: user.isVerifiedStudent,
  };
}

export function AppShell() {
  const {
    openMapOnboardingAfterAuth,
    clearOpenMapOnboardingAfterAuth,
  } = useAuth();
  const navClearance = useBottomNavClearance();
  const [activeTab, setActiveTab] = useState<TabKey>('map');
  const [dmUserId, setDmUserId] = useState<string | null>(null);
  const [dmThreadIdIntent, setDmThreadIdIntent] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<UserProfile | null>(null);
  const [meProfile, setMeProfile] = useState<UserProfile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showCreateTrip, setShowCreateTrip] = useState(false);
  const [albumTripId, setAlbumTripId] = useState<string | null>(null);
  /** Invite token from deep link — album can offer Join via link. */
  const [albumInviteToken, setAlbumInviteToken] = useState<string | null>(null);
  /** Trip tagged on a post — bottom sheet preview */
  const [taggedTripId, setTaggedTripId] = useState<string | null>(null);
  /** After creating a trip, jump to messages so the new trip channel is findable */
  const [focusTripChannelId, setFocusTripChannelId] = useState<string | null>(null);
  const [focusSchoolChannel, setFocusSchoolChannel] = useState<{
    channelId: string;
    communityId: string;
    slug?: string;
  } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [editPostId, setEditPostId] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<MapCamera | null>(null);
  const [mapRecenterNonce, setMapRecenterNonce] = useState(0);
  const [mapResetNonce, setMapResetNonce] = useState(0);
  const [mapSchoolNav, setMapSchoolNav] = useState<{
    kind: 'home' | 'abroad';
    label: string;
  } | null>(null);
  const [focusPostId, setFocusPostId] = useState<string | null>(null);
  const [feedNonce, setFeedNonce] = useState(0);
  const [firstMapOnboarding, setFirstMapOnboarding] = useState(false);
  const [showSuggestedOverlay, setShowSuggestedOverlay] = useState(false);

  const createX = useSharedValue(0);
  const createPostOpen = showCreatePost || Boolean(editPostId);
  useEffect(() => {
    if (createPostOpen) {
      createX.value = -420;
      createX.value = withTiming(0, { duration: 280 });
    }
  }, [createPostOpen]);
  const createSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: createX.value }],
  }));

  const openCreatePost = () => {
    setEditPostId(null);
    setShowCreatePost(true);
  };
  const openEditPost = (postId: string) => {
    setShowCreatePost(false);
    setEditPostId(postId);
  };
  const closeCreatePost = () => {
    setShowCreatePost(false);
    setEditPostId(null);
  };

  const showMap = activeTab === 'map' || activeTab === 'profile';
  const showMessages = activeTab === 'messages';
  const showTrips = activeTab === 'trips';
  const showHome = activeTab === 'home';
  /** Hide tab bar on create / album flows; keep it for notifications. */
  const hideBottomNav =
    showCreateTrip || createPostOpen || Boolean(albumTripId);
  const overlayBottom = hideBottomNav ? 0 : navClearance;

  const openProfileFromChat = async (user: ChatProfile) => {
    if (await chatRepo.isBlockedEither(user.id).catch(() => false)) {
      Alert.alert(
        'Unavailable',
        'This profile isn’t available because of a block.',
      );
      return;
    }
    const friend = await chatRepo.isFriend(user.id).catch(() => false);
    const next = chatToUserProfile(user, friend);
    setProfileUser(next);
    setShowProfile(true);
  };

  const openOwnProfileInstant = () => {
    setActiveTab('profile');
    if (meProfile) {
      setProfileUser(meProfile);
      setShowProfile(true);
    }
    void (async () => {
      try {
        const me = await chatRepo.getMe();
        const next = chatToUserProfile(me, false);
        setMeProfile(next);
        setProfileUser(next);
        setShowProfile(true);
      } catch {
        // keep whatever we already showed
      }
    })();
  };

  const openProfileById = async (userId: string) => {
    if (await chatRepo.isBlockedEither(userId)) {
      Alert.alert(
        'Unavailable',
        'This profile isn’t available because of a block.',
      );
      return;
    }
    const p = await chatRepo.getProfile(userId);
    if (p) {
      await openProfileFromChat(p);
      return;
    }
    if (allowDemoSeedMerge()) {
      const mock = getUserById(userId);
      if (mock) {
        setProfileUser(mock);
        setShowProfile(true);
      }
    }
  };

  const handleNotificationNav = useCallback(
    (nav: NotificationNav) => {
      setShowNotifications(false);
      if (nav.type === 'profile') {
        void openProfileById(nav.userId);
      } else if (nav.type === 'album') {
        setAlbumTripId(nav.tripId);
      } else if (nav.type === 'trip') {
        setAlbumTripId(nav.tripId);
      } else if (nav.type === 'map') {
        setActiveTab('map');
      } else if (nav.type === 'post') {
        setFocusPostId(nav.postId);
        setActiveTab('home');
      } else if (nav.type === 'dm') {
        setDmUserId(nav.userId);
        setDmThreadIdIntent(nav.threadId ?? null);
        setActiveTab('messages');
      } else if (nav.type === 'channel') {
        setFocusSchoolChannel({
          channelId: nav.channelId,
          communityId: nav.communityId,
          slug: nav.slug,
        });
        setActiveTab('messages');
      }
    },
    // openProfileById is stable enough for this shell lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    return startNotificationResponseRouting(handleNotificationNav);
  }, [handleNotificationNav]);

  // Trip invite deep links: abroadster://trip/TOKEN or HTTPS invite.html?t=
  useEffect(() => {
    let alive = true;
    const openInvite = async (url: string | null) => {
      if (!url || !alive) return;
      const token = parseTripInviteTokenFromUrl(url);
      if (!token || token === 'preview') return;
      try {
        await initChat();
        let trip = await chatRepo.resolveTripInviteToken(token);
        if (!trip) {
          Alert.alert('Invite not found', 'This trip invite link is invalid or expired.');
          return;
        }
        // Auto-join via token when possible; still open album either way
        try {
          const joined = await chatRepo.joinTripViaInviteToken(token);
          if (joined) trip = joined;
        } catch {
          // May need host approval / full — still show album
        }
        if (!alive) return;
        setAlbumInviteToken(token);
        setAlbumTripId(trip.id);
        setActiveTab('trips');
      } catch (e: any) {
        Alert.alert(
          'Couldn’t open invite',
          e?.message ?? 'Try again after signing in.',
        );
      }
    };
    void Linking.getInitialURL().then((url) => void openInvite(url));
    const sub = Linking.addEventListener('url', ({ url }) => {
      void openInvite(url);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Prefetch own profile so the nav tab opens without a blank loading state
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await initChat();
        const me = await chatRepo.getMe();
        if (cancelled) return;
        setMeProfile(chatToUserProfile(me, false));
        await warmOwnProfileCache();
      } catch {
        // offline / signed out — profile tab will fetch on demand
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** After signup: map + Europe/home filter + suggested overlay (not own profile). */
  useEffect(() => {
    if (!openMapOnboardingAfterAuth) return;
    let cancelled = false;
    (async () => {
      try {
        setActiveTab('map');
        setShowProfile(false);
        const settings = await chatRepo.getMySettings();
        if (cancelled) return;
        if (!settings.onboarding.first_map_done) {
          setFirstMapOnboarding(true);
        }
        if (!settings.onboarding.suggested_overlay_done) {
          setShowSuggestedOverlay(true);
        }
      } finally {
        if (!cancelled) clearOpenMapOnboardingAfterAuth();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openMapOnboardingAfterAuth, clearOpenMapOnboardingAfterAuth]);

  const openPostLocation = (post: FeedPost) => {
    const fromPost =
      post.latitude != null && post.longitude != null
        ? {
            latitude: post.latitude,
            longitude: post.longitude,
            zoom: 11.5,
          }
        : LOCATION_COORDS[post.locationLabel];
    if (fromPost) {
      setMapFocus(fromPost);
      setShowProfile(false);
      setActiveTab('map');
    }
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.body}>
        <View
          style={[styles.page, !showMap && styles.pageHidden]}
          pointerEvents={showMap ? 'auto' : 'none'}
        >
          <Suspense
            fallback={
              <View style={styles.mapBoot}>
                <ActivityIndicator color={BRAND_TEAL} size="large" />
              </View>
            }
          >
            <MapScreen
              hideBottomNav
              mapActive={showMap}
              focusTarget={mapFocus}
              onConsumedFocusTarget={() => setMapFocus(null)}
              recenterNonce={mapRecenterNonce}
              resetNonce={mapResetNonce}
              schoolNav={mapSchoolNav}
              onConsumedSchoolNav={() => setMapSchoolNav(null)}
              firstMapOnboarding={firstMapOnboarding}
              onConsumedFirstMapOnboarding={() => setFirstMapOnboarding(false)}
              onMessageUser={(userId) => {
                setDmUserId(userId);
                setActiveTab('messages');
              }}
              onOpenProfile={(user) => {
                void openProfileById(user.id);
              }}
              onCreateTrip={() => setShowCreateTrip(true)}
              onOpenTrip={(tripId) => setTaggedTripId(tripId)}
            />
          </Suspense>
        </View>
        <View
          style={[styles.page, styles.frontPage, !showHome && styles.pageHidden]}
          pointerEvents={showHome ? 'auto' : 'none'}
        >
          <HomeFeedScreen
            onOpenProfile={openProfileFromChat}
            onOpenAlbum={(tripId) => setAlbumTripId(tripId)}
            onOpenNotifications={() => setShowNotifications(true)}
            onOpenCreatePost={openCreatePost}
            focusPostId={focusPostId}
            onConsumedFocusPost={() => setFocusPostId(null)}
            feedNonce={feedNonce}
            onOpenLocation={openPostLocation}
            onOpenTaggedTrip={(tripId) => setTaggedTripId(tripId)}
            onEditPost={openEditPost}
            onSharedToTrip={(channelId) => {
              setFocusTripChannelId(channelId);
              setActiveTab('messages');
            }}
          />
        </View>
        <View
          style={[styles.page, styles.frontPage, !showMessages && styles.pageHidden]}
          pointerEvents={showMessages ? 'auto' : 'none'}
        >
          <CommunityScreen
            initialDmUserId={dmUserId}
            initialDmThreadId={dmThreadIdIntent}
            onConsumedDmIntent={() => {
              setDmUserId(null);
              setDmThreadIdIntent(null);
            }}
            initialTripChannelId={focusTripChannelId}
            onConsumedTripChannel={() => setFocusTripChannelId(null)}
            initialSchoolChannel={focusSchoolChannel}
            onConsumedSchoolChannel={() => setFocusSchoolChannel(null)}
            onViewSharedPost={(postId) => {
              setFocusPostId(postId);
              setActiveTab('home');
            }}
            onOpenTaggedTrip={(tripId) => setTaggedTripId(tripId)}
            onOpenTripAlbum={(tripId) => setAlbumTripId(tripId)}
          />
        </View>
        <View
          style={[styles.page, styles.frontPage, !showTrips && styles.pageHidden]}
          pointerEvents={showTrips ? 'auto' : 'none'}
        >
          <TripsScreen
            onOpenProfile={(user) => {
              setProfileUser(user);
              setShowProfile(true);
            }}
            onCreateTrip={() => setShowCreateTrip(true)}
            onOpenAlbum={(trip: ChatTrip) => setAlbumTripId(trip.id)}
            onAirMail={(userId) => {
              setDmUserId(userId);
              setActiveTab('messages');
            }}
          />
        </View>
      </View>

      <ProfileModal
        visible={showProfile}
        user={profileUser}
        overlayBottom={albumTripId ? 0 : navClearance}
        onClose={() => {
          setShowProfile(false);
          if (activeTab === 'profile') setActiveTab('map');
        }}
        onOpenAlbum={(tripId) => {
          setShowProfile(false);
          setAlbumTripId(tripId);
        }}
        onOpenSchool={(label, kind) => {
          setShowProfile(false);
          setActiveTab('map');
          // Abroad programs: fly to the program city. Home unis: stay where
          // you are and filter students in the current viewport.
          if (kind === 'abroad') {
            const cam = schoolMapTarget(label);
            if (cam) setMapFocus(cam);
          }
          setMapSchoolNav({
            kind: kind === 'home' ? 'home' : 'abroad',
            label,
          });
        }}
        onOpenLocation={openPostLocation}
        onOpenTaggedTrip={(tripId) => setTaggedTripId(tripId)}
        onOpenProfile={(u) => {
          void openProfileFromChat(u);
        }}
        onProfileUpdated={(u) => {
          const next = chatToUserProfile(u, false);
          setMeProfile(next);
          setProfileUser(next);
          void warmOwnProfileCache();
        }}
        onAirMail={(userId) => {
          setShowProfile(false);
          setDmUserId(userId);
          setActiveTab('messages');
        }}
        onEditPost={(postId) => {
          setShowProfile(false);
          openEditPost(postId);
        }}
      />

      <SuggestedAccountsOverlay
        visible={showSuggestedOverlay}
        onDismissed={() => setShowSuggestedOverlay(false)}
        onOpenProfile={(u) => {
          setShowSuggestedOverlay(false);
          void openProfileFromChat(u);
        }}
      />

      {showCreateTrip ? (
        <View style={[styles.overlay, { bottom: overlayBottom }]}>
          <CreateTripScreen
            onClose={() => setShowCreateTrip(false)}
            onCreated={(trip) => {
              setShowCreateTrip(false);
              setAlbumTripId(trip.id);
              if (trip.channelId) setFocusTripChannelId(trip.channelId);
            }}
          />
        </View>
      ) : null}

      {albumTripId ? (
        <View style={[styles.overlay, { bottom: overlayBottom }]}>
          <TripAlbumScreen
            tripId={albumTripId}
            inviteToken={albumInviteToken}
            onClose={() => {
              setAlbumTripId(null);
              setAlbumInviteToken(null);
            }}
            onOpenProfile={openProfileFromChat}
            onOpenTripChat={(channelId) => {
              setAlbumTripId(null);
              setAlbumInviteToken(null);
              setFocusTripChannelId(channelId);
              setActiveTab('messages');
            }}
          />
        </View>
      ) : null}

      <TaggedTripSheet
        visible={Boolean(taggedTripId)}
        tripId={taggedTripId}
        onClose={() => setTaggedTripId(null)}
        onSelectUser={(u) => {
          setTaggedTripId(null);
          void openProfileFromChat(u);
        }}
        onOpenFullAlbum={(tripId) => {
          setTaggedTripId(null);
          setAlbumTripId(tripId);
        }}
        onRequestJoin={async (trip) => {
          try {
            await chatRepo.requestTripJoin(trip.id);
            const updated = await chatRepo.getTrip(trip.id);
            if (updated) {
              setTaggedTripId(null);
              requestAnimationFrame(() => setTaggedTripId(updated.id));
            }
          } catch {
            // ignore — sheet stays open
          }
        }}
        onCancelRequest={async (trip) => {
          try {
            await chatRepo.cancelTripJoin(trip.id);
            const updated = await chatRepo.getTrip(trip.id);
            if (updated) {
              setTaggedTripId(null);
              requestAnimationFrame(() => setTaggedTripId(updated.id));
            }
          } catch {
            // ignore
          }
        }}
      />

      {showNotifications ? (
        <View style={[styles.overlay, { bottom: navClearance }]}>
          <NotificationsScreen
            onClose={() => setShowNotifications(false)}
            onNavigate={handleNotificationNav}
          />
        </View>
      ) : null}

      {createPostOpen ? (
        <Animated.View
          style={[styles.overlay, { bottom: overlayBottom }, createSlideStyle]}
        >
          <CreatePostScreen
            key={editPostId ? `edit-${editPostId}` : 'create'}
            editPostId={editPostId}
            onClose={closeCreatePost}
            onPosted={(postId) => {
              setFeedNonce((n) => n + 1);
              setFocusPostId(postId);
              setActiveTab('home');
              closeCreatePost();
              void warmOwnProfileCache();
            }}
          />
        </Animated.View>
      ) : null}

      {/* Keep nav for notifications; hide on create/album so overlays are full-screen */}
      {!hideBottomNav ? (
        <BottomNav
          active={activeTab === 'profile' ? 'profile' : activeTab}
          onChange={(tab) => {
            setShowNotifications(false);
            if (tab === 'profile') {
              openOwnProfileInstant();
              return;
            }
            if (showProfile) setShowProfile(false);
            if (tab === 'map' && activeTab === 'map') {
              setMapResetNonce((n) => n + 1);
              return;
            }
            setActiveTab(tab);
          }}
        />
      ) : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1 },
  page: { ...StyleSheet.absoluteFill },
  pageHidden: { opacity: 0 },
  frontPage: { zIndex: 2, backgroundColor: '#fff' },
  mapBoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDE5EA',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    backgroundColor: '#fff',
  },
});
