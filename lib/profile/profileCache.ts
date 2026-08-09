import type {
  ChatProfile,
  FeedAlbumCard,
  FeedPost,
  PassportData,
} from '../../data/chatTypes';
import { chatRepo, initChat } from '../chat/repository';

export type CachedProfileBundle = {
  posts: FeedPost[];
  albums: FeedAlbumCard[];
  chatProfile: ChatProfile | null;
  friendsCount: number;
  isFriend: boolean;
  tripNotify: boolean;
  profiles: Record<string, ChatProfile>;
  fetchedAt: number;
};

const profileCache = new Map<string, CachedProfileBundle>();
const passportCache = new Map<
  string,
  { data: PassportData; fetchedAt: number }
>();
const inflight = new Map<string, Promise<CachedProfileBundle | null>>();

export function getCachedProfile(
  userId: string,
): CachedProfileBundle | undefined {
  return profileCache.get(userId);
}

export function setCachedProfile(
  userId: string,
  bundle: CachedProfileBundle,
): void {
  profileCache.set(userId, bundle);
}

export function getCachedPassport(
  userId: string,
): PassportData | undefined {
  return passportCache.get(userId)?.data;
}

export function setCachedPassport(userId: string, data: PassportData): void {
  passportCache.set(userId, { data, fetchedAt: Date.now() });
}

/** Fetch + cache profile grid data (posts, albums, friend meta). */
export async function fetchProfileBundle(
  userId: string,
): Promise<CachedProfileBundle | null> {
  const existing = inflight.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      await initChat();
      const [authorPosts, authorAlbums, profile, friend, notify, friendCount] =
        await Promise.all([
          chatRepo.listAuthorPosts(userId),
          chatRepo.listAuthorAlbums(userId),
          chatRepo.getProfile(userId),
          chatRepo.isFriend(userId),
          chatRepo.isTripNotifyEnabled(userId),
          chatRepo.countFriendsForUser(userId),
        ]);

      const ids = new Set<string>([userId]);
      for (const p of authorPosts) {
        ids.add(p.authorId);
        for (const s of p.stamperPreviewIds ?? []) ids.add(s);
      }
      for (const a of authorAlbums) {
        ids.add(a.ownerId);
        for (const m of a.memberIds) ids.add(m);
      }
      const profiles: Record<string, ChatProfile> = {};
      await Promise.all(
        [...ids].map(async (id) => {
          const p = await chatRepo.getProfile(id);
          if (p) profiles[id] = p;
        }),
      );

      const bundle: CachedProfileBundle = {
        posts: authorPosts,
        albums: authorAlbums,
        chatProfile: profile,
        friendsCount: friendCount,
        isFriend: friend,
        tripNotify: notify,
        profiles,
        fetchedAt: Date.now(),
      };
      profileCache.set(userId, bundle);
      return bundle;
    } catch {
      return profileCache.get(userId) ?? null;
    } finally {
      inflight.delete(userId);
    }
  })();

  inflight.set(userId, promise);
  return promise;
}

/** Warm own profile in the background so the tab opens instantly. */
export async function warmOwnProfileCache(): Promise<string | null> {
  try {
    await initChat();
    const me = await chatRepo.getMe();
    await fetchProfileBundle(me.id);
    try {
      const passport = await chatRepo.getPassport(me.id);
      setCachedPassport(me.id, passport);
    } catch {
      // passport optional for first paint
    }
    return me.id;
  } catch {
    return null;
  }
}
