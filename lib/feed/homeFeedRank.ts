import type { ChatProfile, FeedPost } from '../../data/chatTypes';

export type FeedRankContext = {
  meId: string;
  me: Pick<ChatProfile, 'homeUniversity' | 'studyAbroadProgram'>;
  friendIds: Set<string>;
};

/**
 * Home feed ranking: recent posts rise fast; your own fresh posts pin to the
 * top so a new share appears first. Friends / schools / stamps still boost.
 */
export function scoreHomeFeedPost(
  post: FeedPost,
  author: Pick<ChatProfile, 'homeUniversity' | 'studyAbroadProgram'> | null | undefined,
  ctx: FeedRankContext,
): number {
  const hours = Math.max(
    0,
    (Date.now() - new Date(post.createdAt).getTime()) / 3600_000,
  );
  // ~1000 when brand-new, ~500 at 12h, ~200 at ~2d, fades after a week
  const recency = 1000 / (1 + hours / 12);

  let score = recency;
  if (post.authorId === ctx.meId) {
    // Soft-pin own posts from the last 6h so create → home lands at #1
    score += hours <= 6 ? 2500 : 600;
  }
  if (ctx.friendIds.has(post.authorId)) score += 450;
  if (
    author?.studyAbroadProgram &&
    ctx.me.studyAbroadProgram &&
    author.studyAbroadProgram === ctx.me.studyAbroadProgram
  ) {
    score += 250;
  }
  if (
    author?.homeUniversity &&
    ctx.me.homeUniversity &&
    author.homeUniversity === ctx.me.homeUniversity
  ) {
    score += 120;
  }
  score += (post.stampCount ?? 0) * 4;
  return score;
}

export function sortHomeFeedPosts(
  posts: FeedPost[],
  scoreOf: (p: FeedPost) => number,
): FeedPost[] {
  return [...posts].sort((a, b) => {
    const sb = scoreOf(b);
    const sa = scoreOf(a);
    if (sb !== sa) return sb - sa;
    return (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });
}
