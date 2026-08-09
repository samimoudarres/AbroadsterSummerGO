export type PinStatus = 'here' | 'upcoming' | 'planning' | 'past';
export type LocationPrivacy = 'exact' | 'city' | 'hidden';

export type MapLayerFilter =
  | 'all'
  | 'here'
  | 'upcoming'
  | 'planning'
  | 'programs';

export type MapStyleMode = 'regular' | 'satellite';

export type ImageSource = number | string;

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatar: ImageSource;
  homeUniversity: string;
  studyAbroadProgram: string;
  hostCity: string;
  hostCountry: string;
  semester: string;
  instagram?: string;
  bio?: string;
  countriesVisited: number;
  isFriend: boolean;
  /** True for the signed-in user — always shown on the map as their profile pin. */
  isCurrentUser?: boolean;
  /**
   * exact = live GPS when permission granted
   * city = host / selected city only
   * hidden = not shown on map
   */
  locationPrivacy: LocationPrivacy;
  /** Last resolved / stored map coordinates (always what the map should plot). */
  latitude: number;
  longitude: number;
  locationLabel: string;
  /** Live device GPS when user shares exact location (production). */
  liveLatitude?: number | null;
  liveLongitude?: number | null;
  /** Coarse/approximate location from OS when precise is denied. */
  approximateLatitude?: number | null;
  approximateLongitude?: number | null;
  newPosts?: number;
  passportBadges: string[];
  albums: ProfileAlbum[];
  posts: ProfilePost[];
  /** Set when the account used a valid .edu school email at signup. */
  isVerifiedStudent?: boolean;
}

export interface ProfileAlbum {
  id: string;
  title: string;
  cover: ImageSource;
  locationName: string;
  latitude: number;
  longitude: number;
  photos: ImageSource[];
}

export interface ProfilePost {
  id: string;
  image: ImageSource;
  locationName: string;
  caption: string;
}

export interface TripMember {
  userId: string;
  firstName: string;
  avatar: ImageSource;
}

export interface TripPin {
  id: string;
  memberIds: string[];
  members: TripMember[];
  status: 'upcoming' | 'planning' | 'past';
  openToJoin: boolean;
  destinationCity: string;
  destinationCountry: string;
  latitude: number;
  longitude: number;
  dateLabel: string;
  dateStart?: string;
  dateEnd?: string;
  homeBaseCity?: string;
}

export interface ProgramPin {
  id: string;
  name: string;
  shortName: string;
  logo: ImageSource;
  latitude: number;
  longitude: number;
  studentCount: number;
  city: string;
  country: string;
  accent?: string;
}

export interface FilterChip {
  id: string;
  label: string;
  type: 'program' | 'university';
  accent: string;
  subtitle?: string;
  logo?: ImageSource;
}

export interface MapListPersonItem {
  kind: 'person';
  id: string;
  user: UserProfile;
  status: PinStatus;
  statusLabel: string;
  detailLabel: string;
  newPosts?: number;
}

export interface MapListTripItem {
  kind: 'trip';
  id: string;
  trip: TripPin;
  status: PinStatus;
  statusLabel: string;
  detailLabel: string;
  title: string;
}

export interface MapListProgramItem {
  kind: 'program';
  id: string;
  program: ProgramPin;
}

export interface MapListPlaceItem {
  kind: 'place';
  id: string;
  placeName: string;
  cityName: string;
  countryName: string;
  latitude: number;
  longitude: number;
}

export type MapListItem =
  | MapListPersonItem
  | MapListTripItem
  | MapListProgramItem
  | MapListPlaceItem;

export interface MapViewportStats {
  cityName: string;
  countryName: string;
  studentsNearby: number;
  friendsStudyingHere: number;
}
