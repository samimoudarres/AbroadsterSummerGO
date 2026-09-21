import type {
  ChatProfile,
  FeedAlbumCard,
  FeedPost,
  PassportData,
} from '../../data/chatTypes';
import { chatRepo, initChat } from '../chat/repository';
import { collectPrefetchUrls } from '../images/displayUrl';

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
const enrichWaiters = new Map<string, Promise<CachedProfileBundle | null>>();

function prefetchDisplayUrls(urls: string[]) {
  if (!urls.length) return;
  // Single path only — dual RN+expo prefetch on profile open spiked memory.
  void import('expo-image')
    .then(({ Image: ExpoImage }) => ExpoImage.prefetch(urls.slice(0, 12)))
    .catch(() => {});
}

/** After JSON lands, warm a few grid/cover thumbs without blocking paint. */
function prefetchProfileThumbs(bundle: CachedProfileBundle) {
  const postCovers = bundle.posts
    .map((p) => p.photoUrls?.[0])
    .filter(Boolean) as Array<string | number>;
  const albumCovers = bundle.albums.flatMap((a) => a.coverUrls ?? []).slice(0, 6);
  const urls = [
    ...collectPrefetchUrls(postCovers, 'grid', 8),
    ...collectPrefetchUrls(albumCovers, 'cover', 4),
  ];
  // Defer until after the profile UI has mounted.
  setTimeout(() => prefetchDisplayUrls(urls), 400);
}

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
      // Phase 1 — everything needed to paint posts/albums (no friend fan-out yet).
      const [authorPosts, authorAlbums, profile] = await Promise.all([
        chatRepo.listAuthorPosts(userId),
        chatRepo.listAuthorAlbums(userId),
        chatRepo.getProfile(userId),
      ]);

      const fast: CachedProfileBundle = {
        posts: authorPosts,
        albums: authorAlbums,
        chatProfile: profile,
        friendsCount: profileCache.get(userId)?.friendsCount ?? 0,
        isFriend: profileCache.get(userId)?.isFriend ?? false,
        tripNotify: profileCache.get(userId)?.tripNotify ?? false,
        profiles: {
          ...(profileCache.get(userId)?.profiles ?? {}),
          ...(profile ? { [userId]: profile } : {}),
        },
        fetchedAt: Date.now(),
      };
      profileCache.set(userId, fast);
      prefetchProfileThumbs(fast);

      // Phase 2 — friend meta + related profiles (don't block first paint).
      const enrichP = enrichProfileBundle(userId, fast).then(
        () => profileCache.get(userId) ?? fast,
      );
      enrichWaiters.set(userId, enrichP);
      void enrichP.finally(() => {
        if (enrichWaiters.get(userId) === enrichP) enrichWaiters.delete(userId);
      });

      return fast;
    } catch {
      return profileCache.get(userId) ?? null;
    } finally {
      inflight.delete(userId);
    }
  })();

  inflight.set(userId, promise);
  return promise;
}

/** Resolves when friend counts / member avatars finish hydrating (optional). */
export function awaitProfileEnrichment(
  userId: string,
): Promise<CachedProfileBundle | null> {
  return enrichWaiters.get(userId) ?? Promise.resolve(profileCache.get(userId) ?? null);
}

async function enrichProfileBundle(
  userId: string,
  base: CachedProfileBundle,
): Promise<void> {
  try {
    const [friend, notify, friendCount] = await Promise.all([
      chatRepo.isFriend(userId),
      chatRepo.isTripNotifyEnabled(userId),
      chatRepo.countFriendsForUser(userId),
    ]);

    const ids = new Set<string>([userId]);
    for (const p of base.posts) {
      ids.add(p.authorId);
      for (const s of p.stamperPreviewIds ?? []) ids.add(s);
    }
    for (const a of base.albums) {
      ids.add(a.ownerId);
      for (const m of a.memberIds) ids.add(m);
    }

    const profiles: Record<string, ChatProfile> = { ...base.profiles };
    await Promise.all(
      [...ids].map(async (id) => {
        if (profiles[id]) return;
        const p = await chatRepo.getProfile(id);
        if (p) profiles[id] = p;
      }),
    );

    const enriched: CachedProfileBundle = {
      ...base,
      friendsCount: friendCount,
      isFriend: friend,
      tripNotify: notify,
      profiles,
      fetchedAt: Date.now(),
    };
    // Only write if nothing newer replaced this user meanwhile.
    const current = profileCache.get(userId);
    if (!current || current.fetchedAt <= base.fetchedAt) {
      profileCache.set(userId, enriched);
    }
  } catch {
    // keep fast bundle
  }
}

/** Warm own profile in the background so the tab opens instantly. */
export async function warmOwnProfileCache(): Promise<string | null> {
  try {
    await initChat();
    const me = await chatRepo.getMe();
    await fetchProfileBundle(me.id);
    // Passport is heavier and not needed for first Profile paint — defer it.
    setTimeout(() => {
      void (async () => {
        try {
          const passport = await chatRepo.getPassport(me.id);
          setCachedPassport(me.id, passport);
        } catch {
          // optional
        }
      })();
    }, 2500);
    return me.id;
  } catch {
    return null;
  }
}
