/**
 * First-3 home-feed visits: curated Abroadster posts interleaved with recent
 * public/friend posts, then normal ranking after that.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeedPost } from '../../data/chatTypes';
import {
  ABROADSTER_CURATED_POST_IDS,
  ABROADSTER_OFFICIAL_ID,
} from '../social/abroadsterOfficial';

const VISIT_KEY_PREFIX = 'abroadster.homeFeedVisits.';
const CURATED_VISIT_LIMIT = 3;

/** Once per JS runtime / app session — avoids double-counting remounts. */
const sessionRecorded = new Set<string>();

export function homeFeedVisitStorageKey(userId: string): string {
  return `${VISIT_KEY_PREFIX}${userId}`;
}

export async function getHomeFeedVisitCount(userId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(homeFeedVisitStorageKey(userId));
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/**
 * Increment visit count at most once per app session for this user.
 * Returns the visit number for this open (1, 2, 3, …).
 */
export async function recordHomeFeedVisit(userId: string): Promise<number> {
  if (!userId) return 0;
  if (sessionRecorded.has(userId)) {
    return getHomeFeedVisitCount(userId);
  }
  sessionRecorded.add(userId);
  const prev = await getHomeFeedVisitCount(userId);
  const next = prev + 1;
  try {
    await AsyncStorage.setItem(homeFeedVisitStorageKey(userId), String(next));
  } catch {
    // still return next for this session
  }
  return next;
}

export function isCuratedHomeFeedVisit(visitCount: number): boolean {
  return visitCount > 0 && visitCount <= CURATED_VISIT_LIMIT;
}

/**
 * Build: Abroadster create-trip, newest user post, Abroadster make-post,
 * 2nd newest user post, Abroadster join, then remaining ranked posts.
 */
export function applyCuratedOnboardingFeed(
  rankedFeed: FeedPost[],
  officialPosts: FeedPost[],
): FeedPost[] {
  const byId = new Map<string, FeedPost>();
  for (const p of [...officialPosts, ...rankedFeed]) {
    if (p?.id) byId.set(p.id, p);
  }

  const createTrip = byId.get(ABROADSTER_CURATED_POST_IDS.createTrip);
  const makePost = byId.get(ABROADSTER_CURATED_POST_IDS.makePost);
  const joinEveryone = byId.get(ABROADSTER_CURATED_POST_IDS.joinEveryone);

  const curatedIds = new Set<string>([
    ABROADSTER_CURATED_POST_IDS.createTrip,
    ABROADSTER_CURATED_POST_IDS.makePost,
    ABROADSTER_CURATED_POST_IDS.joinEveryone,
  ]);

  const userPosts = rankedFeed.filter(
    (p) =>
      p.authorId !== ABROADSTER_OFFICIAL_ID && !curatedIds.has(p.id),
  );

  const out: FeedPost[] = [];
  const used = new Set<string>();

  const push = (p: FeedPost | undefined) => {
    if (!p || used.has(p.id)) return;
    used.add(p.id);
    out.push(p);
  };

  push(createTrip);
  push(userPosts[0]);
  push(makePost);
  push(userPosts[1]);
  push(joinEveryone);

  for (const p of rankedFeed) {
    push(p);
  }
  // Official posts that weren't in ranked feed but we fetched
  for (const p of officialPosts) {
    push(p);
  }

  return out;
}
