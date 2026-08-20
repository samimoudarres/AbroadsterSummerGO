export type ChannelSlug = 'general' | 'introductions' | 'trips' | 'roommates' | 'trip';
export type CommunityKind = 'abroad' | 'home';
export type MessageKind = 'text' | 'image' | 'trip' | 'poll' | 'system' | 'post';
export type TripStatus = 'upcoming' | 'planning';
export type JoinRequestStatus = 'pending' | 'accepted' | 'declined';
export type TripInviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface ChatProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatar: string | number;
  homeUniversity: string;
  studyAbroadProgram: string;
  homeAccent: string;
  abroadAccent: string;
  /** Short bio shown on profile */
  bio?: string | null;
  /** Study-abroad semester, e.g. Fall 2026 */
  semester?: string | null;
  hostCity?: string | null;
  hostCountry?: string | null;
  /** Study-abroad / host map coordinates (shared with everyone). */
  hostLatitude?: number | null;
  hostLongitude?: number | null;
  /** Last published When-In-Use GPS (optional; not the host city). */
  liveLatitude?: number | null;
  liveLongitude?: number | null;
  liveLocationLabel?: string | null;
  citiesVisited?: number | null;
  countriesVisited?: number | null;
  /** Cached Explorer Score (miles traveled). */
  explorerScoreMiles?: number | null;
  /** True when signup used a valid .edu school email. */
  isVerifiedStudent?: boolean;
  studentEmail?: string | null;
  phoneNumber?: string | null;
  dateOfBirth?: string | null;
}

export interface PassportCountryUnlock {
  countryKey: string;
  countryName: string;
  unlockedAt: string;
  sourceTripId?: string | null;
}

export interface PassportCityRank {
  id: string;
  cityName: string;
  countryName: string;
  sortOrder: number;
  source: 'host' | 'trip' | 'manual';
  tripId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface PassportData {
  unlocks: PassportCountryUnlock[];
  cities: PassportCityRank[];
}

export interface ChatCommunity {
  id: string;
  name: string;
  kind: CommunityKind;
  accent: string;
  logoUri?: string | number;
  channelIds: Record<Exclude<ChannelSlug, 'trip'>, string>;
}

export interface ChatChannel {
  id: string;
  communityId?: string | null;
  tripId?: string | null;
  slug: ChannelSlug;
  name: string;
}

export interface TripChannel {
  id: string;
  tripId: string;
  name: string;
  destinationCity: string;
  destinationCountry: string;
}

export interface ChatTrip {
  id: string;
  ownerId: string;
  status: TripStatus;
  openToJoin: boolean;
  destinationCity: string;
  destinationCountry: string;
  dateLabel: string;
  /** ISO date YYYY-MM-DD */
  dateStart?: string | null;
  /** ISO date YYYY-MM-DD */
  dateEnd?: string | null;
  leavingTime?: string;
  memberIds: string[];
  myJoinStatus?: JoinRequestStatus | null;
  /** Confirmed trips auto-get an album */
  albumId?: string | null;
  isFollowingAlbum?: boolean;
  /** Latest photo URLs from the trip album (up to 3 for previews) */
  albumPreviewUrls?: string[];
  description?: string | null;
  maxMembers?: number | null;
  inviteToken?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  channelId?: string | null;
  /** Pending invitee user ids (not yet accepted members) */
  pendingInviteeIds?: string[];
  /** Invite row id when the current user has a pending invite to this trip */
  myPendingInviteId?: string | null;
}

export interface TripInvite {
  id: string;
  tripId: string;
  inviterId: string;
  inviteeId: string;
  status: TripInviteStatus;
  createdAt: string;
}

export interface CreateTripInput {
  destinationCity: string;
  destinationCountry: string;
  latitude?: number | null;
  longitude?: number | null;
  dateStart?: string | null;
  dateEnd?: string | null;
  dateLabel?: string | null;
  description?: string | null;
  openToJoin: boolean;
  maxMembers?: number | null;
  inviteeIds: string[];
  notifyFriends: boolean;
}

export interface TripAlbum {
  id: string;
  tripId: string;
  /** Cover / legacy URL list (kept in sync with `photos`). */
  photoUrls: Array<string | number>;
  /** Full album photo records (newest first preferred by API). */
  photos?: AlbumPhoto[];
  followerIds: string[];
}

/** A single photo in a trip album. */
export interface AlbumPhoto {
  id: string;
  albumId: string;
  tripId: string;
  uploaderId: string;
  imageUrl: string | number;
  createdAt: string;
}

export interface ChatReaction {
  emoji: string;
  userIds: string[];
}

export interface ChatMessage {
  id: string;
  channelId?: string;
  dmThreadId?: string;
  senderId: string | null;
  kind: MessageKind;
  body?: string;
  replyToId?: string | null;
  tripId?: string | null;
  pollId?: string | null;
  imageUrl?: string | null;
  postId?: string | null;
  createdAt: string;
  reactions: ChatReaction[];
  metadata?: Record<string, unknown>;
}

export interface FeedPost {
  id: string;
  authorId: string;
  caption: string;
  locationLabel: string;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
  photoUrls: Array<string | number>;
  stampCount: number;
  iStamped: boolean;
  stamperPreviewIds: string[];
  /** carousel (default) or collage */
  displayMode?: 'carousel' | 'collage';
  collageLayoutId?: string | null;
  audience?: 'all' | 'friends' | 'communities';
  audienceCommunityIds?: string[];
  taggedTripId?: string | null;
  taggedUserIds?: string[];
  /** Per-photo crop transforms aligned with photoUrls */
  photoCrops?: Array<{
    scale: number;
    offsetX: number;
    offsetY: number;
  } | null>;
}

export type CreatePostPhotoInput = {
  uri: string | number;
  crop?: { scale: number; offsetX: number; offsetY: number } | null;
};

export type CreatePostInput = {
  caption: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  displayMode: 'carousel' | 'collage';
  collageLayoutId?: string | null;
  audience: 'all' | 'friends' | 'communities';
  audienceCommunityIds?: string[];
  taggedTripId?: string | null;
  taggedUserIds?: string[];
  photos: CreatePostPhotoInput[];
};

export interface FeedAlbumCard {
  albumId: string;
  tripId: string;
  destinationCity: string;
  destinationCountry: string;
  dateStart?: string | null;
  dateEnd?: string | null;
  dateLabel?: string | null;
  ownerId: string;
  memberIds: string[];
  coverUrls: Array<string | number>;
  isFollowing: boolean;
}

export interface DmThread {
  id: string;
  otherUserId: string;
  updatedAt: string;
  lastPreview?: string;
}

export interface ChatNotification {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body?: string;
  data: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

export interface PollData {
  id: string;
  question: string;
  options: { id: string; label: string; votes: number }[];
  myVoteOptionId?: string | null;
}

export type ChatTarget =
  | { type: 'channel'; channelId: string; communityId: string; slug: ChannelSlug }
  | { type: 'trip_channel'; channelId: string; tripId: string }
  | { type: 'dm'; threadId: string; otherUserId: string };
