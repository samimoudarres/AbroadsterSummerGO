import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type {
  ChatProfile,
  FeedAlbumCard,
  FeedPost,
} from '../../data/chatTypes';
import type { UserProfile } from '../../data/types';
import { resolveSchoolVisual } from '../../lib/schools/catalog';
import { toImageSource } from '../../lib/images';
import {
  chatRepo,
  DEMO_ME_ID,
  initChat,
  isOwnSender,
  subscribeChat,
} from '../../lib/chat/repository';
import {
  fetchProfileBundle,
  getCachedProfile,
  setCachedProfile,
} from '../../lib/profile/profileCache';
import { feedImageSource } from '../../lib/feed/feedPhotos';
import { formatExplorerScore, computeExplorerScoreMiles } from '../../lib/explorerScore';
import { presentLocalNotification } from '../../lib/trips/push';
import { useEdgeSwipeBack } from '../../lib/gestures/useEdgeSwipeBack';
import { PHONE_WIDTH } from '../layout/PhoneShell';
import { Avatar } from '../common/Avatar';
import {
  ABROADSTER_HEADER_ICON,
  AbroadsterTopBar,
} from '../common/AbroadsterTopBar';
import { AlbumPreviewCard, ALBUM_CARD_WIDTH } from '../home/AlbumPreviewCard';
import { PassportPanel } from './PassportPanel';
import { ProfilePostsViewer } from './ProfilePostsViewer';
import { ProfileMenuSheet, type ProfileMenuItem } from './ProfileMenuSheet';
import { EditProfileScreen } from './EditProfileScreen';
import { SettingsScreen } from './SettingsScreen';
import { ReportUserSheet } from './ReportUserSheet';
import { FriendsListSheet } from './FriendsListSheet';
import { useBottomNavClearance } from '../../lib/layout/safeArea';
import { LegalDocumentModal } from '../legal/LegalDocumentModal';
import { CollageCanvas } from '../home/create/CollageCanvas';

const GRID_GAP = 2;
const GRID_COLS = 2;

interface ProfileModalProps {
  visible: boolean;
  user: UserProfile | null;
  onClose: () => void;
  onOpenAlbum?: (tripId: string) => void;
  onOpenSchool?: (schoolLabel: string, kind: 'home' | 'abroad') => void;
  onOpenLocation?: (post: FeedPost) => void;
  onOpenTaggedTrip?: (tripId: string) => void;
  onOpenProfile?: (user: ChatProfile) => void;
  /** Called after the signed-in user saves profile edits. */
  onProfileUpdated?: (profile: ChatProfile) => void;
  /** Open AirMail / DM (works without prior friendship). */
  onAirMail?: (userId: string) => void;
  onEditPost?: (postId: string) => void;
  /** Override bottom inset (0 = full-bleed over hidden nav / album). */
  overlayBottom?: number;
}

function schoolAccent(label: string, fallback: string): string {
  if (!label) return fallback;
  return resolveSchoolVisual({ name: label }).accent || fallback;
}

function cityKeyFromLabel(label: string): string {
  return label.split(',')[0]?.trim().toLowerCase() || label.trim().toLowerCase();
}

function applyBundle(
  bundle: {
    posts: FeedPost[];
    albums: FeedAlbumCard[];
    chatProfile: ChatProfile | null;
    friendsCount: number;
    isFriend: boolean;
    tripNotify: boolean;
    profiles: Record<string, ChatProfile>;
  },
  setters: {
    setPosts: (p: FeedPost[]) => void;
    setAlbums: (a: FeedAlbumCard[]) => void;
    setChatProfile: (p: ChatProfile | null) => void;
    setFriendsCount: (n: number) => void;
    setIsFriend: (v: boolean) => void;
    setTripNotify: (v: boolean) => void;
    setProfiles: (m: Record<string, ChatProfile>) => void;
  },
) {
  setters.setPosts(bundle.posts);
  setters.setAlbums(bundle.albums);
  setters.setChatProfile(bundle.chatProfile);
  setters.setFriendsCount(bundle.friendsCount);
  setters.setIsFriend(bundle.isFriend);
  setters.setTripNotify(bundle.tripNotify);
  setters.setProfiles(bundle.profiles);
}

export function ProfileModal({
  visible,
  user,
  onClose,
  onOpenAlbum,
  onOpenSchool,
  onOpenLocation,
  onOpenTaggedTrip,
  onOpenProfile,
  onProfileUpdated,
  onAirMail,
  onEditPost,
  overlayBottom,
}: ProfileModalProps) {
  const [tab, setTab] = useState<'posts' | 'passport'>('posts');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [albums, setAlbums] = useState<FeedAlbumCard[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [chatProfile, setChatProfile] = useState<ChatProfile | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false);
  const [meId, setMeId] = useState(DEMO_ME_ID);
  const [isFriend, setIsFriend] = useState(false);
  const [tripNotify, setTripNotify] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsCount, setFriendsCount] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editPanel, setEditPanel] = useState<'profile' | 'password'>('profile');
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);
  const [gridWidth, setGridWidth] = useState(PHONE_WIDTH);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const loadedUserIdRef = useRef<string | null>(null);
  const loadGenRef = useRef(0);
  const navClearance = useBottomNavClearance();
  const edgeBack = useEdgeSwipeBack(onClose);
  const cellW = Math.max(
    1,
    (gridWidth - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS,
  );

  const goTab = (next: 'posts' | 'passport') => {
    setTab(next);
  };

  const hydrateFromCache = useCallback((userId: string) => {
    const cached = getCachedProfile(userId);
    if (!cached) return false;
    applyBundle(cached, {
      setPosts,
      setAlbums,
      setChatProfile,
      setFriendsCount,
      setIsFriend,
      setTripNotify,
      setProfiles,
    });
    loadedUserIdRef.current = userId;
    return true;
  }, []);

  const load = useCallback(async (userId: string, opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    const hadCache = Boolean(getCachedProfile(userId));
    if (!silent && !hadCache) setLoadingProfile(true);
    const gen = ++loadGenRef.current;
    try {
      await initChat();
      const me = await chatRepo.getMe();
      if (gen !== loadGenRef.current) return;
      setMeId(me.id);
      const bundle = await fetchProfileBundle(userId);
      if (gen !== loadGenRef.current) return;
      if (!bundle) return;
      setCachedProfile(userId, bundle);
      applyBundle(bundle, {
        setPosts,
        setAlbums,
        setChatProfile,
        setFriendsCount,
        setIsFriend,
        setTripNotify,
        setProfiles,
      });
      loadedUserIdRef.current = userId;
    } finally {
      if (gen === loadGenRef.current) setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || !user) return;

    const sameUser = loadedUserIdRef.current === user.id;
    const fromCache = hydrateFromCache(user.id);

    if (!sameUser && !fromCache) {
      setTab('posts');
      setViewerIndex(null);
      setScoreInfoOpen(false);
      setPosts([]);
      setAlbums([]);
      setLoadingProfile(true);
    } else {
      // Revisit or warm cache — keep UI, refresh quietly
      setLoadingProfile(false);
    }

    void load(user.id, { silent: sameUser || fromCache });
    return subscribeChat(() => {
      void load(user.id, { silent: true });
    });
  }, [visible, user?.id, load, hydrateFromCache]);

  const isSelf = Boolean(user && isOwnSender(user.id, meId));

  const onToggleFriend = async () => {
    if (!user || isSelf || friendBusy) return;
    const wasFriend = isFriend;
    setFriendBusy(true);
    // Optimistic UI — roll back if the backend fails
    setIsFriend(!wasFriend);
    try {
      if (wasFriend) {
        await chatRepo.removeFriend(user.id);
      } else {
        await chatRepo.addFriend(user.id);
      }
      // Own profile friends count is who *I* added — refresh after toggle on self only
      if (isSelf) {
        setFriendsCount(await chatRepo.countFriendsForUser(user.id));
      }
    } catch (e: any) {
      setIsFriend(wasFriend);
      Alert.alert(
        wasFriend ? 'Couldn’t remove friend' : 'Couldn’t add friend',
        e?.message ?? 'Check your connection and try again.',
      );
    } finally {
      setFriendBusy(false);
    }
  };

  const menuItems: ProfileMenuItem[] = useMemo(() => {
    if (!user) return [];
    if (isSelf) {
      return [
        {
          key: 'settings',
          label: 'Settings',
          icon: 'settings-outline',
          onPress: () => setSettingsOpen(true),
        },
        {
          key: 'edit',
          label: 'Edit profile',
          icon: 'create-outline',
          onPress: () => {
            setEditPanel('profile');
            setEditOpen(true);
          },
        },
      ];
    }
    return [
      {
        key: 'notify',
        label: tripNotify
          ? 'Turn off trip notifications'
          : 'Turn on trip notifications',
        icon: tripNotify ? 'notifications' : 'notifications-outline',
        onPress: () => {
          void (async () => {
            const next = !tripNotify;
            await chatRepo.setTripNotify(user.id, next);
            setTripNotify(next);
            if (next) {
              await presentLocalNotification({
                title: 'Trip notifications on',
                body: `You’ll be notified when ${user.firstName} posts trips`,
                data: { fromUserId: user.id },
              });
            }
          })();
        },
      },
      isFriend
        ? {
            key: 'unfriend',
            label: 'Remove friend',
            icon: 'person-remove-outline' as const,
            destructive: true,
            onPress: () => {
              void (async () => {
                await chatRepo.removeFriend(user.id);
                setIsFriend(false);
              })();
            },
          }
        : {
            key: 'friend',
            label: 'Add friend',
            icon: 'person-add-outline' as const,
            onPress: () => {
              void onToggleFriend();
            },
          },
      {
        key: 'report',
        label: 'Report',
        icon: 'flag-outline',
        destructive: true,
        onPress: () => {
          setMenuOpen(false);
          setReportOpen(true);
        },
      },
      {
        key: 'block',
        label: 'Block',
        icon: 'ban-outline',
        destructive: true,
        onPress: () => {
          void (async () => {
            const ok = await new Promise<boolean>((resolve) => {
              Alert.alert(
                `Block ${user.firstName}?`,
                'You won’t see each other’s posts, profile, or messages. You can unblock them later in Settings → Blocked accounts.',
                [
                  { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                  {
                    text: 'Block',
                    style: 'destructive',
                    onPress: () => resolve(true),
                  },
                ],
              );
            });
            if (!ok) return;
            await chatRepo.blockUser(user.id);
            setIsFriend(false);
            onClose();
          })();
        },
      },
    ];
  }, [
    user,
    isSelf,
    tripNotify,
    isFriend,
    onClose,
    onToggleFriend,
  ]);

  const citiesVisited = useMemo(() => {
    if (
      typeof chatProfile?.citiesVisited === 'number' &&
      chatProfile.citiesVisited > 0
    ) {
      return chatProfile.citiesVisited;
    }
    if (user?.countriesVisited && user.passportBadges?.length) {
      // Prefer explicit cities when available; else derive from posts + trips
    }
    const cities = new Set<string>();
    for (const p of posts) {
      const c = cityKeyFromLabel(p.locationLabel || '');
      if (c) cities.add(c);
    }
    for (const a of albums) {
      const c = cityKeyFromLabel(a.destinationCity || '');
      if (c) cities.add(c);
    }
    if (cities.size > 0) return cities.size;
    return user?.countriesVisited ?? chatProfile?.countriesVisited ?? 0;
  }, [albums, chatProfile, posts, user]);

  const bio =
    chatProfile?.bio ||
    user?.bio ||
    '';

  const homeSchool =
    chatProfile?.homeUniversity || user?.homeUniversity || '';
  const abroadSchool =
    chatProfile?.studyAbroadProgram || user?.studyAbroadProgram || '';
  const homeAccent = schoolAccent(
    homeSchool,
    chatProfile?.homeAccent || '#9D9D9D',
  );
  const abroadAccent = schoolAccent(
    abroadSchool,
    chatProfile?.abroadAccent || '#9B51E0',
  );
  const homeVisual = resolveSchoolVisual({ name: homeSchool });
  const abroadVisual = resolveSchoolVisual({ name: abroadSchool });
  const explorerScore = Math.max(
    0,
    Math.round(
      chatProfile?.explorerScoreMiles && chatProfile.explorerScoreMiles > 0
        ? chatProfile.explorerScoreMiles
        : computeExplorerScoreMiles({
            homeUniversity: homeSchool,
            studyAbroadProgram: abroadSchool,
            hostCity: chatProfile?.hostCity || user?.hostCity,
            hostCountry: chatProfile?.hostCountry || user?.hostCountry,
            trips: [],
          }),
    ),
  );

  if (!visible || !user) return null;

  const listHeader = (
    <>
          <View style={styles.header}>
            <Avatar
              source={chatProfile?.avatar ?? user.avatar}
              size={86}
              style={styles.avatar}
            />
            <View style={styles.stats}>
              <Stat value={String(posts.length)} label="posts" />
              <Stat
                value={String(friendsCount)}
                label="friends"
                onPress={() => setFriendsOpen(true)}
              />
              <Stat
                value={String(citiesVisited)}
                label="cities"
                onPress={() => goTab('passport')}
              />
            </View>
          </View>

          <View style={styles.bioBlock}>
            <View style={styles.nameRow}>
              <Text style={styles.fullName} numberOfLines={1}>
                {user.fullName}
              </Text>
              {user.isVerifiedStudent ? (
                <View
                  style={styles.verifiedPill}
                  accessibilityLabel="Verified student"
                >
                  <Ionicons name="school" size={12} color={colors.openJoin} />
                  <Text style={styles.verifiedText}>Student</Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => setScoreInfoOpen((v) => !v)}
                style={[
                  styles.scorePill,
                  scoreInfoOpen && styles.scorePillActive,
                ]}
                accessibilityLabel="Explorer Score info"
              >
                <Ionicons name="globe-outline" size={12} color="#5C5C5C" />
                <Text style={styles.scoreValue}>
                  {formatExplorerScore(explorerScore)}
                </Text>
              </Pressable>
              {isSelf ? (
                <Pressable
                  onPress={() => {
                    setEditPanel('profile');
                    setEditOpen(true);
                  }}
                  style={styles.editProfileBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                >
                  <Text style={styles.editProfileBtnText}>Edit profile</Text>
                </Pressable>
              ) : null}
            </View>
            {scoreInfoOpen ? (
              <View style={styles.scorePop}>
                <View style={styles.scorePopHeader}>
                  <Text style={styles.scorePopTitle}>Explorer Score</Text>
                  <Pressable
                    onPress={() => setScoreInfoOpen(false)}
                    hitSlop={8}
                    accessibilityLabel="Close"
                  >
                    <Ionicons
                      name="close"
                      size={16}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </View>
                <Text style={styles.scorePopBody}>
                  Miles traveled from your home school to your abroad program,
                  plus each locked-in trip.
                </Text>
              </View>
            ) : null}
            <View style={styles.pillsRow}>
              {abroadSchool ? (
                <SchoolPill
                  label={abroadSchool}
                  accent={abroadAccent}
                  logo={abroadVisual.logoUrl}
                  onPress={() => onOpenSchool?.(abroadSchool, 'abroad')}
                />
              ) : null}
              {homeSchool ? (
                <SchoolPill
                  label={homeSchool}
                  accent={homeAccent}
                  logo={homeVisual.logoUrl}
                  onPress={() => onOpenSchool?.(homeSchool, 'home')}
                />
              ) : null}
            </View>
            {bio ? <Text style={styles.bio}>{bio}</Text> : null}
            {!isSelf ? (
              <View style={styles.actionRow}>
                <Pressable
                  style={[
                    styles.friendBtn,
                    styles.actionBtn,
                    isFriend && styles.friendBtnOn,
                    friendBusy && styles.friendBtnBusy,
                  ]}
                  onPress={() => void onToggleFriend()}
                  disabled={friendBusy}
                  accessibilityLabel={isFriend ? 'Friends' : 'Add friend'}
                >
                  <Text
                    style={[
                      styles.friendBtnText,
                      isFriend && styles.friendBtnTextOn,
                    ]}
                  >
                    {isFriend ? 'Friends' : 'Add friend'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.airMailBtn, styles.actionBtn]}
                  onPress={() => {
                    if (!user) return;
                    onAirMail?.(user.id);
                    onClose();
                  }}
                  accessibilityLabel="AirMail"
                >
                  <Ionicons
                    name="paper-plane-outline"
                    size={16}
                    color={colors.black}
                  />
                  <Text style={styles.airMailBtnText}>AirMail</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {albums.length > 0 ? (
            <View style={styles.albumsSection}>
              <Text style={styles.albumsTitle}>Albums</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.albumsRail}
              >
                {albums.map((al) => (
                  <AlbumPreviewCard
                    key={al.tripId}
                    album={al}
                    profiles={profiles}
                    width={ALBUM_CARD_WIDTH}
                    tilt
                    onPress={() => onOpenAlbum?.(al.tripId)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.tabs}>
            <Pressable style={styles.tab} onPress={() => goTab('posts')}>
              <Ionicons
                name="grid-outline"
                size={24}
                color={tab === 'posts' ? colors.black : colors.textMuted}
              />
              {tab === 'posts' && <View style={styles.tabUnderline} />}
            </Pressable>
            <Pressable style={styles.tab} onPress={() => goTab('passport')}>
              <Ionicons
                name="globe-outline"
                size={24}
                color={tab === 'passport' ? colors.black : colors.textMuted}
              />
              {tab === 'passport' && <View style={styles.tabUnderline} />}
            </Pressable>
          </View>
    </>
  );

  return (
    <GestureDetector gesture={edgeBack}>
    <View style={[styles.overlay, { bottom: overlayBottom ?? navClearance }]}>
      <View style={styles.screen}>
        <AbroadsterTopBar
          left={
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Back">
              <Ionicons
                name="chevron-back"
                size={28}
                color={ABROADSTER_HEADER_ICON}
              />
            </Pressable>
          }
          right={
            isSelf ? (
              <Pressable
                onPress={() => setSettingsOpen(true)}
                hitSlop={16}
                style={styles.menuHit}
                accessibilityRole="button"
                accessibilityLabel="Settings"
              >
                <Ionicons
                  name="settings-outline"
                  size={24}
                  color={ABROADSTER_HEADER_ICON}
                />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setMenuOpen(true)}
                hitSlop={16}
                style={styles.menuHit}
                accessibilityRole="button"
                accessibilityLabel="Profile options"
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={26}
                  color={ABROADSTER_HEADER_ICON}
                />
              </Pressable>
            )
          }
        />

        <FlatList
          data={tab === 'posts' ? posts : []}
          key={tab}
          keyExtractor={(post) => post.id}
          numColumns={tab === 'posts' ? GRID_COLS : 1}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - gridWidth) > 1) setGridWidth(w);
          }}
          columnWrapperStyle={
            tab === 'posts' ? styles.gridRow : undefined
          }
          ListEmptyComponent={
            tab === 'posts' ? (
              loadingProfile && posts.length === 0 ? (
                <View style={styles.postsLoading}>
                  <ActivityIndicator color={colors.brandTeal} />
                  <Text style={styles.emptyPosts}>Loading posts…</Text>
                </View>
              ) : (
                <Text style={styles.emptyPosts}>No posts yet</Text>
              )
            ) : (
              <PassportPanel
                userId={user.id}
                width={PHONE_WIDTH}
                onOpenTrip={(tripId) => onOpenAlbum?.(tripId)}
              />
            )
          }
          ListFooterComponent={<View style={{ height: 24 }} />}
          renderItem={({ item: post, index }) => {
            const thumb =
              post.photoUrls?.[0] != null
                ? feedImageSource(post.photoUrls[0])
                : null;
            const isCollage =
              post.displayMode === 'collage' &&
              Boolean(post.collageLayoutId);
            return (
              <Pressable
                onPress={() => setViewerIndex(index)}
                style={[
                  styles.gridCell,
                  { width: cellW, height: cellW },
                ]}
              >
                {isCollage && post.collageLayoutId ? (
                  <View
                    pointerEvents="none"
                    style={styles.gridCollageWrap}
                  >
                    <CollageCanvas
                      layoutId={post.collageLayoutId}
                      photos={post.photoUrls ?? []}
                      crops={post.photoCrops}
                      width={cellW}
                      height={cellW}
                      showPlaceholders={false}
                      showSlotNumbers={false}
                    />
                  </View>
                ) : thumb ? (
                  <Image source={thumb} style={styles.gridImg} />
                ) : (
                  <View
                    style={[styles.gridImg, styles.gridPlaceholder]}
                  />
                )}
                {!isCollage && (post.photoUrls?.length ?? 0) > 1 ? (
                  <View style={styles.gridBadge}>
                    <Ionicons
                      name="copy-outline"
                      size={12}
                      color={colors.white}
                    />
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>

      {viewerIndex != null ? (
        <ProfilePostsViewer
          posts={posts}
          initialIndex={viewerIndex}
          authorName={user.fullName}
          profiles={profiles}
          meId={meId}
          onClose={() => setViewerIndex(null)}
          onOpenProfile={onOpenProfile}
          onOpenLocation={onOpenLocation}
          onOpenTaggedTrip={onOpenTaggedTrip}
          onEditPost={onEditPost}
          onPostsChange={(next) => {
            setPosts(next);
            if (user) {
              const cached = getCachedProfile(user.id);
              if (cached) {
                setCachedProfile(user.id, {
                  ...cached,
                  posts: next,
                  fetchedAt: Date.now(),
                });
              }
            }
          }}
        />
      ) : null}

      <ProfileMenuSheet
        visible={menuOpen}
        title={user.fullName}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />

      <ReportUserSheet
        visible={reportOpen}
        userId={user.id}
        userName={user.firstName || user.fullName}
        onClose={() => setReportOpen(false)}
      />

      {editOpen ? (
        <EditProfileScreen
          key={`edit-${editPanel}-${user.id}`}
          initialPanel={editPanel}
          profile={
            chatProfile ?? {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              fullName: user.fullName,
              avatar: user.avatar,
              homeUniversity: user.homeUniversity,
              studyAbroadProgram: user.studyAbroadProgram,
              homeAccent: '#9D9D9D',
              abroadAccent: '#9B51E0',
              bio: user.bio,
              semester: user.semester,
              hostCity: user.hostCity,
              hostCountry: user.hostCountry,
              isVerifiedStudent: user.isVerifiedStudent,
            }
          }
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setChatProfile(updated);
            onProfileUpdated?.(updated);
            void load(updated.id);
            // EditProfileScreen closes itself after showing "Profile saved."
          }}
        />
      ) : null}

      {settingsOpen && chatProfile ? (
        <SettingsScreen
          profile={chatProfile}
          onClose={() => setSettingsOpen(false)}
          onEditProfile={() => {
            setSettingsOpen(false);
            setEditPanel('profile');
            setEditOpen(true);
          }}
          onChangePassword={() => {
            setSettingsOpen(false);
            setEditPanel('password');
            setEditOpen(true);
          }}
          onOpenLegal={(kind) => {
            setLegalDoc(kind);
          }}
          onLoggedOut={() => {
            setSettingsOpen(false);
            onClose();
          }}
          onAccountDeleted={() => {
            setSettingsOpen(false);
            onClose();
          }}
          onProfileUpdated={(updated) => {
            setChatProfile(updated);
            onProfileUpdated?.(updated);
          }}
        />
      ) : null}

      {user ? (
        <FriendsListSheet
          visible={friendsOpen}
          userId={user.id}
          title={`${user.firstName}'s friends`}
          onClose={() => setFriendsOpen(false)}
          onSelectUser={(p) => {
            onOpenProfile?.(p);
          }}
        />
      ) : null}

      <LegalDocumentModal
        visible={legalDoc != null}
        kind={legalDoc ?? 'privacy'}
        onClose={() => setLegalDoc(null)}
      />
    </View>
    </GestureDetector>
  );
}

function SchoolPill({
  label,
  accent,
  logo,
  onPress,
}: {
  label: string;
  accent: string;
  logo?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, { borderColor: accent, shadowColor: accent }]}
    >
      {logo ? (
        <Image source={toImageSource(logo)} style={styles.pillLogo} />
      ) : (
        <View style={[styles.pillDot, { backgroundColor: accent }]} />
      )}
      <Text style={styles.pillLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Stat({
  value,
  label,
  onPress,
}: {
  value: string;
  label: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        style={styles.stat}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${value} ${label}`}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={styles.stat}>{body}</View>;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 80,
    backgroundColor: colors.white,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 20,
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  stats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
    maxWidth: 96,
  },
  statValue: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    textAlign: 'center',
  },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  bioBlock: {
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  fullName: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  menuHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editProfileBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.brandMint,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.28)',
  },
  editProfileBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.openJoin,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: colors.brandMint,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.25)',
  },
  verifiedText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.openJoin,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 40,
    borderWidth: 1.5,
    backgroundColor: colors.white,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    maxWidth: '100%',
  },
  pillDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  pillLogo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F2F2F2',
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C8C8C8',
    backgroundColor: '#F3F3F3',
  },
  scorePillActive: {
    backgroundColor: '#E8E8E8',
    borderColor: '#B0B0B0',
  },
  scoreValue: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#5C5C5C',
  },
  scorePop: {
    marginTop: 4,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  scorePopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  scorePopTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.black,
  },
  scorePopBody: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.black,
  },
  pillLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.black,
    maxWidth: 160,
  },
  bio: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  friendBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.brandTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
  },
  airMailBtn: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#E8EEED',
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  airMailBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.black,
  },
  friendBtnOn: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.divider,
  },
  friendBtnBusy: {
    opacity: 0.6,
  },
  friendBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.white,
  },
  friendBtnTextOn: {
    color: colors.black,
  },
  albumsSection: {
    marginTop: 16,
    paddingBottom: 4,
  },
  albumsTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.openJoin,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  albumsRail: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 10,
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 0,
    paddingBottom: 8,
  },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DBDBDB',
    marginTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.black,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridRow: {
    gap: GRID_GAP,
  },
  gridCell: {
    position: 'relative',
    backgroundColor: '#EEE',
  },
  gridImg: {
    width: '100%',
    height: '100%',
  },
  gridCollageWrap: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  gridPlaceholder: {
    backgroundColor: '#E8E8E8',
  },
  gridBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    padding: 3,
  },
  emptyPosts: {
    width: '100%',
    textAlign: 'center',
    paddingVertical: 40,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  postsLoading: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  passport: {
    padding: 24,
    alignItems: 'center',
  },
  passportTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    marginBottom: 8,
  },
  passportSub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
