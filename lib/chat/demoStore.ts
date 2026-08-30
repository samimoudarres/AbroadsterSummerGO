import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ChannelSlug,
  ChatChannel,
  ChatCommunity,
  ChatMessage,
  ChatNotification,
  ChatProfile,
  ChatTarget,
  ChatTrip,
  CreatePostInput,
  CreateTripInput,
  DmThread,
  FeedAlbumCard,
  FeedPost,
  PassportCityRank,
  PassportData,
  PollData,
  TripAlbum,
  AlbumPhoto,
  TripChannel,
  TripInvite,
} from '../../data/chatTypes';
import { shortWeekdayRange, toLocalISODate, tripChatTitle, weekendContaining } from '../trips/dates';
import { FEED_PHOTOS, usablePostPhotos } from '../feed/feedPhotos';
import { scoreHomeFeedPost } from '../feed/homeFeedRank';
import { ALBUM_PLACEHOLDER_PHOTOS } from '../trips/albumPlaceholders';
import { lookupTripCoords } from '../tripCoords';
import {
  addManualCity,
  applyTripPassportUnlock,
  ensureHostCity,
  passportForUser,
  refreshProfilePassportCounts,
  type StoredCity,
  type StoredUnlock,
} from '../passport/demoPassport';
import { resolveSchoolVisual, getProgramByName } from '../schools/catalog';
import {
  computeExplorerScoreMiles,
} from '../explorerScore';

const STORAGE_KEY = 'abroadster.chat.demo.v11';

/** Demo identity matches Figma school pills: NYU in London + UT Austin */
export const DEMO_ME_ID = 'user-me';

const DEMO_PROFILES_RAW = [
  {
    id: DEMO_ME_ID,
    firstName: 'Sam',
    lastName: 'Rivera',
    fullName: 'Sam Rivera',
    avatar: require('../../assets/avatars/marcos.png'),
    homeUniversity: 'UT Austin',
    studyAbroadProgram: 'NYU in London',
    homeAccent: '#BF5700',
    abroadAccent: '#9B51E0',
  },
  {
    id: 'user-marcos',
    firstName: 'Marcos',
    lastName: 'Biles',
    fullName: 'Marcos Biles',
    avatar: require('../../assets/avatars/marcos.png'),
    homeUniversity: 'Indiana University',
    studyAbroadProgram: 'NYU in London',
    homeAccent: '#990000',
    abroadAccent: '#9B51E0',
  },
  {
    id: 'user-emily-lloyd',
    firstName: 'Emily',
    lastName: 'Lloyd',
    fullName: 'Emily Lloyd',
    avatar: require('../../assets/avatars/emily.png'),
    homeUniversity: 'UT Austin',
    studyAbroadProgram: 'NYU in London',
    homeAccent: '#BF5700',
    abroadAccent: '#9B51E0',
  },
  {
    id: 'user-chelsea',
    firstName: 'Chelsea',
    lastName: 'Nguyen',
    fullName: 'Chelsea Nguyen',
    avatar: require('../../assets/avatars/chelsea.png'),
    homeUniversity: 'UCLA',
    studyAbroadProgram: 'NYU in London',
    homeAccent: '#2774AE',
    abroadAccent: '#9B51E0',
  },
  {
    id: 'user-jack',
    firstName: 'Jack',
    lastName: 'King',
    fullName: 'Jack King',
    avatar: require('../../assets/avatars/jack.png'),
    homeUniversity: 'Syracuse University',
    studyAbroadProgram: 'NYU in London',
    homeAccent: '#F76900',
    abroadAccent: '#9B51E0',
  },
  {
    id: 'user-luke',
    firstName: 'Luke',
    lastName: 'Hayes',
    fullName: 'Luke Hayes',
    avatar: require('../../assets/avatars/luke.png'),
    homeUniversity: 'UT Austin',
    studyAbroadProgram: 'NYU in London',
    homeAccent: '#BF5700',
    abroadAccent: '#9B51E0',
  },
  {
    id: 'user-emily',
    firstName: 'Emily',
    lastName: 'Ross',
    fullName: 'Emily Ross',
    avatar: require('../../assets/avatars/emily.png'),
    homeUniversity: 'Boston University',
    studyAbroadProgram: 'NYU in London',
    homeAccent: '#CC0000',
    abroadAccent: '#9B51E0',
  },
  {
    id: 'user-sebastian',
    firstName: 'Sebastian',
    lastName: 'Cole',
    fullName: 'Sebastian Cole',
    avatar: require('../../assets/avatars/sebastian.png'),
    homeUniversity: 'NYU',
    studyAbroadProgram: 'NYU in London',
    homeAccent: '#57068C',
    abroadAccent: '#9B51E0',
  },
  {
    id: 'user-mia',
    firstName: 'Mia',
    lastName: 'Park',
    fullName: 'Mia Park',
    avatar: require('../../assets/avatars/emily.png'),
    homeUniversity: 'University of Michigan',
    studyAbroadProgram: 'NYU in London',
    homeAccent: '#00274C',
    abroadAccent: '#9B51E0',
  },
  {
    id: 'user-emily-boyce',
    firstName: 'Emily',
    lastName: 'Boyce',
    fullName: 'Emily Boyce',
    avatar: require('../../assets/avatars/matilda.png'),
    homeUniversity: 'UT Austin',
    studyAbroadProgram: 'NYU in London',
    homeAccent: '#BF5700',
    abroadAccent: '#9B51E0',
  },
] as const satisfies ReadonlyArray<
  Omit<
    ChatProfile,
    | 'bio'
    | 'semester'
    | 'hostCity'
    | 'hostCountry'
    | 'citiesVisited'
    | 'countriesVisited'
    | 'explorerScoreMiles'
  >
>;

const DEMO_PROFILES: ChatProfile[] = DEMO_PROFILES_RAW.map((p) => ({
  ...p,
  semester: 'Fall 2026',
  hostCity: 'London',
  hostCountry: 'United Kingdom',
  citiesVisited: 5,
  countriesVisited: 3,
  explorerScoreMiles: 0,
  bio:
    p.id === DEMO_ME_ID
      ? 'UT Austin → NYU London. Always down for a weekend trip.'
      : `${p.homeUniversity} → ${p.studyAbroadProgram}. Exploring Europe one weekend at a time.`,
}));

/** Recompute explorer scores after onboarding / school edits. */
export function refreshExplorerScoresNow(): void {
  if (!memory) return;
  refreshExplorerScores(memory.profiles, memory.trips);
  emit();
}

function refreshExplorerScores(
  profiles: ChatProfile[],
  trips: ChatTrip[],
): void {
  for (const p of profiles) {
    const mine = trips.filter((t) => t.memberIds.includes(p.id));
    p.explorerScoreMiles = computeExplorerScoreMiles({
      homeUniversity: p.homeUniversity,
      studyAbroadProgram: p.studyAbroadProgram,
      hostCity: p.hostCity,
      hostCountry: p.hostCountry,
      trips: mine.map((t) => ({
        status: t.status,
        destinationCity: t.destinationCity,
        destinationCountry: t.destinationCountry,
        latitude: t.latitude,
        longitude: t.longitude,
      })),
    });
  }
}

type DemoJoinRequest = {
  id: string;
  tripId: string;
  requesterId: string;
  status: 'pending' | 'accepted' | 'declined';
};

type DemoState = {
  profiles: ChatProfile[];
  communities: ChatCommunity[];
  channels: ChatChannel[];
  memberIdsByCommunity: Record<string, string[]>;
  messages: ChatMessage[];
  trips: ChatTrip[];
  albums: TripAlbum[];
  tripInvites: TripInvite[];
  tripJoinRequests: DemoJoinRequest[];
  friendships: Record<string, string[]>;
  /** Users the current user has blocked */
  blockedUserIds: string[];
  /** User ids whose trip activity should notify me */
  tripNotifyUserIds: string[];
  /** Channel ids muted by the current demo user */
  mutedChannelIds: string[];
  notifications: ChatNotification[];
  dmThreads: DmThread[];
  polls: PollData[];
  posts: FeedPost[];
  /** postId -> userIds who stamped */
  postStamps: Record<string, string[]>;
  passportUnlocks: StoredUnlock[];
  passportCities: StoredCity[];
  /** Persisted notification + onboarding prefs (demo / hybrid mirror) */
  userSettings: {
    notificationPrefs: Record<string, boolean>;
    onboarding: Record<string, boolean>;
    updatedAt: string;
  };
  initialized: boolean;
};

function id(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildSeed(): DemoState {
  const abroadId = 'comm-nyu-london';
  const homeId = 'comm-ut-austin';
  const slugs: Exclude<ChannelSlug, 'trip'>[] = [
    'general',
    'introductions',
    'trips',
    'roommates',
  ];

  const makeChannels = (communityId: string, prefix: string): ChatChannel[] =>
    slugs.map((slug) => ({
      id: `${prefix}-${slug}`,
      communityId,
      slug,
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
    }));

  const abroadChannels = makeChannels(abroadId, 'ch-nyu');
  const homeChannels = makeChannels(homeId, 'ch-uta');
  const channels = [...abroadChannels, ...homeChannels];

  const channelIds = (list: ChatChannel[]) =>
    Object.fromEntries(list.map((c) => [c.slug, c.id])) as Record<
      Exclude<ChannelSlug, 'trip'>,
      string
    >;

  const communities: ChatCommunity[] = [
    {
      id: abroadId,
      name: 'NYU in London',
      kind: 'abroad',
      accent: resolveSchoolVisual({ name: 'NYU in London' }).accent,
      channelIds: channelIds(abroadChannels),
    },
    {
      id: homeId,
      name: 'UT Austin',
      kind: 'home',
      accent: resolveSchoolVisual({ name: 'University of Texas at Austin' })
        .accent,
      channelIds: channelIds(homeChannels),
    },
  ];

  const nyuMembers = DEMO_PROFILES.filter(
    (p) => p.studyAbroadProgram === 'NYU in London',
  ).map((p) => p.id);
  const utaMembers = DEMO_PROFILES.filter(
    (p) => p.homeUniversity === 'UT Austin' || p.id === DEMO_ME_ID,
  ).map((p) => p.id);

  const tripId = 'trip-chelsea-paris';
  const thisFri = weekendContaining().start;
  const iso = (d: Date) => toLocalISODate(d);
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const nextFri = addDays(thisFri, 7);
  const fri2 = addDays(thisFri, 14);
  const fri3 = addDays(thisFri, 21);

  /** Real feed assets so album grids aren’t empty/gray after reload. */
  const SEED_ALBUM_PHOTOS: Array<string | number> = [
    FEED_PHOTOS[0],
    FEED_PHOTOS[1],
    FEED_PHOTOS[2],
    FEED_PHOTOS[3],
    FEED_PHOTOS[1],
    FEED_PHOTOS[0],
    ALBUM_PLACEHOLDER_PHOTOS[0],
    FEED_PHOTOS[2],
    ALBUM_PLACEHOLDER_PHOTOS[1],
  ];
  const PLACEHOLDER_ALBUM = SEED_ALBUM_PHOTOS.slice(0, 3);

  const trips: ChatTrip[] = [
    {
      id: 'trip-jack-paris',
      ownerId: 'user-jack',
      status: 'upcoming',
      openToJoin: false,
      destinationCity: 'Paris',
      destinationCountry: 'France',
      dateLabel: 'Friday - Sunday',
      dateStart: iso(thisFri),
      dateEnd: iso(addDays(thisFri, 2)),
      memberIds: ['user-jack', 'user-luke', 'user-marcos', DEMO_ME_ID],
      myJoinStatus: null,
      albumId: 'album-jack-paris',
      isFollowingAlbum: false,
      albumPreviewUrls: PLACEHOLDER_ALBUM as unknown as string[],
      latitude: 48.8566,
      longitude: 2.3522,
    },
    {
      id: 'trip-julia-budapest',
      ownerId: 'user-mia',
      status: 'upcoming',
      openToJoin: false,
      destinationCity: 'Budapest',
      destinationCountry: 'Hungary',
      dateLabel: 'Friday - Sunday',
      dateStart: iso(thisFri),
      dateEnd: iso(addDays(thisFri, 2)),
      memberIds: ['user-mia', 'user-emily', DEMO_ME_ID],
      myJoinStatus: null,
      albumId: 'album-julia-budapest',
      isFollowingAlbum: false,
      albumPreviewUrls: PLACEHOLDER_ALBUM as unknown as string[],
      latitude: 47.4979,
      longitude: 19.0402,
    },
    {
      id: tripId,
      ownerId: 'user-chelsea',
      status: 'planning',
      openToJoin: true,
      destinationCity: 'Paris',
      destinationCountry: 'France',
      dateLabel: 'Thursday - Sunday',
      dateStart: iso(addDays(nextFri, -1)),
      dateEnd: iso(addDays(nextFri, 2)),
      leavingTime: '2:30 PM',
      memberIds: ['user-chelsea', 'user-emily', 'user-sebastian'],
      myJoinStatus: null,
      latitude: 48.8535,
      longitude: 2.332,
    },
    {
      id: 'trip-james-paris',
      ownerId: 'user-emily-lloyd',
      status: 'planning',
      openToJoin: true,
      destinationCity: 'Paris',
      destinationCountry: 'France',
      dateLabel: 'Friday - Sunday',
      dateStart: iso(nextFri),
      dateEnd: iso(addDays(nextFri, 2)),
      memberIds: ['user-emily-lloyd'],
      myJoinStatus: null,
      pendingInviteeIds: [DEMO_ME_ID],
      latitude: 48.86,
      longitude: 2.34,
    },
    {
      id: 'trip-me-florence',
      ownerId: DEMO_ME_ID,
      status: 'planning',
      openToJoin: true,
      destinationCity: 'Florence',
      destinationCountry: 'Italy',
      dateLabel: 'Friday - Sunday',
      dateStart: iso(nextFri),
      dateEnd: iso(addDays(nextFri, 2)),
      memberIds: [DEMO_ME_ID],
      myJoinStatus: null,
      latitude: 43.7696,
      longitude: 11.2558,
    },
    {
      id: 'trip-adam-paris',
      ownerId: 'user-marcos',
      status: 'planning',
      openToJoin: true,
      destinationCity: 'Paris',
      destinationCountry: 'France',
      dateLabel: 'Friday - Sunday',
      dateStart: iso(nextFri),
      dateEnd: iso(addDays(nextFri, 2)),
      memberIds: ['user-marcos', 'user-jack', 'user-luke'],
      myJoinStatus: null,
      latitude: 48.858,
      longitude: 2.345,
    },
    {
      id: 'trip-rome-later',
      ownerId: 'user-chelsea',
      status: 'upcoming',
      openToJoin: false,
      destinationCity: 'Rome',
      destinationCountry: 'Italy',
      dateLabel: 'Friday - Sunday',
      dateStart: iso(fri2),
      dateEnd: iso(addDays(fri2, 2)),
      memberIds: ['user-chelsea', 'user-jack'],
      myJoinStatus: null,
      albumId: 'album-rome-later',
      isFollowingAlbum: false,
      albumPreviewUrls: PLACEHOLDER_ALBUM as unknown as string[],
      latitude: 41.9028,
      longitude: 12.4964,
    },
    {
      id: 'trip-barcelona-later',
      ownerId: 'user-luke',
      status: 'planning',
      openToJoin: true,
      destinationCity: 'Barcelona',
      destinationCountry: 'Spain',
      dateLabel: 'Friday - Monday',
      dateStart: iso(fri3),
      dateEnd: iso(addDays(fri3, 3)),
      memberIds: ['user-luke', 'user-sebastian'],
      myJoinStatus: null,
      latitude: 41.3874,
      longitude: 2.1686,
    },
  ];

  const hoursAgoIso = (h: number) =>
    new Date(Date.now() - h * 3600_000).toISOString();

  const makeAlbumPhotos = (
    albumId: string,
    tripId: string,
    uploaderId: string,
    urls: Array<string | number>,
  ): AlbumPhoto[] =>
    urls.map((imageUrl, i) => ({
      id: `${albumId}-ph-${i}`,
      albumId,
      tripId,
      uploaderId,
      imageUrl,
      createdAt: hoursAgoIso(i * 5 + 2),
    }));

  const albums: TripAlbum[] = [
    {
      id: 'album-jack-paris',
      tripId: 'trip-jack-paris',
      photoUrls: [...SEED_ALBUM_PHOTOS],
      photos: makeAlbumPhotos(
        'album-jack-paris',
        'trip-jack-paris',
        'user-jack',
        SEED_ALBUM_PHOTOS,
      ),
      followerIds: [],
    },
    {
      id: 'album-julia-budapest',
      tripId: 'trip-julia-budapest',
      photoUrls: [
        FEED_PHOTOS[2],
        FEED_PHOTOS[3],
        FEED_PHOTOS[0],
        FEED_PHOTOS[1],
        ALBUM_PLACEHOLDER_PHOTOS[2],
        FEED_PHOTOS[2],
      ],
      photos: makeAlbumPhotos(
        'album-julia-budapest',
        'trip-julia-budapest',
        'user-mia',
        [
          FEED_PHOTOS[2],
          FEED_PHOTOS[3],
          FEED_PHOTOS[0],
          FEED_PHOTOS[1],
          ALBUM_PLACEHOLDER_PHOTOS[2],
          FEED_PHOTOS[2],
        ],
      ),
      followerIds: [],
    },
    {
      id: 'album-rome-later',
      tripId: 'trip-rome-later',
      photoUrls: [
        FEED_PHOTOS[1],
        FEED_PHOTOS[0],
        FEED_PHOTOS[3],
        ALBUM_PLACEHOLDER_PHOTOS[0],
        FEED_PHOTOS[2],
        FEED_PHOTOS[1],
        ALBUM_PLACEHOLDER_PHOTOS[1],
      ],
      photos: makeAlbumPhotos(
        'album-rome-later',
        'trip-rome-later',
        'user-chelsea',
        [
          FEED_PHOTOS[1],
          FEED_PHOTOS[0],
          FEED_PHOTOS[3],
          ALBUM_PLACEHOLDER_PHOTOS[0],
          FEED_PHOTOS[2],
          FEED_PHOTOS[1],
          ALBUM_PLACEHOLDER_PHOTOS[1],
        ],
      ),
      followerIds: [],
    },
  ];

  const general = abroadChannels.find((c) => c.slug === 'general')!.id;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(17, 3, 0, 0);
  const today = new Date();
  today.setHours(17, 3, 0, 0);

  const messages: ChatMessage[] = [
    {
      id: 'msg-sys-sam',
      channelId: general,
      senderId: DEMO_ME_ID,
      kind: 'system',
      body: 'Sam has joined this chat',
      createdAt: new Date(yesterday.getTime() - 3600000).toISOString(),
      reactions: [],
    },
    {
      id: 'msg-1',
      channelId: general,
      senderId: 'user-marcos',
      kind: 'text',
      body: 'Does anyone know any good spots downtown to get dinner?',
      createdAt: yesterday.toISOString(),
      reactions: [],
    },
    {
      id: 'msg-2',
      channelId: general,
      senderId: 'user-emily-lloyd',
      kind: 'text',
      body: 'Have you tried Il Forno?',
      createdAt: new Date(yesterday.getTime() + 600000).toISOString(),
      reactions: [],
    },
    {
      id: 'msg-3',
      channelId: general,
      senderId: 'user-chelsea',
      kind: 'trip',
      body: 'Chelsea is planning a trip',
      tripId,
      createdAt: today.toISOString(),
      reactions: [],
    },
    {
      id: 'msg-4',
      channelId: general,
      senderId: 'user-jack',
      kind: 'text',
      body: 'Paris lets goooo',
      createdAt: new Date(today.getTime() + 300000).toISOString(),
      reactions: [],
    },
    {
      id: 'msg-5',
      channelId: general,
      senderId: 'user-luke',
      kind: 'text',
      body: 'Join up',
      createdAt: new Date(today.getTime() + 420000).toISOString(),
      reactions: [],
    },
    {
      id: 'msg-6',
      channelId: general,
      senderId: DEMO_ME_ID,
      kind: 'text',
      body: "Luke's coming too!",
      createdAt: new Date(today.getTime() + 540000).toISOString(),
      reactions: [],
    },
    {
      id: 'msg-7',
      channelId: general,
      senderId: 'user-emily-boyce',
      kind: 'text',
      body: 'you guys NEED to eat here',
      imageUrl: undefined,
      createdAt: new Date(today.getTime() + 720000).toISOString(),
      reactions: [],
      metadata: { hasFoodImage: true },
    },
  ];

  const friendships: Record<string, string[]> = {
    [DEMO_ME_ID]: [
      'user-marcos',
      'user-chelsea',
      'user-jack',
      'user-luke',
      'user-emily',
      'user-sebastian',
      'user-mia',
      'user-emily-lloyd',
    ],
  };

  const hoursAgo = (h: number) =>
    new Date(Date.now() - h * 3600_000).toISOString();
  const photos = [...FEED_PHOTOS];
  const posts: FeedPost[] = [
    {
      id: 'post-me-london',
      authorId: DEMO_ME_ID,
      caption: 'First week in London — already planning weekends',
      locationLabel: 'London, UK',
      latitude: 51.5074,
      longitude: -0.1278,
      createdAt: hoursAgo(2),
      photoUrls: [photos[3], photos[0]],
      stampCount: 6,
      iStamped: false,
      stamperPreviewIds: ['user-luke', 'user-chelsea', 'user-jack'],
      displayMode: 'carousel',
      taggedTripId: 'trip-jack-paris',
      taggedUserIds: ['user-jack', 'user-luke', 'user-marcos'],
    },
    {
      id: 'post-me-collage',
      authorId: DEMO_ME_ID,
      caption: 'Bits from the semester so far',
      locationLabel: 'Paris, France',
      latitude: 48.8566,
      longitude: 2.3522,
      createdAt: hoursAgo(14),
      photoUrls: [photos[1], photos[2], photos[0]],
      stampCount: 9,
      iStamped: false,
      stamperPreviewIds: ['user-marcos', 'user-emily', 'user-luke'],
      displayMode: 'collage',
      collageLayoutId: 'tri_stack',
      taggedTripId: 'trip-jack-paris',
      taggedUserIds: ['user-jack', 'user-luke'],
    },
    {
      id: 'post-luke-santorini',
      authorId: 'user-luke',
      caption: 'Sunset walks hit different here',
      locationLabel: 'Santorini, Greece',
      latitude: 36.3932,
      longitude: 25.4615,
      createdAt: hoursAgo(5),
      photoUrls: [photos[0], photos[1], photos[2]],
      stampCount: 12,
      iStamped: false,
      stamperPreviewIds: ['user-chelsea', 'user-jack', 'user-marcos'],
      taggedTripId: 'trip-jack-paris',
      taggedUserIds: ['user-jack', 'user-chelsea'],
    },
    {
      id: 'post-chelsea-paris',
      authorId: 'user-chelsea',
      caption: 'Café mornings forever',
      locationLabel: 'Paris, France',
      latitude: 48.8566,
      longitude: 2.3522,
      createdAt: hoursAgo(8),
      photoUrls: [photos[1], photos[2], photos[3]],
      stampCount: 8,
      iStamped: true,
      stamperPreviewIds: [DEMO_ME_ID, 'user-luke', 'user-jack'],
      taggedTripId: 'trip-chelsea-paris',
      taggedUserIds: ['user-emily', 'user-sebastian'],
    },
    {
      id: 'post-jack-rome',
      authorId: 'user-jack',
      caption: 'Gelato run with the crew',
      locationLabel: 'Rome, Italy',
      latitude: 41.9028,
      longitude: 12.4964,
      createdAt: hoursAgo(14),
      photoUrls: [photos[2], photos[0], photos[1]],
      stampCount: 21,
      iStamped: false,
      stamperPreviewIds: ['user-luke', 'user-mia', 'user-chelsea'],
      taggedTripId: 'trip-rome-later',
      taggedUserIds: ['user-chelsea'],
    },
    {
      id: 'post-mia-barcelona',
      authorId: 'user-mia',
      caption: 'Beach day energy',
      locationLabel: 'Barcelona, Spain',
      latitude: 41.3874,
      longitude: 2.1686,
      createdAt: hoursAgo(20),
      photoUrls: [photos[3], photos[0]],
      stampCount: 5,
      iStamped: false,
      stamperPreviewIds: ['user-emily', 'user-luke'],
    },
    {
      id: 'post-marcos-lisbon',
      authorId: 'user-marcos',
      caption: 'Tram 28 views',
      locationLabel: 'Lisbon, Portugal',
      latitude: 38.7223,
      longitude: -9.1393,
      createdAt: hoursAgo(28),
      photoUrls: [photos[1], photos[0]],
      stampCount: 15,
      iStamped: false,
      stamperPreviewIds: ['user-chelsea', DEMO_ME_ID, 'user-emily'],
    },
    {
      id: 'post-emily-london',
      authorId: 'user-emily',
      caption: 'Museum hopping',
      locationLabel: 'London, UK',
      latitude: 51.5074,
      longitude: -0.1278,
      createdAt: hoursAgo(36),
      photoUrls: [photos[2], photos[1], photos[0]],
      stampCount: 9,
      iStamped: false,
      stamperPreviewIds: ['user-jack', 'user-mia', 'user-luke'],
    },
    {
      id: 'post-sebastian-amsterdam',
      authorId: 'user-sebastian',
      caption: 'Canal golden hour',
      locationLabel: 'Amsterdam, Netherlands',
      latitude: 52.3676,
      longitude: 4.9041,
      createdAt: hoursAgo(48),
      photoUrls: [photos[0], photos[3]],
      stampCount: 4,
      iStamped: false,
      stamperPreviewIds: ['user-chelsea', 'user-jack'],
    },
    {
      id: 'post-emily-lloyd-athens',
      authorId: 'user-emily-lloyd',
      caption: 'Acropolis at dusk',
      locationLabel: 'Athens, Greece',
      latitude: 37.9838,
      longitude: 23.7275,
      createdAt: hoursAgo(60),
      photoUrls: [photos[1], photos[2]],
      stampCount: 11,
      iStamped: false,
      stamperPreviewIds: ['user-luke', 'user-marcos', 'user-mia'],
    },
    {
      id: 'post-luke-sicily',
      authorId: 'user-luke',
      caption: 'Coastal drive with friends',
      locationLabel: 'Sicily, Italy',
      latitude: 37.5994,
      longitude: 14.0154,
      createdAt: hoursAgo(72),
      photoUrls: [photos[2], photos[0], photos[3]],
      stampCount: 18,
      iStamped: false,
      stamperPreviewIds: ['user-jack', 'user-chelsea', 'user-emily'],
    },
    {
      id: 'post-chelsea-nice',
      authorId: 'user-chelsea',
      caption: 'Blue water forever',
      locationLabel: 'Nice, France',
      latitude: 43.7102,
      longitude: 7.262,
      createdAt: hoursAgo(90),
      photoUrls: [photos[0], photos[1], photos[2]],
      stampCount: 7,
      iStamped: false,
      stamperPreviewIds: [DEMO_ME_ID, 'user-luke', 'user-jack'],
    },
  ];

  const postStamps: Record<string, string[]> = {
    'post-luke-santorini': ['user-chelsea', 'user-jack', 'user-marcos'],
    'post-chelsea-paris': [DEMO_ME_ID, 'user-luke', 'user-jack'],
    'post-jack-rome': ['user-luke', 'user-mia', 'user-chelsea'],
    'post-mia-barcelona': ['user-emily', 'user-luke'],
    'post-marcos-lisbon': ['user-chelsea', DEMO_ME_ID, 'user-emily'],
    'post-emily-london': ['user-jack', 'user-mia', 'user-luke'],
    'post-sebastian-amsterdam': ['user-chelsea', 'user-jack'],
    'post-emily-lloyd-athens': ['user-luke', 'user-marcos', 'user-mia'],
    'post-luke-sicily': ['user-jack', 'user-chelsea', 'user-emily'],
    'post-chelsea-nice': [DEMO_ME_ID, 'user-luke', 'user-jack'],
  };

  const notifications: ChatNotification[] = [
    {
      id: 'notif-stamp-1',
      userId: DEMO_ME_ID,
      kind: 'post_stamped',
      title: 'New stamp',
      body: 'Chelsea stamped a post from Nice, France',
      data: { postId: 'post-chelsea-nice', fromUserId: 'user-chelsea' },
      createdAt: hoursAgo(2),
      readAt: null,
    },
    {
      id: 'notif-stamp-2',
      userId: DEMO_ME_ID,
      kind: 'post_stamped',
      title: 'New stamp',
      body: 'Luke stamped your post',
      data: { postId: 'post-luke-santorini', fromUserId: 'user-luke' },
      createdAt: hoursAgo(4),
      readAt: null,
    },
    {
      id: 'notif-stamp-3',
      userId: DEMO_ME_ID,
      kind: 'post_stamped',
      title: 'New stamp',
      body: 'Jack stamped your post',
      data: { postId: 'post-jack-rome', fromUserId: 'user-jack' },
      createdAt: hoursAgo(9),
      readAt: hoursAgo(1),
    },
    {
      id: 'notif-stamp-4',
      userId: DEMO_ME_ID,
      kind: 'post_stamped',
      title: 'New stamp',
      body: 'Emily stamped your post',
      data: { postId: 'post-emily-london', fromUserId: 'user-emily' },
      createdAt: hoursAgo(20),
      readAt: hoursAgo(1),
    },
    {
      id: 'notif-invite-1',
      userId: DEMO_ME_ID,
      kind: 'trip_invite',
      title: 'Trip invite',
      body: 'Emily invited you to Paris',
      data: {
        tripId: 'trip-james-paris',
        inviteeId: DEMO_ME_ID,
        inviterId: 'user-emily-lloyd',
        inviteId: 'inv-seed-emily-paris',
      },
      createdAt: hoursAgo(6),
      readAt: null,
    },
    {
      id: 'notif-join-req-1',
      userId: DEMO_ME_ID,
      kind: 'trip_join_request',
      title: 'Trip join request',
      body: 'Luke requested to join your trip',
      data: {
        tripId: 'trip-me-florence',
        requesterId: 'user-luke',
        requestId: 'jr-seed-luke',
      },
      createdAt: hoursAgo(3),
      readAt: null,
    },
    {
      id: 'notif-friend-1',
      userId: DEMO_ME_ID,
      kind: 'friend_added',
      title: 'New friend',
      body: 'Mia added you as a friend',
      data: { fromUserId: 'user-mia' },
      createdAt: hoursAgo(12),
      readAt: null,
    },
    {
      id: 'notif-friend-2',
      userId: DEMO_ME_ID,
      kind: 'friend_added',
      title: 'New friend',
      body: 'Sebastian added you as a friend',
      data: { fromUserId: 'user-sebastian' },
      createdAt: hoursAgo(26),
      readAt: hoursAgo(5),
    },
    {
      id: 'notif-album-1',
      userId: DEMO_ME_ID,
      kind: 'album_followed',
      title: 'Album follow',
      body: 'Someone followed an album you’re on',
      data: { tripId: 'trip-jack-paris' },
      createdAt: hoursAgo(18),
      readAt: hoursAgo(10),
    },
    {
      id: 'notif-trip-1',
      userId: DEMO_ME_ID,
      kind: 'trip_created',
      title: 'New trip',
      body: 'Chelsea is planning a trip',
      data: { tripId: 'trip-jack-paris', ownerId: 'user-chelsea' },
      createdAt: hoursAgo(30),
      readAt: null,
    },
  ];

  const passportUnlocks: StoredUnlock[] = [];
  const passportCities: StoredCity[] = [];

  for (const p of DEMO_PROFILES) {
    ensureHostCity({
      unlocks: passportUnlocks,
      cities: passportCities,
      userId: p.id,
      hostCity: p.hostCity,
      hostCountry: p.hostCountry,
    });
  }

  for (const trip of trips) {
    if (trip.status !== 'upcoming') continue;
    for (const memberId of trip.memberIds) {
      applyTripPassportUnlock({
        unlocks: passportUnlocks,
        cities: passportCities,
        userId: memberId,
        tripId: trip.id,
        cityName: trip.destinationCity,
        countryName: trip.destinationCountry,
        latitude: trip.latitude,
        longitude: trip.longitude,
      });
    }
  }

  refreshProfilePassportCounts(DEMO_PROFILES, passportUnlocks, passportCities);
  refreshExplorerScores(DEMO_PROFILES, trips);

  return {
    profiles: DEMO_PROFILES,
    communities,
    channels,
    memberIdsByCommunity: {
      [abroadId]: nyuMembers,
      [homeId]: [...new Set(utaMembers)],
    },
    messages,
    trips,
    albums,
    tripInvites: [
      {
        id: 'inv-seed-emily-paris',
        tripId: 'trip-james-paris',
        inviterId: 'user-emily-lloyd',
        inviteeId: DEMO_ME_ID,
        status: 'pending',
        createdAt: hoursAgo(6),
      },
    ],
    tripJoinRequests: [
      {
        id: 'jr-seed-luke',
        tripId: 'trip-me-florence',
        requesterId: 'user-luke',
        status: 'pending',
      },
    ],
    friendships,
    blockedUserIds: [],
    tripNotifyUserIds: [],
    mutedChannelIds: [],
    notifications,
    dmThreads: [],
    polls: [],
    posts,
    postStamps,
    passportUnlocks,
    passportCities,
    userSettings: {
      notificationPrefs: {},
      onboarding: {},
      updatedAt: new Date().toISOString(),
    },
    initialized: true,
  };
}

let memory: DemoState | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Picker / cloud uploads only — not Metro bundled asset URIs. */
function isUserAlbumUpload(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (
    url.startsWith('file:') ||
    url.startsWith('content:') ||
    url.startsWith('blob:') ||
    url.startsWith('ph://') ||
    url.startsWith('assets-library:') ||
    url.startsWith('data:')
  ) {
    return true;
  }
  if (!/^https?:\/\//i.test(url)) return false;
  // Bundled assets resolve to localhost /assets/ — never treat as uploads
  if (/localhost|127\.0\.0\.1|\/assets\//i.test(url)) return false;
  return true;
}

async function persist() {
  if (!memory) return;
  try {
    const serializable = {
      ...memory,
      profiles: memory.profiles.map((p) => ({
        ...p,
        avatar: typeof p.avatar === 'number' ? `__asset__:${String(p.avatar)}` : p.avatar,
      })),
    };
    // Avatars as require() numbers don't survive JSON — keep memory as source of truth;
    // only persist messages / friendships / trips / dms / notifications / polls.
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        messages: memory.messages,
        trips: memory.trips,
        albums: memory.albums.map((a) => {
          const uploaded = (a.photos ?? []).filter(
            (p) => typeof p.imageUrl === 'string' && isUserAlbumUpload(p.imageUrl),
          );
          return {
            id: a.id,
            tripId: a.tripId,
            followerIds: a.followerIds,
            photoUrls: uploaded.map((p) => p.imageUrl),
            photos: uploaded,
          };
        }),
        tripInvites: memory.tripInvites,
        tripJoinRequests: memory.tripJoinRequests,
        channels: memory.channels.filter((c) => c.tripId),
        friendships: memory.friendships,
        blockedUserIds: memory.blockedUserIds,
        tripNotifyUserIds: memory.tripNotifyUserIds,
        mutedChannelIds: memory.mutedChannelIds,
        notifications: memory.notifications,
        dmThreads: memory.dmThreads,
        polls: memory.polls,
        posts: memory.posts.map((p) => ({
          ...p,
          // Don't persist require() numbers — restore from seed on reload if missing
          photoUrls: (p.photoUrls ?? []).filter((u) => typeof u === 'string'),
        })),
        postStamps: memory.postStamps,
        memberIdsByCommunity: memory.memberIdsByCommunity,
        passportUnlocks: memory.passportUnlocks,
        passportCities: memory.passportCities,
        userSettings: memory.userSettings,
      }),
    );
  } catch {
    // ignore
  }
}

export async function loadDemoState(): Promise<DemoState> {
  if (memory) return memory;
  const seed = buildSeed();
  try {
    const raw =
      (await AsyncStorage.getItem(STORAGE_KEY)) ??
      (await AsyncStorage.getItem('abroadster.chat.demo.v8')) ??
      (await AsyncStorage.getItem('abroadster.chat.demo.v7')) ??
      (await AsyncStorage.getItem('abroadster.chat.demo.v5')) ??
      (await AsyncStorage.getItem('abroadster.chat.demo.v4'));
    if (raw) {
      const saved = JSON.parse(raw);
      seed.messages = saved.messages ?? seed.messages;
      seed.trips = saved.trips ?? seed.trips;
      seed.tripInvites = saved.tripInvites ?? seed.tripInvites;
      seed.tripJoinRequests = Array.isArray(saved.tripJoinRequests)
        ? saved.tripJoinRequests
        : [];
      seed.friendships = saved.friendships ?? seed.friendships;
      seed.blockedUserIds = Array.isArray(saved.blockedUserIds)
        ? saved.blockedUserIds
        : [];
      seed.tripNotifyUserIds = Array.isArray(saved.tripNotifyUserIds)
        ? saved.tripNotifyUserIds
        : [];
      seed.mutedChannelIds = Array.isArray(saved.mutedChannelIds)
        ? saved.mutedChannelIds
        : [];
      seed.notifications = saved.notifications ?? seed.notifications;
      seed.dmThreads = saved.dmThreads ?? seed.dmThreads;
      seed.polls = saved.polls ?? seed.polls;
      if (Array.isArray(saved.passportUnlocks) && saved.passportUnlocks.length) {
        seed.passportUnlocks = saved.passportUnlocks;
      }
      if (Array.isArray(saved.passportCities) && saved.passportCities.length) {
        seed.passportCities = saved.passportCities;
      }
      if (saved.userSettings && typeof saved.userSettings === 'object') {
        seed.userSettings = {
          notificationPrefs:
            saved.userSettings.notificationPrefs &&
            typeof saved.userSettings.notificationPrefs === 'object'
              ? saved.userSettings.notificationPrefs
              : {},
          onboarding:
            saved.userSettings.onboarding &&
            typeof saved.userSettings.onboarding === 'object'
              ? saved.userSettings.onboarding
              : {},
          updatedAt:
            typeof saved.userSettings.updatedAt === 'string'
              ? saved.userSettings.updatedAt
              : new Date().toISOString(),
        };
      }
      if (Array.isArray(saved.albums) && saved.albums.length) {
        const seedById = Object.fromEntries(seed.albums.map((a) => [a.id, a]));
        const seedByTrip = Object.fromEntries(
          seed.albums.map((a) => [a.tripId, a]),
        );
        const merged: TripAlbum[] = (saved.albums as TripAlbum[]).map((a) => {
          const base = seedById[a.id] ?? seedByTrip[a.tripId];
          const uploaded = (a.photos ?? []).filter(
            (p) =>
              typeof p.imageUrl === 'string' && isUserAlbumUpload(p.imageUrl),
          );
          if (base) {
            return {
              ...base,
              followerIds: a.followerIds?.length
                ? a.followerIds
                : base.followerIds,
              photos: [...uploaded, ...(base.photos ?? [])],
              photoUrls: [
                ...uploaded.map((p) => p.imageUrl),
                ...(base.photoUrls ?? []),
              ],
            };
          }
          return {
            ...a,
            photos: uploaded,
            photoUrls: uploaded.map((p) => p.imageUrl),
          };
        });
        for (const sa of seed.albums) {
          if (!merged.some((a) => a.id === sa.id)) merged.push(sa);
        }
        seed.albums = merged;
      }
      if (Array.isArray(saved.posts) && saved.posts.length) {
        const seedById = Object.fromEntries(seed.posts.map((p) => [p.id, p]));
        seed.posts = saved.posts.map((p: FeedPost) => ({
          ...p,
          // require() module ids never survive JSON — always rehydrate from seed assets
          photoUrls:
            seedById[p.id]?.photoUrls ??
            (p.photoUrls?.length
              ? p.photoUrls
              : [...ALBUM_PLACEHOLDER_PHOTOS]),
          taggedTripId: seedById[p.id]
            ? (seedById[p.id].taggedTripId ?? null)
            : (p.taggedTripId ?? null),
          taggedUserIds: seedById[p.id]?.taggedUserIds?.length
            ? seedById[p.id].taggedUserIds
            : (p.taggedUserIds ?? []),
        }));
      }
      if (saved.postStamps && typeof saved.postStamps === 'object') {
        seed.postStamps = saved.postStamps;
      }
      seed.memberIdsByCommunity =
        saved.memberIdsByCommunity ?? seed.memberIdsByCommunity;
      if (Array.isArray(saved.channels) && saved.channels.length) {
        const tripChannels = (saved.channels as ChatChannel[]).filter((c) => c.tripId);
        const school = seed.channels.filter((c) => !c.tripId);
        seed.channels = [...school, ...tripChannels];
      }
    }
  } catch {
    // use seed
  }

  // Backfill lat/lng on legacy persisted trips so they appear on the map
  for (const t of seed.trips) {
    if (t.latitude != null && t.longitude != null) continue;
    const coords = lookupTripCoords(t.destinationCity, t.destinationCountry);
    if (!coords) continue;
    t.latitude = coords.latitude;
    t.longitude = coords.longitude;
  }

  // Ensure passport host cities + unlocks from locked-in trips
  if (!seed.passportUnlocks) seed.passportUnlocks = [];
  if (!seed.passportCities) seed.passportCities = [];
  for (const p of seed.profiles) {
    ensureHostCity({
      unlocks: seed.passportUnlocks,
      cities: seed.passportCities,
      userId: p.id,
      hostCity: p.hostCity,
      hostCountry: p.hostCountry,
    });
  }
  for (const trip of seed.trips) {
    if (trip.status !== 'upcoming') continue;
    for (const memberId of trip.memberIds) {
      applyTripPassportUnlock({
        unlocks: seed.passportUnlocks,
        cities: seed.passportCities,
        userId: memberId,
        tripId: trip.id,
        cityName: trip.destinationCity,
        countryName: trip.destinationCountry,
        latitude: trip.latitude,
        longitude: trip.longitude,
      });
    }
  }
  refreshProfilePassportCounts(
    seed.profiles,
    seed.passportUnlocks,
    seed.passportCities,
  );
  refreshExplorerScores(seed.profiles, seed.trips);

  // Resolve require() avatars → concrete URIs so list/AirMail/chat Images match map pins
  const { ensureImageUri } = await import('../images');
  seed.profiles = await Promise.all(
    seed.profiles.map(async (p) => ({
      ...p,
      avatar: await ensureImageUri(p.avatar as any),
    })),
  );
  refreshExplorerScores(seed.profiles, seed.trips);

  // Shared-post thumbs: always attach a concrete URI (module ids break on web / after reload)
  seed.messages = await Promise.all(
    seed.messages.map(async (m: ChatMessage) => {
      if (m.kind !== 'post' || !m.postId) return m;
      const post = seed.posts.find((p) => p.id === m.postId);
      const photos = usablePostPhotos(m.postId, post?.photoUrls);
      const first = photos[0];
      if (first == null) return m;
      try {
        const imageUrl = await ensureImageUri(first as any);
        return {
          ...m,
          imageUrl,
          metadata: {
            ...(m.metadata ?? {}),
            seedPostId: m.postId,
            // Drop stale Metro module ids from older shares
            photoAsset: undefined,
          },
        };
      } catch {
        return m;
      }
    }),
  );

  // Album grid photos: resolve require() → URIs (module ids break on web / after reload)
  seed.albums = await Promise.all(
    seed.albums.map(async (album) => {
      const photos = await Promise.all(
        (album.photos?.length
          ? album.photos
          : (album.photoUrls ?? []).map((imageUrl, i) => ({
              id: `${album.id}-legacy-${i}`,
              albumId: album.id,
              tripId: album.tripId,
              uploaderId:
                seed.trips.find((t) => t.id === album.tripId)?.ownerId ??
                DEMO_ME_ID,
              imageUrl,
              createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
            }))
        ).map(async (p) => ({
          ...p,
          imageUrl: await ensureImageUri(p.imageUrl as any),
        })),
      );
      return {
        ...album,
        photos,
        photoUrls: photos.map((p) => p.imageUrl),
      };
    }),
  );

  // Keep trip album previews in sync with resolved album photos
  for (const t of seed.trips) {
    const album = seed.albums.find((a) => a.tripId === t.id);
    if (!album?.photoUrls?.length) continue;
    t.albumPreviewUrls = album.photoUrls.slice(0, 3) as string[];
    t.albumId = album.id;
  }

  // Older hybrid builds stamped live UUID as senderId into demo threads — normalize to user-me
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  seed.messages = seed.messages.map((m: ChatMessage) =>
    m.senderId && uuidRe.test(m.senderId)
      ? { ...m, senderId: DEMO_ME_ID }
      : m,
  );

  memory = seed;

  // Re-apply create-account / edit-profile onto demo "me" if present
  try {
    const onboardRaw = await AsyncStorage.getItem(
      'abroadster.demo.meOnboarding.v1',
    );
    if (onboardRaw) {
      const o = JSON.parse(onboardRaw) as {
        firstName?: string;
        lastName?: string;
        avatarUri?: string | null;
        isVerifiedStudent?: boolean;
        studentEmail?: string | null;
        phoneNumber?: string | null;
        dateOfBirth?: string | null;
        bio?: string | null;
        homeUniversity?: string | null;
        studyAbroadProgram?: string | null;
        semester?: string | null;
        hostCity?: string | null;
        hostCountry?: string | null;
      };
      const me = memory.profiles.find((p) => p.id === DEMO_ME_ID);
      if (me && o.firstName) {
        me.firstName = o.firstName;
        me.lastName = o.lastName ?? '';
        me.fullName = `${o.firstName} ${o.lastName ?? ''}`.trim();
        if (o.avatarUri) me.avatar = o.avatarUri;
        me.isVerifiedStudent = Boolean(o.isVerifiedStudent);
        me.studentEmail = o.studentEmail ?? null;
        me.phoneNumber = o.phoneNumber ?? null;
        me.dateOfBirth = o.dateOfBirth ?? null;
        if (o.bio !== undefined) me.bio = o.bio;
        if (o.homeUniversity) me.homeUniversity = o.homeUniversity;
        if (o.studyAbroadProgram) me.studyAbroadProgram = o.studyAbroadProgram;
        if (o.semester !== undefined) me.semester = o.semester;
        if (o.hostCity !== undefined) me.hostCity = o.hostCity;
        if (o.hostCountry !== undefined) me.hostCountry = o.hostCountry;
        if (o.homeUniversity) {
          me.homeAccent = resolveSchoolVisual({
            name: o.homeUniversity,
          }).accent;
        }
        if (o.studyAbroadProgram) {
          me.abroadAccent = resolveSchoolVisual({
            name: o.studyAbroadProgram,
          }).accent;
        }
      }
    }
  } catch {
    // ignore
  }

  // Sync communities, host passport, and explorer score to current "me"
  try {
    syncDemoMeCommunitiesToProfile();
    ensureDemoMeHostPassport();
    refreshExplorerScores(memory.profiles, memory.trips);
  } catch {
    // ignore
  }

  // Persist normalized sender ids / keep avatar URIs only in memory
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        messages: memory.messages,
        trips: memory.trips,
        albums: memory.albums.map((a) => {
          const uploaded = (a.photos ?? []).filter(
            (p) => typeof p.imageUrl === 'string' && isUserAlbumUpload(p.imageUrl),
          );
          return {
            id: a.id,
            tripId: a.tripId,
            followerIds: a.followerIds,
            photoUrls: uploaded.map((p) => p.imageUrl),
            photos: uploaded,
          };
        }),
        tripInvites: memory.tripInvites,
        tripJoinRequests: memory.tripJoinRequests,
        channels: memory.channels.filter((c) => c.tripId),
        friendships: memory.friendships,
        blockedUserIds: memory.blockedUserIds,
        tripNotifyUserIds: memory.tripNotifyUserIds,
        mutedChannelIds: memory.mutedChannelIds,
        notifications: memory.notifications,
        dmThreads: memory.dmThreads,
        polls: memory.polls,
        posts: memory.posts.map((p) => ({
          ...p,
          photoUrls: (p.photoUrls ?? []).filter((u) => typeof u === 'string'),
        })),
        postStamps: memory.postStamps,
        memberIdsByCommunity: memory.memberIdsByCommunity,
        passportUnlocks: memory.passportUnlocks,
        passportCities: memory.passportCities,
        userSettings: memory.userSettings,
      }),
    );
  } catch {
    // ignore
  }
  return memory;
}

/** Apply create-account / edit-profile fields onto the demo "me" profile. */
export function patchDemoMeProfile(
  patch: Partial<ChatProfile> & {
    avatar?: string | number;
  },
): void {
  if (!memory) return;
  const me = memory.profiles.find((p) => p.id === DEMO_ME_ID);
  if (!me) return;
  if (patch.firstName != null) me.firstName = patch.firstName;
  if (patch.lastName != null) me.lastName = patch.lastName;
  if (patch.fullName != null) me.fullName = patch.fullName;
  if (patch.avatar != null) me.avatar = patch.avatar;
  if (patch.bio !== undefined) me.bio = patch.bio;
  if (patch.homeUniversity != null) me.homeUniversity = patch.homeUniversity;
  if (patch.studyAbroadProgram != null) {
    me.studyAbroadProgram = patch.studyAbroadProgram;
  }
  if (patch.semester !== undefined) me.semester = patch.semester;
  if (patch.hostCity !== undefined) me.hostCity = patch.hostCity;
  if (patch.hostCountry !== undefined) me.hostCountry = patch.hostCountry;
  if (patch.homeAccent != null) me.homeAccent = patch.homeAccent;
  if (patch.abroadAccent != null) me.abroadAccent = patch.abroadAccent;
  if (patch.isVerifiedStudent != null) me.isVerifiedStudent = patch.isVerifiedStudent;
  if (patch.studentEmail !== undefined) me.studentEmail = patch.studentEmail;
  if (patch.phoneNumber !== undefined) me.phoneNumber = patch.phoneNumber;
  if (patch.dateOfBirth !== undefined) me.dateOfBirth = patch.dateOfBirth;
  emit();
}

/** Unlock host country stamp + insert host city at top of rankings for demo me. */
export function ensureDemoMeHostPassport(): void {
  if (!memory) return;
  const me = memory.profiles.find((p) => p.id === DEMO_ME_ID);
  if (!me) return;

  // Backfill host location from abroad program when profile fields are empty
  if (!me.hostCity?.trim() || !me.hostCountry?.trim()) {
    const prog = getProgramByName(me.studyAbroadProgram || '');
    if (prog) {
      if (!me.hostCity?.trim() && prog.city) me.hostCity = prog.city;
      if (!me.hostCountry?.trim() && prog.country) me.hostCountry = prog.country;
    }
  }

  ensureHostCity({
    unlocks: memory.passportUnlocks,
    cities: memory.passportCities,
    userId: DEMO_ME_ID,
    hostCity: me.hostCity,
    hostCountry: me.hostCountry,
  });
  refreshProfilePassportCounts(
    memory.profiles,
    memory.passportUnlocks,
    memory.passportCities,
  );
  void persist();
  emit();
}

function ensureDemoSchoolCommunity(
  kind: 'home' | 'abroad',
  name: string,
): boolean {
  if (!memory || !name.trim()) return false;
  const trimmed = name.trim();
  const visual = resolveSchoolVisual({ name: trimmed });
  let community = memory.communities.find((c) => c.kind === kind);
  let dirty = false;

  if (!community) {
    const id = `comm-${kind}-${trimmed.toLowerCase().replace(/\s+/g, '-')}`;
    community = {
      id,
      name: trimmed,
      kind,
      accent: visual.accent,
      logoUri: visual.logoUrl || undefined,
      channelIds: {
        general: `${id}-general`,
        introductions: `${id}-introductions`,
        trips: `${id}-trips`,
        roommates: `${id}-roommates`,
      },
    };
    memory.communities.push(community);
    memory.channels.push(
      {
        id: community.channelIds.general!,
        communityId: id,
        slug: 'general',
        name: 'General',
      },
      {
        id: community.channelIds.introductions!,
        communityId: id,
        slug: 'introductions',
        name: 'Introductions',
      },
      {
        id: community.channelIds.trips!,
        communityId: id,
        slug: 'trips',
        name: 'Trips',
      },
      {
        id: community.channelIds.roommates!,
        communityId: id,
        slug: 'roommates',
        name: 'Roommates',
      },
    );
    dirty = true;
  } else {
    const nextLogo = visual.logoUrl || community.logoUri;
    if (
      community.name !== trimmed ||
      community.accent !== visual.accent ||
      community.logoUri !== nextLogo
    ) {
      community.name = trimmed;
      community.accent = visual.accent;
      if (visual.logoUrl) community.logoUri = visual.logoUrl;
      dirty = true;
    }
  }

  const members = memory.memberIdsByCommunity[community.id] ?? [];
  if (!members.includes(DEMO_ME_ID)) {
    memory.memberIdsByCommunity[community.id] = [...members, DEMO_ME_ID];
    dirty = true;
  }
  return dirty;
}

/** Keep chat community pills in sync with the signed-in user's schools. */
export function syncDemoMeCommunitiesToProfile(opts?: {
  /** When true, update memory without notifying subscribers (read-path safe). */
  silent?: boolean;
}): void {
  if (!memory) return;
  const me = memory.profiles.find((p) => p.id === DEMO_ME_ID);
  if (!me) return;

  let dirty = false;
  if (me.studyAbroadProgram?.trim()) {
    dirty = ensureDemoSchoolCommunity('abroad', me.studyAbroadProgram) || dirty;
  }
  if (me.homeUniversity?.trim()) {
    dirty = ensureDemoSchoolCommunity('home', me.homeUniversity) || dirty;
  }

  // Drop extra home/abroad pills that are not the user's schools
  const keepIds = new Set(
    memory.communities
      .filter((c) => c.kind === 'home' || c.kind === 'abroad')
      .filter((c) => {
        if (c.kind === 'abroad') {
          return (
            !me.studyAbroadProgram?.trim() ||
            c.name.trim().toLowerCase() ===
              me.studyAbroadProgram.trim().toLowerCase()
          );
        }
        return (
          !me.homeUniversity?.trim() ||
          c.name.trim().toLowerCase() === me.homeUniversity.trim().toLowerCase()
        );
      })
      .map((c) => c.id),
  );
  const before = memory.communities.length;
  memory.communities = memory.communities.filter((c) => {
    if (c.kind !== 'home' && c.kind !== 'abroad') return true;
    return keepIds.has(c.id);
  });
  if (memory.communities.length !== before) dirty = true;

  // Abroad first, then home — matches live pill order
  memory.communities.sort((a, b) => {
    if (a.kind === b.kind) return 0;
    if (a.kind === 'abroad') return -1;
    if (b.kind === 'abroad') return 1;
    return 0;
  });

  if (dirty) {
    void persist();
    if (!opts?.silent) emit();
  }
}

function state(): DemoState {
  if (!memory) throw new Error('Demo chat not loaded');
  return memory;
}

export function subscribeDemo(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function enrichTripAlbum(trip: ChatTrip): ChatTrip {
  const album = state().albums.find((a) => a.tripId === trip.id);
  if (!album) {
    return {
      ...trip,
      isFollowingAlbum: Boolean(trip.isFollowingAlbum),
      albumPreviewUrls: trip.albumPreviewUrls ?? [],
    };
  }
  const urls =
    album.photos?.length
      ? album.photos.map((p) => p.imageUrl)
      : album.photoUrls;
  return {
    ...trip,
    albumId: album.id,
    isFollowingAlbum: album.followerIds.includes(DEMO_ME_ID),
    albumPreviewUrls:
      urls.length > 0
        ? (urls.slice(0, 3) as string[])
        : trip.albumPreviewUrls ?? [],
  };
}

export const demoChat = {
  async getMe(): Promise<ChatProfile> {
    await loadDemoState();
    return state().profiles.find((p) => p.id === DEMO_ME_ID)!;
  },

  async getProfile(userId: string): Promise<ChatProfile | null> {
    await loadDemoState();
    return state().profiles.find((p) => p.id === userId) ?? null;
  },

  async listProfiles(): Promise<ChatProfile[]> {
    await loadDemoState();
    return state().profiles;
  },

  async getMyCommunities(): Promise<ChatCommunity[]> {
    await loadDemoState();
    // Silent: reading must not wake every subscribeChat listener
    syncDemoMeCommunitiesToProfile({ silent: true });
    return state().communities;
  },

  async getChannels(communityId: string): Promise<ChatChannel[]> {
    await loadDemoState();
    return state().channels.filter((c) => c.communityId === communityId);
  },

  async getCommunityMembers(communityId: string): Promise<ChatProfile[]> {
    await loadDemoState();
    const ids = state().memberIdsByCommunity[communityId] ?? [];
    return ids
      .map((id) => state().profiles.find((p) => p.id === id))
      .filter(Boolean) as ChatProfile[];
  },

  async getMessages(
    target: ChatTarget,
    opts?: { limit?: number; before?: string },
  ): Promise<ChatMessage[]> {
    await loadDemoState();
    let msgs = state().messages.filter((m) => {
      if (target.type === 'dm') return m.dmThreadId === target.threadId;
      return m.channelId === target.channelId;
    });
    msgs = msgs.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    if (opts?.before) {
      msgs = msgs.filter((m) => m.createdAt < opts.before!);
    }
    if (opts?.limit != null && opts.limit > 0) {
      msgs = msgs.slice(-opts.limit);
    }
    return msgs;
  },

  async sendMessage(input: {
    target: ChatTarget;
    kind: ChatMessage['kind'];
    body?: string;
    replyToId?: string;
    tripId?: string;
    pollId?: string;
    imageUrl?: string;
    postId?: string;
    metadata?: Record<string, unknown>;
    /** Override author (used when a live session authors into the demo store). */
    senderId?: string;
  }): Promise<ChatMessage> {
    await loadDemoState();
    const channelId =
      input.target.type === 'channel' || input.target.type === 'trip_channel'
        ? input.target.channelId
        : undefined;
    const msg: ChatMessage = {
      id: id('msg'),
      channelId,
      dmThreadId: input.target.type === 'dm' ? input.target.threadId : undefined,
      senderId: input.senderId ?? DEMO_ME_ID,
      kind: input.kind,
      body: input.body,
      replyToId: input.replyToId,
      tripId: input.tripId,
      pollId: input.pollId,
      imageUrl: input.imageUrl,
      postId: input.postId,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
      reactions: [],
    };
    state().messages.push(msg);
    if (input.target.type === 'dm') {
      const threadId = input.target.threadId;
      const t = state().dmThreads.find((d) => d.id === threadId);
      if (t) {
        t.updatedAt = msg.createdAt;
        t.lastPreview = input.body ?? input.kind;
        const senderId = msg.senderId;
        const otherId = t.otherUserId;
        if (otherId && otherId !== senderId && input.kind !== 'system') {
          const sender = state().profiles.find((p) => p.id === senderId);
          const preview =
            (input.body?.trim() || 'Sent a message').slice(0, 120) ||
            'Sent a message';
          state().notifications.push({
            id: id('notif'),
            userId: otherId,
            kind: 'dm_message',
            title: sender?.fullName ?? 'New message',
            body: preview,
            data: {
              fromUserId: senderId,
              threadId,
              messageId: msg.id,
            },
            createdAt: msg.createdAt,
            readAt: null,
          });
        }
      }
    } else if (
      (input.target.type === 'channel' || input.target.type === 'trip_channel') &&
      input.kind !== 'system' &&
      channelId
    ) {
      const ch = state().channels.find((c) => c.id === channelId);
      const community = ch
        ? state().communities.find((c) => c.id === ch.communityId)
        : null;
      if (
        community &&
        (community.kind === 'home' || community.kind === 'abroad') &&
        !ch?.tripId
      ) {
        const sender = state().profiles.find((p) => p.id === msg.senderId);
        const preview =
          (input.body?.trim() || 'Sent a message').slice(0, 120) ||
          'Sent a message';
        const members = state().memberIdsByCommunity[community.id] ?? [];
        const muted = new Set(state().mutedChannelIds ?? []);
        for (const uid of members) {
          if (uid === msg.senderId) continue;
          // Demo mute list is for the current user only
          if (uid === DEMO_ME_ID && muted.has(channelId)) continue;
          state().notifications.push({
            id: id('notif'),
            userId: uid,
            kind: 'channel_message',
            title: sender?.fullName ?? 'New message',
            body: preview,
            data: {
              fromUserId: msg.senderId,
              channelId,
              communityId: community.id,
              messageId: msg.id,
              communityName: community.name,
              channelSlug: ch?.slug,
            },
            createdAt: msg.createdAt,
            readAt: null,
          });
        }
      }
    }
    await persist();
    emit();
    return msg;
  },

  async toggleReaction(messageId: string, emoji: string): Promise<void> {
    await loadDemoState();
    const msg = state().messages.find((m) => m.id === messageId);
    if (!msg) return;
    let bucket = msg.reactions.find((r) => r.emoji === emoji);
    if (!bucket) {
      bucket = { emoji, userIds: [] };
      msg.reactions.push(bucket);
    }
    const idx = bucket.userIds.indexOf(DEMO_ME_ID);
    if (idx >= 0) bucket.userIds.splice(idx, 1);
    else bucket.userIds.push(DEMO_ME_ID);
    msg.reactions = msg.reactions.filter((r) => r.userIds.length > 0);
    await persist();
    emit();
  },

  async getTripsForMe(): Promise<ChatTrip[]> {
    await loadDemoState();
    return state().trips.filter(
      (t) => t.memberIds.includes(DEMO_ME_ID) || t.ownerId === DEMO_ME_ID,
    );
  },

  /** All trips (visibility / school filters applied in Trips UI). */
  async listTripsFeed(): Promise<ChatTrip[]> {
    await loadDemoState();
    return state().trips.map((t) => enrichTripAlbum(t));
  },

  async getFriendIds(): Promise<string[]> {
    await loadDemoState();
    return [...(state().friendships[DEMO_ME_ID] ?? [])];
  },

  async listFriendsForUser(userId: string): Promise<ChatProfile[]> {
    await loadDemoState();
    const ids = state().friendships[userId] ?? [];
    return ids
      .map((id) => state().profiles.find((p) => p.id === id))
      .filter(Boolean) as ChatProfile[];
  },

  async countFriendsForUser(userId: string): Promise<number> {
    await loadDemoState();
    return (state().friendships[userId] ?? []).length;
  },

  async getTrip(tripId: string): Promise<ChatTrip | null> {
    await loadDemoState();
    const t = state().trips.find((x) => x.id === tripId);
    if (!t) return null;
    const pendingInvites = state().tripInvites.filter(
      (i) => i.tripId === tripId && i.status === 'pending',
    );
    const pendingFromInvites = pendingInvites.map((i) => i.inviteeId);
    const myInvite = pendingInvites.find((i) => i.inviteeId === DEMO_ME_ID);
    const enriched = enrichTripAlbum(t);
    return {
      ...enriched,
      pendingInviteeIds: [
        ...new Set([...(enriched.pendingInviteeIds ?? []), ...pendingFromInvites]),
      ],
      myPendingInviteId: myInvite?.id ?? enriched.myPendingInviteId ?? null,
    };
  },

  async listPendingInviteeIds(tripId: string): Promise<string[]> {
    await loadDemoState();
    const fromTrip =
      state().trips.find((t) => t.id === tripId)?.pendingInviteeIds ?? [];
    const fromInvites = state()
      .tripInvites.filter((i) => i.tripId === tripId && i.status === 'pending')
      .map((i) => i.inviteeId);
    return [...new Set([...fromTrip, ...fromInvites])];
  },

  async followTripAlbum(tripId: string): Promise<void> {
    await loadDemoState();
    const trip = state().trips.find((t) => t.id === tripId);
    if (!trip) return;
    let album = state().albums.find((a) => a.tripId === tripId);
    if (!album) {
      album = {
        id: id('album'),
        tripId,
        photoUrls: trip.albumPreviewUrls ?? [],
        followerIds: [],
      };
      state().albums.push(album);
      trip.albumId = album.id;
    }
    if (!album) return;
    if (!album.followerIds.includes(DEMO_ME_ID)) {
      album.followerIds.push(DEMO_ME_ID);
    }
    trip.isFollowingAlbum = true;
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    const dest = `${trip.destinationCity}, ${trip.destinationCountry}`;
    for (const memberId of trip.memberIds) {
      if (memberId === DEMO_ME_ID) continue;
      state().notifications.push({
        id: id('notif'),
        userId: memberId,
        kind: 'album_followed',
        title: 'Album follow',
        body: `${me.fullName} followed your ${dest} album`,
        data: { tripId, albumId: album.id, followerId: DEMO_ME_ID },
        createdAt: new Date().toISOString(),
      });
    }
    await persist();
    emit();
  },

  async unfollowTripAlbum(tripId: string): Promise<void> {
    await loadDemoState();
    const trip = state().trips.find((t) => t.id === tripId);
    const album = state().albums.find((a) => a.tripId === tripId);
    if (album) {
      album.followerIds = album.followerIds.filter((id) => id !== DEMO_ME_ID);
    }
    if (trip) trip.isFollowingAlbum = false;
    await persist();
    emit();
  },

  async getNotifications(): Promise<ChatNotification[]> {
    await loadDemoState();
    return state()
      .notifications.filter((n) => n.userId === DEMO_ME_ID)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  },

  async getUnreadNotificationCount(): Promise<number> {
    await loadDemoState();
    return state().notifications.filter(
      (n) => n.userId === DEMO_ME_ID && !n.readAt,
    ).length;
  },

  async markNotificationsRead(ids?: string[]): Promise<void> {
    await loadDemoState();
    const now = new Date().toISOString();
    for (const n of state().notifications) {
      if (n.userId !== DEMO_ME_ID) continue;
      if (ids && ids.length && !ids.includes(n.id)) continue;
      if (!n.readAt) n.readAt = now;
    }
    await persist();
    emit();
  },

  async listHomeFeed(limit = 30, offset = 0): Promise<FeedPost[]> {
    await loadDemoState();
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    const friends = new Set(state().friendships[DEMO_ME_ID] ?? []);
    const blocked = new Set(state().blockedUserIds ?? []);
    const myCommunityIds = new Set(
      Object.entries(state().memberIdsByCommunity)
        .filter(([, ids]) => ids.includes(DEMO_ME_ID))
        .map(([cid]) => cid),
    );
    const scored = state().posts.map((p) => {
      if (blocked.has(p.authorId)) return null;
      const audience = p.audience ?? 'all';
      const iFollowAuthor = friends.has(p.authorId);
      const canSee =
        p.authorId === DEMO_ME_ID ||
        (iFollowAuthor && (audience === 'all' || audience === 'friends')) ||
        (audience === 'communities' &&
          (p.audienceCommunityIds ?? []).some((id) => myCommunityIds.has(id)));
      if (!canSee) return null;

      const author = state().profiles.find((x) => x.id === p.authorId);
      const stamps = state().postStamps[p.id] ?? [];
      const post: FeedPost = {
        ...p,
        stampCount: stamps.length,
        iStamped: stamps.includes(DEMO_ME_ID),
        stamperPreviewIds: stamps.slice(0, 3),
        photoUrls: usablePostPhotos(p.id, p.photoUrls),
        displayMode: p.displayMode ?? 'carousel',
      };
      const score = scoreHomeFeedPost(post, author, {
        meId: DEMO_ME_ID,
        me,
        friendIds: friends,
      });
      return { post, score };
    }).filter(Boolean) as Array<{ post: FeedPost; score: number }>;
    // Most relevant + most recent first
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.post.createdAt).getTime() -
          new Date(a.post.createdAt).getTime(),
    );
    return scored.slice(offset, offset + limit).map((s) => s.post);
  },

  async createPost(input: CreatePostInput): Promise<FeedPost> {
    await loadDemoState();
    if (!input.locationLabel?.trim()) {
      throw new Error('Location is required');
    }
    if (!input.photos?.length) {
      throw new Error('At least one photo is required');
    }
    const postId = id('post');
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    const post: FeedPost = {
      id: postId,
      authorId: DEMO_ME_ID,
      caption: input.caption ?? '',
      locationLabel: input.locationLabel.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      createdAt: new Date().toISOString(),
      photoUrls: input.photos.map((p) => p.uri),
      photoCrops: input.photos.map((p) =>
        p.crop
          ? {
              scale: p.crop.scale,
              offsetX: p.crop.offsetX,
              offsetY: p.crop.offsetY,
            }
          : { scale: 1, offsetX: 0, offsetY: 0 },
      ),
      stampCount: 0,
      iStamped: false,
      stamperPreviewIds: [],
      displayMode: input.displayMode,
      collageLayoutId: input.collageLayoutId ?? null,
      audience: input.audience,
      audienceCommunityIds: input.audienceCommunityIds ?? [],
      taggedTripId: input.taggedTripId ?? null,
      taggedUserIds: (input.taggedUserIds ?? []).filter(
        (uid) => uid && uid !== DEMO_ME_ID,
      ),
    };
    state().posts.unshift(post);
    state().postStamps[postId] = [];

    const tagged = post.taggedUserIds ?? [];
    for (const uid of tagged) {
      state().notifications.unshift({
        id: id('notif'),
        userId: uid,
        kind: 'post_tagged',
        title: 'Tagged in a post',
        body: `${me.fullName} tagged you in a post`,
        data: { postId, fromUserId: DEMO_ME_ID },
        createdAt: new Date().toISOString(),
        readAt: null,
      });
    }

    await persist();
    emit();
    return post;
  },

  async deletePost(postId: string): Promise<void> {
    await loadDemoState();
    const idx = state().posts.findIndex((p) => p.id === postId);
    if (idx < 0) return;
    const post = state().posts[idx];
    if (post.authorId !== DEMO_ME_ID) {
      throw new Error('Not allowed');
    }
    state().posts.splice(idx, 1);
    delete state().postStamps[postId];
    await persist();
    emit();
  },

  async updatePost(postId: string, input: CreatePostInput): Promise<FeedPost> {
    await loadDemoState();
    const post = state().posts.find((p) => p.id === postId);
    if (!post) throw new Error('Post not found');
    if (post.authorId !== DEMO_ME_ID) throw new Error('Not allowed');
    if (!input.locationLabel?.trim()) throw new Error('Location is required');
    if (!input.photos?.length) throw new Error('At least one photo is required');
    post.caption = input.caption ?? '';
    post.locationLabel = input.locationLabel.trim();
    post.latitude = input.latitude;
    post.longitude = input.longitude;
    post.photoUrls = input.photos.map((p) => p.uri);
    post.photoCrops = input.photos.map((p) =>
      p.crop
        ? {
            scale: p.crop.scale,
            offsetX: p.crop.offsetX,
            offsetY: p.crop.offsetY,
          }
        : { scale: 1, offsetX: 0, offsetY: 0 },
    );
    post.displayMode = input.displayMode;
    post.collageLayoutId = input.collageLayoutId ?? null;
    post.audience = input.audience;
    post.audienceCommunityIds = input.audienceCommunityIds ?? [];
    post.taggedTripId = input.taggedTripId ?? null;
    post.taggedUserIds = (input.taggedUserIds ?? []).filter(
      (uid) => uid && uid !== DEMO_ME_ID,
    );
    await persist();
    emit();
    return {
      ...post,
      stampCount: (state().postStamps[postId] ?? []).length,
      iStamped: (state().postStamps[postId] ?? []).includes(DEMO_ME_ID),
      stamperPreviewIds: (state().postStamps[postId] ?? []).slice(0, 3),
    };
  },

  async listAuthorPosts(authorId: string): Promise<FeedPost[]> {
    await loadDemoState();
    return state()
      .posts.filter((p) => p.authorId === authorId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((p) => {
        const stamps = state().postStamps[p.id] ?? [];
        return {
          ...p,
          stampCount: stamps.length,
          iStamped: stamps.includes(DEMO_ME_ID),
          stamperPreviewIds: stamps.slice(0, 3),
          photoUrls: usablePostPhotos(p.id, p.photoUrls),
          displayMode: p.displayMode ?? 'carousel',
        };
      });
  },

  async togglePostStamp(postId: string): Promise<FeedPost | null> {
    await loadDemoState();
    const post = state().posts.find((p) => p.id === postId);
    if (!post) return null;
    const list = state().postStamps[postId] ?? [];
    const idx = list.indexOf(DEMO_ME_ID);
    if (idx >= 0) list.splice(idx, 1);
    else {
      list.unshift(DEMO_ME_ID);
      if (post.authorId !== DEMO_ME_ID) {
        const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
        state().notifications.push({
          id: id('notif'),
          userId: post.authorId,
          kind: 'post_stamped',
          title: 'New stamp',
          body: `${me.fullName} stamped your post from ${post.locationLabel}`,
          data: { postId, fromUserId: DEMO_ME_ID },
          createdAt: new Date().toISOString(),
          readAt: null,
        });
      }
    }
    state().postStamps[postId] = list;
    post.stampCount = list.length;
    post.iStamped = list.includes(DEMO_ME_ID);
    post.stamperPreviewIds = list.slice(0, 3);
    await persist();
    emit();
    return { ...post };
  },

  async listPostStampers(postId: string): Promise<ChatProfile[]> {
    await loadDemoState();
    const ids = state().postStamps[postId] ?? [];
    return ids
      .map((uid) => state().profiles.find((p) => p.id === uid))
      .filter(Boolean) as ChatProfile[];
  },

  async getPost(postId: string): Promise<FeedPost | null> {
    await loadDemoState();
    const post = state().posts.find((p) => p.id === postId);
    if (!post) return null;
    const stamps = state().postStamps[postId] ?? [];
    const photoUrls = usablePostPhotos(postId, post.photoUrls);
    post.photoUrls = photoUrls;
    return {
      ...post,
      photoUrls,
      stampCount: stamps.length,
      iStamped: stamps.includes(DEMO_ME_ID),
      stamperPreviewIds: stamps.slice(0, 3),
    };
  },

  async listFeedAlbums(limit = 12): Promise<FeedAlbumCard[]> {
    await loadDemoState();
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    const friends = new Set(state().friendships[DEMO_ME_ID] ?? []);
    const scored = state()
      .albums.map((al) => {
        const trip = state().trips.find((t) => t.id === al.tripId);
        if (!trip || trip.status !== 'upcoming') return null;
        let score = 0;
        if (al.followerIds.includes(DEMO_ME_ID)) score += 800;
        if (friends.has(trip.ownerId)) score += 500;
        if (trip.memberIds.some((id) => friends.has(id))) score += 400;
        const owner = state().profiles.find((p) => p.id === trip.ownerId);
        if (owner?.studyAbroadProgram === me.studyAbroadProgram) score += 200;
        if (owner?.homeUniversity === me.homeUniversity) score += 100;
        const card: FeedAlbumCard = {
          albumId: al.id,
          tripId: trip.id,
          destinationCity: trip.destinationCity,
          destinationCountry: trip.destinationCountry,
          dateStart: trip.dateStart,
          dateEnd: trip.dateEnd,
          dateLabel: trip.dateLabel,
          ownerId: trip.ownerId,
          memberIds: trip.memberIds,
          coverUrls:
            al.photoUrls.length > 0
              ? al.photoUrls.slice(0, 3)
              : [...ALBUM_PLACEHOLDER_PHOTOS],
          isFollowing: al.followerIds.includes(DEMO_ME_ID),
        };
        return { card, score };
      })
      .filter(Boolean) as { card: FeedAlbumCard; score: number }[];
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.card);
  },

  /** Albums for trips this user is (or was) on — profile horizontal rail. */
  async listAuthorAlbums(userId: string, limit = 40): Promise<FeedAlbumCard[]> {
    await loadDemoState();
    const cards: FeedAlbumCard[] = [];
    for (const al of state().albums) {
      const trip = state().trips.find((t) => t.id === al.tripId);
      if (!trip) continue;
      if (!trip.memberIds.includes(userId) && trip.ownerId !== userId) continue;
      cards.push({
        albumId: al.id,
        tripId: trip.id,
        destinationCity: trip.destinationCity,
        destinationCountry: trip.destinationCountry,
        dateStart: trip.dateStart,
        dateEnd: trip.dateEnd,
        dateLabel: trip.dateLabel,
        ownerId: trip.ownerId,
        memberIds: trip.memberIds,
        coverUrls:
          al.photoUrls.length > 0
            ? al.photoUrls.slice(0, 3)
            : [...ALBUM_PLACEHOLDER_PHOTOS],
        isFollowing: al.followerIds.includes(DEMO_ME_ID),
      });
    }
    cards.sort((a, b) => {
      const as = a.dateStart ?? '';
      const bs = b.dateStart ?? '';
      return bs.localeCompare(as);
    });
    return cards.slice(0, limit);
  },

  async getTripAlbumPhotos(tripId: string): Promise<AlbumPhoto[]> {
    await loadDemoState();
    const album = state().albums.find((a) => a.tripId === tripId);
    if (!album) return [];
    if (album.photos?.length) {
      return [...album.photos].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    // Legacy photoUrls only
    return (album.photoUrls ?? []).map((imageUrl, i) => ({
      id: `${album.id}-legacy-${i}`,
      albumId: album.id,
      tripId,
      uploaderId: state().trips.find((t) => t.id === tripId)?.ownerId ?? DEMO_ME_ID,
      imageUrl,
      createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
    }));
  },

  async uploadTripAlbumPhotos(
    tripId: string,
    imageUris: Array<string | number>,
  ): Promise<AlbumPhoto[]> {
    await loadDemoState();
    const trip = state().trips.find((t) => t.id === tripId);
    if (!trip) throw new Error('Trip not found');
    if (!trip.memberIds.includes(DEMO_ME_ID) && trip.ownerId !== DEMO_ME_ID) {
      throw new Error('Only trip members can upload album photos');
    }
    let album = state().albums.find((a) => a.tripId === tripId);
    if (!album) {
      album = {
        id: id('album'),
        tripId,
        photoUrls: [],
        photos: [],
        followerIds: [],
      };
      state().albums.push(album);
      trip.albumId = album.id;
    }
    if (!album.photos) album.photos = [];
    const added: AlbumPhoto[] = [];
    const now = Date.now();
    // Preserve picker order; newest batch still sorts to top via createdAt
    imageUris.forEach((uri, i) => {
      const photo: AlbumPhoto = {
        id: id('aphoto'),
        albumId: album!.id,
        tripId,
        uploaderId: DEMO_ME_ID,
        imageUrl: uri,
        createdAt: new Date(now + i).toISOString(),
      };
      album!.photos!.unshift(photo);
      added.push(photo);
    });
    album.photoUrls = album.photos.map((p) => p.imageUrl);
    trip.albumPreviewUrls = album.photoUrls.slice(0, 3) as string[];

    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    const count = added.length;
    for (const memberId of trip.memberIds) {
      if (memberId === DEMO_ME_ID) continue;
      state().notifications.push({
        id: id('notif'),
        userId: memberId,
        kind: 'album_photos_uploaded',
        title: 'New album photos',
        body: `${me.fullName} uploaded ${count} photo${count === 1 ? '' : 's'} to the trip album`,
        data: {
          tripId,
          fromUserId: DEMO_ME_ID,
          photoCount: count,
        },
        createdAt: new Date().toISOString(),
        readAt: null,
      });
    }

    await persist();
    emit();
    return added;
  },

  async cancelTripJoin(tripId: string): Promise<void> {
    await loadDemoState();
    const trip = state().trips.find((t) => t.id === tripId);
    if (trip && trip.myJoinStatus === 'pending') {
      trip.myJoinStatus = null;
    }
    state().tripJoinRequests = state().tripJoinRequests.filter(
      (r) =>
        !(
          r.tripId === tripId &&
          r.requesterId === DEMO_ME_ID &&
          r.status === 'pending'
        ),
    );
    await persist();
    emit();
  },

  async requestTripJoin(tripId: string): Promise<void> {
    await loadDemoState();
    const trip = state().trips.find((t) => t.id === tripId);
    if (!trip) return;
    if (
      trip.ownerId === DEMO_ME_ID ||
      trip.memberIds.includes(DEMO_ME_ID) ||
      trip.myJoinStatus === 'accepted'
    ) {
      return;
    }
    if (!trip.openToJoin) throw new Error('This trip is private');
    if (
      trip.maxMembers != null &&
      trip.memberIds.length >= trip.maxMembers
    ) {
      throw new Error('Trip is full');
    }
    trip.myJoinStatus = 'pending';
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    let req = state().tripJoinRequests.find(
      (r) =>
        r.tripId === tripId &&
        r.requesterId === DEMO_ME_ID &&
        r.status === 'pending',
    );
    if (!req) {
      req = {
        id: id('jr'),
        tripId,
        requesterId: DEMO_ME_ID,
        status: 'pending',
      };
      state().tripJoinRequests.push(req);
    }
    for (const memberId of trip.memberIds) {
      if (memberId === DEMO_ME_ID) continue;
      state().notifications.push({
        id: id('notif'),
        userId: memberId,
        kind: 'trip_join_request',
        title: 'Trip join request',
        body: `${me.firstName} requested to join your trip`,
        data: {
          tripId,
          requesterId: DEMO_ME_ID,
          requestId: req.id,
        },
        createdAt: new Date().toISOString(),
      });
    }
    await persist();
    emit();
  },

  async createTrip(input: CreateTripInput): Promise<ChatTrip> {
    await loadDemoState();
    const tripId = id('trip');
    const channelId = id('ch-trip');
    const albumId = id('album');
    const token = Math.random().toString(36).slice(2, 14);
    const dateLabel =
      input.dateLabel ||
      shortWeekdayRange(input.dateStart, input.dateEnd, '') ||
      '';
    const trip: ChatTrip = {
      id: tripId,
      ownerId: DEMO_ME_ID,
      status: 'planning',
      openToJoin: input.openToJoin,
      destinationCity: input.destinationCity.trim(),
      destinationCountry: (input.destinationCountry || '').trim(),
      dateLabel,
      dateStart: input.dateStart ?? null,
      dateEnd: input.dateEnd ?? null,
      description: input.description?.trim() || null,
      maxMembers: input.maxMembers ?? null,
      inviteToken: token,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      channelId,
      memberIds: [DEMO_ME_ID],
      pendingInviteeIds: [...input.inviteeIds],
      myJoinStatus: null,
      albumId,
      isFollowingAlbum: false,
      albumPreviewUrls: [],
    };
    state().trips.unshift(trip);
    state().albums.push({
      id: albumId,
      tripId,
      photoUrls: [],
      photos: [],
      followerIds: [],
    });
    state().channels.push({
      id: channelId,
      communityId: null,
      tripId,
      slug: 'trip',
      name: tripChatTitle(trip.destinationCity, trip.destinationCountry),
    });
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    for (const inviteeId of input.inviteeIds) {
      if (inviteeId === DEMO_ME_ID) continue;
      const inviteId = id('inv');
      state().tripInvites.push({
        id: inviteId,
        tripId,
        inviterId: DEMO_ME_ID,
        inviteeId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      state().notifications.push({
        id: id('notif'),
        userId: inviteeId,
        kind: 'trip_invite',
        title: 'Trip invite',
        body: `${me.fullName} invited you to ${trip.destinationCity}`,
        data: {
          tripId,
          inviteeId,
          inviterId: DEMO_ME_ID,
          inviteId,
        },
        createdAt: new Date().toISOString(),
      });
    }
    if (input.notifyFriends) {
      const invited = new Set(input.inviteeIds);
      for (const friendId of state().friendships[DEMO_ME_ID] ?? []) {
        if (invited.has(friendId)) continue;
        state().notifications.push({
          id: id('notif'),
          userId: friendId,
          kind: 'trip_created',
          title: 'New trip',
          body: `${me.fullName} is planning a trip to ${trip.destinationCity}`,
          data: { tripId, ownerId: DEMO_ME_ID },
          createdAt: new Date().toISOString(),
        });
      }
    }
    await persist();
    applyTripPassportUnlock({
      unlocks: state().passportUnlocks,
      cities: state().passportCities,
      userId: DEMO_ME_ID,
      tripId,
      cityName: trip.destinationCity,
      countryName: trip.destinationCountry,
      latitude: trip.latitude,
      longitude: trip.longitude,
    });
    refreshProfilePassportCounts(
      state().profiles,
      state().passportUnlocks,
      state().passportCities,
    );
    await persist();
    emit();
    void this.notifyTripFollowers(trip, 'created');
    return enrichTripAlbum(trip);
  },

  async syncPassportTripCities(): Promise<number> {
    await loadDemoState();
    let count = 0;
    for (const trip of state().trips) {
      if (!trip.memberIds.includes(DEMO_ME_ID)) continue;
      applyTripPassportUnlock({
        unlocks: state().passportUnlocks,
        cities: state().passportCities,
        userId: DEMO_ME_ID,
        tripId: trip.id,
        cityName: trip.destinationCity,
        countryName: trip.destinationCountry,
        latitude: trip.latitude,
        longitude: trip.longitude,
      });
      count += 1;
    }
    refreshProfilePassportCounts(
      state().profiles,
      state().passportUnlocks,
      state().passportCities,
    );
    await persist();
    emit();
    return count;
  },

  async attachPendingInvites(
    tripId: string,
    inviteeIds: string[],
    destinationCity: string,
  ): Promise<void> {
    await loadDemoState();
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    for (const inviteeId of inviteeIds) {
      if (inviteeId === DEMO_ME_ID) continue;
      const existing = state().tripInvites.find(
        (i) => i.tripId === tripId && i.inviteeId === inviteeId,
      );
      let inviteId = existing?.id;
      if (existing) existing.status = 'pending';
      else {
        inviteId = id('inv');
        state().tripInvites.push({
          id: inviteId,
          tripId,
          inviterId: DEMO_ME_ID,
          inviteeId,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      }
      state().notifications.push({
        id: id('notif'),
        userId: inviteeId,
        kind: 'trip_invite',
        title: 'Trip invite',
        body: `${me.fullName} invited you to ${destinationCity}`,
        data: {
          tripId,
          inviteeId,
          inviterId: DEMO_ME_ID,
          inviteId,
        },
        createdAt: new Date().toISOString(),
      });
    }
    await persist();
    emit();
  },

  async inviteToTrip(tripId: string, inviteeId: string): Promise<void> {
    await loadDemoState();
    if (inviteeId === DEMO_ME_ID) return;
    const trip = state().trips.find((t) => t.id === tripId);
    const city = trip?.destinationCity ?? 'a trip';
    const existing = state().tripInvites.find(
      (i) => i.tripId === tripId && i.inviteeId === inviteeId,
    );
    let inviteId = existing?.id;
    if (existing) existing.status = 'pending';
    else {
      inviteId = id('inv');
      state().tripInvites.push({
        id: inviteId,
        tripId,
        inviterId: DEMO_ME_ID,
        inviteeId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }
    if (trip) {
      const pending = new Set(trip.pendingInviteeIds ?? []);
      pending.add(inviteeId);
      trip.pendingInviteeIds = [...pending];
    }
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    state().notifications.push({
      id: id('notif'),
      userId: inviteeId,
      kind: 'trip_invite',
      title: 'Trip invite',
      body: `${me.fullName} invited you to ${city}`,
      data: {
        tripId,
        inviteeId,
        inviterId: DEMO_ME_ID,
        inviteId,
      },
      createdAt: new Date().toISOString(),
    });
    await persist();
    emit();
  },

  async uninviteFromTrip(tripId: string, inviteeId: string): Promise<void> {
    await loadDemoState();
    const inv = state().tripInvites.find(
      (i) =>
        i.tripId === tripId && i.inviteeId === inviteeId && i.status === 'pending',
    );
    const trip = state().trips.find((t) => t.id === tripId);
    const wasPending =
      !!inv || (trip?.pendingInviteeIds ?? []).includes(inviteeId);
    if (!wasPending) return;

    if (inv) inv.status = 'cancelled';
    if (trip) {
      trip.pendingInviteeIds = (trip.pendingInviteeIds ?? []).filter(
        (id) => id !== inviteeId,
      );
    }

    const me = state().profiles.find((p) => p.id === DEMO_ME_ID);
    const city = trip?.destinationCity ?? 'a trip';
    state().notifications.push({
      id: id('notif'),
      userId: inviteeId,
      kind: 'trip_invite_cancelled',
      title: 'Invite withdrawn',
      body: `${me?.fullName ?? 'Someone'} withdrew your invite to ${city}`,
      data: { tripId, inviteeId, inviterId: DEMO_ME_ID },
      createdAt: new Date().toISOString(),
    });
    await persist();
    emit();
  },

  async confirmTrip(tripId: string): Promise<void> {
    await loadDemoState();
    const trip = state().trips.find((t) => t.id === tripId);
    if (!trip) return;
    if (trip.ownerId !== DEMO_ME_ID) return;
    // Preserve openToJoin so public trips stay joinable after lock-in
    trip.status = 'upcoming';
    let album = state().albums.find((a) => a.tripId === tripId);
    if (!album) {
      album = {
        id: id('album'),
        tripId,
        photoUrls: [],
        followerIds: [],
      };
      state().albums.push(album);
    }
    trip.albumId = album.id;
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    for (const memberId of trip.memberIds) {
      if (memberId === DEMO_ME_ID) continue;
      state().notifications.push({
        id: id('notif'),
        userId: memberId,
        kind: 'trip_confirmed',
        title: 'Trip confirmed',
        body: `${me.fullName} locked in ${trip.destinationCity}`,
        data: { tripId, ownerId: DEMO_ME_ID },
        createdAt: new Date().toISOString(),
      });
    }
    for (const memberId of trip.memberIds) {
      applyTripPassportUnlock({
        unlocks: state().passportUnlocks,
        cities: state().passportCities,
        userId: memberId,
        tripId: trip.id,
        cityName: trip.destinationCity,
        countryName: trip.destinationCountry,
        latitude: trip.latitude,
        longitude: trip.longitude,
      });
    }
    refreshProfilePassportCounts(
      state().profiles,
      state().passportUnlocks,
      state().passportCities,
    );
    refreshExplorerScores(state().profiles, state().trips);
    await persist();
    emit();
    void this.notifyTripFollowers(trip, 'locked in');
  },

  async unconfirmTrip(tripId: string): Promise<void> {
    await loadDemoState();
    const trip = state().trips.find((t) => t.id === tripId);
    if (!trip) return;
    // Host or member copy (hybrid live trips may use a UUID owner id)
    if (
      trip.ownerId !== DEMO_ME_ID &&
      !trip.memberIds.includes(DEMO_ME_ID)
    ) {
      return;
    }
    trip.status = 'planning';
    refreshExplorerScores(state().profiles, state().trips);
    await persist();
    emit();
  },

  async setTripOpenToJoin(tripId: string, open: boolean): Promise<void> {
    await loadDemoState();
    const trip = state().trips.find((t) => t.id === tripId);
    if (!trip) return;
    if (trip.ownerId !== DEMO_ME_ID) return;
    if (trip.status === 'upcoming') {
      trip.openToJoin = false;
    } else {
      trip.openToJoin = open;
    }
    await persist();
    emit();
  },

  /** Ping subscribers (e.g. after a live-only mutation). */
  notify() {
    emit();
  },

  async getPassport(userId: string): Promise<PassportData> {
    await loadDemoState();
    const profile = state().profiles.find((p) => p.id === userId);
    ensureHostCity({
      unlocks: state().passportUnlocks,
      cities: state().passportCities,
      userId,
      hostCity: profile?.hostCity,
      hostCountry: profile?.hostCountry,
    });
    refreshProfilePassportCounts(
      state().profiles,
      state().passportUnlocks,
      state().passportCities,
    );
    return passportForUser(
      userId,
      state().passportUnlocks,
      state().passportCities,
    );
  },

  async reorderPassportCities(cityIds: string[]): Promise<void> {
    await loadDemoState();
    cityIds.forEach((cityId, i) => {
      const row = state().passportCities.find(
        (c) => c.id === cityId && c.userId === DEMO_ME_ID,
      );
      if (row) row.sortOrder = i;
    });
    refreshProfilePassportCounts(
      state().profiles,
      state().passportUnlocks,
      state().passportCities,
    );
    await persist();
    emit();
  },

  async addPassportCity(input: {
    cityName: string;
    countryName: string;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<PassportCityRank> {
    await loadDemoState();
    const row = addManualCity({
      unlocks: state().passportUnlocks,
      cities: state().passportCities,
      userId: DEMO_ME_ID,
      cityName: input.cityName,
      countryName: input.countryName,
      latitude: input.latitude,
      longitude: input.longitude,
    });
    refreshProfilePassportCounts(
      state().profiles,
      state().passportUnlocks,
      state().passportCities,
    );
    await persist();
    emit();
    return row;
  },

  async listTripJoinRequests(
    tripId: string,
  ): Promise<Array<{ id: string; requesterId: string; status: string }>> {
    await loadDemoState();
    return state()
      .tripJoinRequests.filter(
        (r) => r.tripId === tripId && r.status === 'pending',
      )
      .map((r) => ({
        id: r.id,
        requesterId: r.requesterId,
        status: r.status,
      }));
  },

  async respondTripJoinRequest(
    requestId: string,
    accept: boolean,
  ): Promise<void> {
    await loadDemoState();
    const req = state().tripJoinRequests.find((r) => r.id === requestId);
    if (!req || req.status !== 'pending') {
      throw new Error('Join request not found');
    }
    const trip = state().trips.find((t) => t.id === req.tripId);
    if (!trip) throw new Error('Trip not found');
    if (trip.ownerId !== DEMO_ME_ID && !trip.memberIds.includes(DEMO_ME_ID)) {
      throw new Error('Only trip members can respond');
    }
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;

    if (!accept) {
      req.status = 'declined';
      const requesterTrip = state().trips.find((t) => t.id === req.tripId);
      if (requesterTrip && req.requesterId === DEMO_ME_ID) {
        requesterTrip.myJoinStatus = 'declined';
      } else if (requesterTrip && req.requesterId !== DEMO_ME_ID) {
        // requester is another demo user — clear only if they were tracking via myJoinStatus n/a
      }
      state().notifications.push({
        id: id('notif'),
        userId: req.requesterId,
        kind: 'trip_join_declined',
        title: 'Join request declined',
        body: `${me.fullName} declined your request to join ${trip.destinationCity}`,
        data: {
          tripId: trip.id,
          requestId: req.id,
          ownerId: DEMO_ME_ID,
        },
        createdAt: new Date().toISOString(),
      });
      await persist();
      emit();
      return;
    }

    if (
      trip.maxMembers != null &&
      trip.memberIds.length >= trip.maxMembers
    ) {
      throw new Error('Trip is full');
    }
    req.status = 'accepted';
    if (!trip.memberIds.includes(req.requesterId)) {
      trip.memberIds.push(req.requesterId);
    }
    if (req.requesterId === DEMO_ME_ID) {
      trip.myJoinStatus = 'accepted';
    }
    state().notifications.push({
      id: id('notif'),
      userId: req.requesterId,
      kind: 'trip_join_accepted',
      title: 'You’re in!',
      body: `${me.fullName} accepted you on the ${trip.destinationCity} trip`,
      data: {
        tripId: trip.id,
        requestId: req.id,
        ownerId: DEMO_ME_ID,
      },
      createdAt: new Date().toISOString(),
    });
    await persist();
    emit();
  },

  async respondTripInvite(inviteId: string, accept: boolean): Promise<void> {
    await loadDemoState();
    const inv = state().tripInvites.find((i) => i.id === inviteId);
    if (!inv || inv.inviteeId !== DEMO_ME_ID || inv.status !== 'pending') return;
    const trip = state().trips.find((t) => t.id === inv.tripId);
    if (!trip) return;
    if (!accept) {
      inv.status = 'declined';
      trip.pendingInviteeIds = (trip.pendingInviteeIds ?? []).filter(
        (id) => id !== DEMO_ME_ID,
      );
      await persist();
      emit();
      return;
    }
    if (
      trip.maxMembers != null &&
      trip.memberIds.length >= trip.maxMembers
    ) {
      throw new Error('Trip is full');
    }
    inv.status = 'accepted';
    if (!trip.memberIds.includes(DEMO_ME_ID)) trip.memberIds.push(DEMO_ME_ID);
    trip.pendingInviteeIds = (trip.pendingInviteeIds ?? []).filter(
      (id) => id !== DEMO_ME_ID,
    );
    // Ensure trip chat exists so joiners see it in the sidebar
    let ch = state().channels.find(
      (c) => c.tripId === trip.id && c.slug === 'trip',
    );
    if (!ch) {
      const channelId = trip.channelId ?? id('ch-trip');
      ch = {
        id: channelId,
        communityId: null,
        tripId: trip.id,
        slug: 'trip',
        name: tripChatTitle(trip.destinationCity, trip.destinationCountry),
      };
      state().channels.push(ch);
      trip.channelId = channelId;
    } else {
      ch.name = tripChatTitle(trip.destinationCity, trip.destinationCountry);
      trip.channelId = ch.id;
    }
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    state().notifications.push({
      id: id('notif'),
      userId: inv.inviterId,
      kind: 'trip_invite_accepted',
      title: 'Invite accepted',
      body: `${me.fullName} joined your ${trip.destinationCity} trip`,
      data: { tripId: trip.id, inviteeId: DEMO_ME_ID },
      createdAt: new Date().toISOString(),
    });
    await persist();
    emit();
  },

  async removeTripMember(tripId: string, userId: string): Promise<void> {
    await loadDemoState();
    const trip = state().trips.find((t) => t.id === tripId);
    if (!trip) return;
    if (userId === trip.ownerId) throw new Error('Owner cannot leave');
    trip.memberIds = trip.memberIds.filter((id) => id !== userId);
    trip.pendingInviteeIds = (trip.pendingInviteeIds ?? []).filter(
      (id) => id !== userId,
    );
    await persist();
    emit();
  },

  async listMyTripChannels(): Promise<TripChannel[]> {
    await loadDemoState();
    const out: TripChannel[] = [];
    for (const ch of state().channels) {
      if (!ch.tripId || ch.slug !== 'trip') continue;
      const trip = state().trips.find((t) => t.id === ch.tripId);
      if (!trip || !trip.memberIds.includes(DEMO_ME_ID)) continue;
      const name = tripChatTitle(
        trip.destinationCity,
        trip.destinationCountry,
      );
      if (ch.name !== name) ch.name = name;
      out.push({
        id: ch.id,
        tripId: ch.tripId,
        name,
        destinationCity: trip.destinationCity,
        destinationCountry: trip.destinationCountry,
      });
    }
    return out;
  },

  /** Mirror a live-created trip + channel into demo so hybrid sidebar always shows it. */
  async mirrorLiveTrip(trip: ChatTrip): Promise<void> {
    await loadDemoState();
    const title = tripChatTitle(
      trip.destinationCity,
      trip.destinationCountry,
    );
    const channelId = trip.channelId ?? id('ch-trip');
    let existing = state().trips.find((t) => t.id === trip.id);
    if (existing) {
      existing.destinationCity = trip.destinationCity;
      existing.destinationCountry = trip.destinationCountry;
      existing.status = trip.status;
      existing.openToJoin = trip.openToJoin;
      existing.channelId = channelId;
      existing.memberIds = [
        ...new Set([...existing.memberIds, DEMO_ME_ID, ...(trip.memberIds ?? [])]),
      ];
      existing.pendingInviteeIds = trip.pendingInviteeIds ?? existing.pendingInviteeIds;
      existing.description = trip.description ?? existing.description;
      existing.maxMembers = trip.maxMembers ?? existing.maxMembers;
      existing.inviteToken = trip.inviteToken ?? existing.inviteToken;
      existing.dateStart = trip.dateStart ?? existing.dateStart;
      existing.dateEnd = trip.dateEnd ?? existing.dateEnd;
      existing.dateLabel = trip.dateLabel || existing.dateLabel;
      existing.latitude = trip.latitude ?? existing.latitude;
      existing.longitude = trip.longitude ?? existing.longitude;
      existing.albumId = trip.albumId ?? existing.albumId;
    } else {
      state().trips.unshift({
        ...trip,
        channelId,
        memberIds: [
          ...new Set([DEMO_ME_ID, ...(trip.memberIds ?? [])]),
        ],
        pendingInviteeIds: trip.pendingInviteeIds ?? [],
      });
    }
    let ch = state().channels.find(
      (c) => c.tripId === trip.id && c.slug === 'trip',
    );
    if (!ch) {
      state().channels.push({
        id: channelId,
        communityId: null,
        tripId: trip.id,
        slug: 'trip',
        name: title,
      });
    } else {
      ch.id = channelId;
      ch.name = title;
    }
    await persist();
    emit();
  },

  async suggestTripInvitees(): Promise<ChatProfile[]> {
    await loadDemoState();
    const friends = state().friendships[DEMO_ME_ID] ?? [];
    const scores = new Map<string, number>();
    for (const fid of friends) scores.set(fid, 10);

    for (const trip of state().trips) {
      const shared = trip.memberIds.includes(DEMO_ME_ID);
      if (!shared) continue;
      for (const mid of trip.memberIds) {
        if (mid === DEMO_ME_ID) continue;
        scores.set(mid, (scores.get(mid) ?? 0) + 5);
      }
    }
    for (const dm of state().dmThreads) {
      scores.set(dm.otherUserId, (scores.get(dm.otherUserId) ?? 0) + 3);
      const msgCount = state().messages.filter(
        (m) => m.dmThreadId === dm.id,
      ).length;
      scores.set(
        dm.otherUserId,
        (scores.get(dm.otherUserId) ?? 0) + Math.min(msgCount, 10),
      );
    }
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    for (const p of state().profiles) {
      if (p.id === DEMO_ME_ID) continue;
      if (p.studyAbroadProgram === me.studyAbroadProgram) {
        scores.set(p.id, (scores.get(p.id) ?? 0) + 2);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([uid]) => state().profiles.find((p) => p.id === uid))
      .filter((p): p is ChatProfile => Boolean(p && p.id !== DEMO_ME_ID))
      .slice(0, 20);
  },

  async resolveTripInviteToken(token: string): Promise<ChatTrip | null> {
    await loadDemoState();
    const t = state().trips.find((x) => x.inviteToken === token);
    return t ? enrichTripAlbum(t) : null;
  },

  tripInviteLink(trip: ChatTrip): string {
    return `abroadster://trip/${trip.inviteToken ?? trip.id}`;
  },

  async joinTripViaInviteToken(token: string): Promise<ChatTrip | null> {
    await loadDemoState();
    const trimmed = token.trim();
    if (!trimmed || trimmed === 'preview') return null;
    const trip = state().trips.find((x) => x.inviteToken === trimmed || x.id === trimmed);
    if (!trip) return null;
    if (!trip.memberIds.includes(DEMO_ME_ID)) {
      trip.memberIds.push(DEMO_ME_ID);
    }
    trip.myJoinStatus = 'accepted';
    await persist();
    emit();
    return enrichTripAlbum(trip);
  },

  async isFriend(userId: string): Promise<boolean> {
    await loadDemoState();
    return (state().friendships[DEMO_ME_ID] ?? []).includes(userId);
  },

  async addFriend(userId: string): Promise<void> {
    await loadDemoState();
    if (userId === DEMO_ME_ID) return;
    // One-way: only I follow them; they must add me back to see me
    const mine = state().friendships[DEMO_ME_ID] ?? (state().friendships[DEMO_ME_ID] = []);
    if (!mine.includes(userId)) mine.push(userId);
    state().blockedUserIds = (state().blockedUserIds ?? []).filter(
      (id) => id !== userId,
    );
    const me = state().profiles.find((p) => p.id === DEMO_ME_ID)!;
    state().notifications.push({
      id: id('notif'),
      userId,
      kind: 'friend_added',
      title: 'New friend',
      body: `${me.fullName} added you as a friend`,
      data: { fromUserId: DEMO_ME_ID },
      createdAt: new Date().toISOString(),
      readAt: null,
    });
    await persist();
    emit();
  },

  async removeFriend(userId: string): Promise<void> {
    await loadDemoState();
    const mine = state().friendships[DEMO_ME_ID] ?? [];
    state().friendships[DEMO_ME_ID] = mine.filter((id) => id !== userId);
    await persist();
    emit();
  },

  async isBlocked(userId: string): Promise<boolean> {
    await loadDemoState();
    return (state().blockedUserIds ?? []).includes(userId);
  },

  async muteChannel(channelId: string): Promise<void> {
    await loadDemoState();
    const muted = state().mutedChannelIds ?? (state().mutedChannelIds = []);
    if (!muted.includes(channelId)) muted.push(channelId);
    await persist();
    emit();
  },

  async unmuteChannel(channelId: string): Promise<void> {
    await loadDemoState();
    state().mutedChannelIds = (state().mutedChannelIds ?? []).filter(
      (id) => id !== channelId,
    );
    await persist();
    emit();
  },

  async isChannelMuted(channelId: string): Promise<boolean> {
    await loadDemoState();
    return (state().mutedChannelIds ?? []).includes(channelId);
  },

  async blockUser(userId: string): Promise<void> {
    await loadDemoState();
    if (userId === DEMO_ME_ID) return;
    const blocked = state().blockedUserIds ?? (state().blockedUserIds = []);
    if (!blocked.includes(userId)) blocked.push(userId);
    // Also unfriend both ways
    await this.removeFriend(userId);
    state().tripNotifyUserIds = (state().tripNotifyUserIds ?? []).filter(
      (id) => id !== userId,
    );
    await persist();
    emit();
  },

  async unblockUser(userId: string): Promise<void> {
    await loadDemoState();
    state().blockedUserIds = (state().blockedUserIds ?? []).filter(
      (id) => id !== userId,
    );
    await persist();
    emit();
  },

  async isTripNotifyEnabled(userId: string): Promise<boolean> {
    await loadDemoState();
    return (state().tripNotifyUserIds ?? []).includes(userId);
  },

  async setTripNotify(userId: string, enabled: boolean): Promise<void> {
    await loadDemoState();
    const list = state().tripNotifyUserIds ?? (state().tripNotifyUserIds = []);
    if (enabled) {
      if (!list.includes(userId)) list.push(userId);
      const target = state().profiles.find((p) => p.id === userId);
      state().notifications.push({
        id: id('notif'),
        userId: DEMO_ME_ID,
        kind: 'trip_notify_on',
        title: 'Trip notifications on',
        body: `You’ll get notified when ${target?.firstName ?? 'they'} post trips`,
        data: { fromUserId: userId },
        createdAt: new Date().toISOString(),
        readAt: null,
      });
    } else {
      state().tripNotifyUserIds = list.filter((id) => id !== userId);
    }
    await persist();
    emit();
  },

  /** If I’ve opted into trip alerts for the trip owner, notify me. */
  async notifyTripFollowers(trip: ChatTrip, verb: string): Promise<void> {
    await loadDemoState();
    if (trip.ownerId === DEMO_ME_ID) return;
    if (!(state().tripNotifyUserIds ?? []).includes(trip.ownerId)) return;
    const owner = state().profiles.find((p) => p.id === trip.ownerId);
    state().notifications.push({
      id: id('notif'),
      userId: DEMO_ME_ID,
      kind: 'trip_activity',
      title: 'Trip update',
      body: `${owner?.firstName ?? 'Someone'} ${verb} a trip to ${trip.destinationCity}`,
      data: { tripId: trip.id, fromUserId: trip.ownerId },
      createdAt: new Date().toISOString(),
      readAt: null,
    });
    await persist();
    emit();
  },

  async searchUsers(query: string): Promise<ChatProfile[]> {
    await loadDemoState();
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const friends = new Set(state().friendships[DEMO_ME_ID] ?? []);
    const matches = state().profiles.filter(
      (p) =>
        p.id !== DEMO_ME_ID &&
        (p.fullName.toLowerCase().includes(q) ||
          p.firstName.toLowerCase().includes(q)),
    );
    matches.sort((a, b) => {
      const af = friends.has(a.id) ? 0 : 1;
      const bf = friends.has(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.fullName.localeCompare(b.fullName);
    });
    return matches;
  },

  async listDmThreads(): Promise<DmThread[]> {
    await loadDemoState();
    // Keep previews fresh from last message so AirMail survives reloads accurately
    for (const t of state().dmThreads) {
      const msgs = state().messages
        .filter((m) => m.dmThreadId === t.id)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      const last = msgs[msgs.length - 1];
      if (last) {
        t.lastPreview = last.body ?? last.kind;
        t.updatedAt = last.createdAt;
      }
    }
    return [...state().dmThreads].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  },

  async openDm(otherUserId: string): Promise<DmThread> {
    await loadDemoState();
    let thread = state().dmThreads.find((t) => t.otherUserId === otherUserId);
    if (!thread) {
      thread = {
        id: id('dm'),
        otherUserId,
        updatedAt: new Date().toISOString(),
        lastPreview: '',
      };
      state().dmThreads.push(thread);
      await persist();
      emit();
    }
    return thread;
  },

  async createPoll(question: string, options: string[]): Promise<PollData> {
    await loadDemoState();
    const poll: PollData = {
      id: id('poll'),
      question,
      options: options.map((label, i) => ({
        id: id(`opt${i}`),
        label,
        votes: 0,
      })),
      myVoteOptionId: null,
    };
    state().polls.push(poll);
    await persist();
    emit();
    return poll;
  },

  async getPoll(pollId: string): Promise<PollData | null> {
    await loadDemoState();
    return state().polls.find((p) => p.id === pollId) ?? null;
  },

  async votePoll(pollId: string, optionId: string): Promise<void> {
    await loadDemoState();
    const poll = state().polls.find((p) => p.id === pollId);
    if (!poll) return;
    if (poll.myVoteOptionId) {
      const prev = poll.options.find((o) => o.id === poll.myVoteOptionId);
      if (prev) prev.votes = Math.max(0, prev.votes - 1);
    }
    const opt = poll.options.find((o) => o.id === optionId);
    if (opt) opt.votes += 1;
    poll.myVoteOptionId = optionId;
    await persist();
    emit();
  },

  async getMySettings() {
    await loadDemoState();
    const {
      emptyUserSettings,
      mergeNotifPrefs,
      mergeOnboarding,
    } = await import('../social/userSettings');
    const raw = state().userSettings;
    if (!raw) return emptyUserSettings();
    return {
      notificationPrefs: mergeNotifPrefs(raw.notificationPrefs),
      onboarding: mergeOnboarding(raw.onboarding),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
  },

  async updateMySettings(patch: {
    notificationPrefs?: Record<string, boolean>;
    onboarding?: Record<string, boolean>;
  }) {
    await loadDemoState();
    const {
      mergeNotifPrefs,
      mergeOnboarding,
    } = await import('../social/userSettings');
    const cur = state().userSettings ?? {
      notificationPrefs: {},
      onboarding: {},
      updatedAt: new Date().toISOString(),
    };
    if (patch.notificationPrefs) {
      cur.notificationPrefs = {
        ...cur.notificationPrefs,
        ...patch.notificationPrefs,
      };
    }
    if (patch.onboarding) {
      cur.onboarding = { ...cur.onboarding, ...patch.onboarding };
    }
    cur.updatedAt = new Date().toISOString();
    state().userSettings = cur;
    await persist();
    emit();
    return {
      notificationPrefs: mergeNotifPrefs(cur.notificationPrefs),
      onboarding: mergeOnboarding(cur.onboarding),
      updatedAt: cur.updatedAt,
    };
  },

  async listBlockedUsers() {
    await loadDemoState();
    const ids = state().blockedUserIds ?? [];
    const out: ChatProfile[] = [];
    for (const id of ids) {
      const p = state().profiles.find((x) => x.id === id);
      if (p) out.push(p);
    }
    return out;
  },

  async suggestAccounts(
    limit: number,
    scorer: typeof import('../social/suggestAccounts').scoreSuggestedAccounts,
  ) {
    await loadDemoState();
    const me = await this.getMe();
    const friendIds = await this.getFriendIds();
    const friendsOf = new Map<string, string[]>();
    for (const [uid, list] of Object.entries(state().friendships ?? {})) {
      friendsOf.set(uid, list);
    }
    const citiesOf = new Map<string, string[]>();
    const myCities: string[] = [];
    for (const c of state().passportCities ?? []) {
      const key = (c.cityName || '').toLowerCase();
      if (!key) continue;
      const arr = citiesOf.get(c.userId) ?? [];
      arr.push(key);
      citiesOf.set(c.userId, arr);
      if (c.userId === me.id) myCities.push(key);
    }
    const profilesById = new Map(
      state().profiles.map((p) => [p.id, p] as const),
    );
    return scorer({
      me,
      candidates: state().profiles,
      friendIds,
      blockedIds: state().blockedUserIds ?? [],
      friendsOf,
      profilesById,
      citiesOf,
      myCities,
      limit,
    });
  },
};
