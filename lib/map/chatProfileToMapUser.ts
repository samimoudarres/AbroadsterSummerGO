import type { ChatProfile } from '../../data/chatTypes';
import type { UserProfile } from '../../data/types';
import { resolveProfileMapCoords } from './resolveProfileCoords';

/** Map a live/demo chat profile onto a map pin at their accurate host/program location. */
export function chatProfileToMapUser(
  p: ChatProfile,
  opts?: {
    isFriend?: boolean;
    isCurrentUser?: boolean;
    liveLat?: number | null;
    liveLng?: number | null;
  },
): UserProfile | null {
  const privacy = p.locationPrivacy ?? 'exact';
  const allowLive = privacy === 'exact';
  const liveLat = allowLive ? opts?.liveLat ?? p.liveLatitude ?? null : null;
  const liveLng = allowLive ? opts?.liveLng ?? p.liveLongitude ?? null : null;
  if (privacy === 'hidden' && !opts?.isCurrentUser) {
    return null;
  }
  const resolved = resolveProfileMapCoords({
    id: p.id,
    hostCity: p.hostCity,
    hostCountry: p.hostCountry,
    studyAbroadProgram: p.studyAbroadProgram,
    hostLatitude: p.hostLatitude,
    hostLongitude: p.hostLongitude,
    liveLatitude: liveLat,
    liveLongitude: liveLng,
    liveLocationLabel: allowLive ? p.liveLocationLabel : null,
    isCurrentUser: opts?.isCurrentUser,
  });
  if (!resolved) return null;

  const city = (p.hostCity || '').trim();
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: p.fullName,
    avatar: (p.avatar as any) ?? null,
    homeUniversity: p.homeUniversity || '',
    studyAbroadProgram: p.studyAbroadProgram || '',
    hostCity: city || resolved.locationLabel.split(',')[0] || 'Abroad',
    hostCountry: p.hostCountry || '',
    semester: p.semester || '',
    bio: p.bio ?? undefined,
    countriesVisited: 0,
    isFriend: opts?.isCurrentUser ? true : Boolean(opts?.isFriend),
    isCurrentUser: Boolean(opts?.isCurrentUser),
    locationPrivacy: privacy,
    liveLatitude: liveLat,
    liveLongitude: liveLng,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    locationLabel: resolved.locationLabel,
    passportBadges: [],
    albums: [],
    posts: [],
    isVerifiedStudent: p.isVerifiedStudent,
  };
}
