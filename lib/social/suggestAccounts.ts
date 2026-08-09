import type { ChatProfile } from '../../data/chatTypes';

export type SuggestedAccount = {
  profile: ChatProfile;
  score: number;
  homeUniversity: string;
  studyAbroadProgram: string;
  reason?: string;
};

function norm(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase();
}

function schoolMatch(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Rank non-friend candidates for "Suggested accounts".
 * Mirrors SQL `suggest_accounts`: same program / home school / mutuals first,
 * then always fills with general accounts so the list is never empty when
 * other profiles exist.
 */
export function scoreSuggestedAccounts(opts: {
  me: ChatProfile;
  candidates: ChatProfile[];
  friendIds: Set<string> | string[];
  blockedIds?: Set<string> | string[];
  /** userId → friendIds of that user (for mutual/shared friends) */
  friendsOf?: Map<string, string[]>;
  /** userId → profile lookup for mutual school/program checks */
  profilesById?: Map<string, ChatProfile>;
  /** userId → community ids */
  communitiesOf?: Map<string, string[]>;
  myCommunityIds?: string[];
  /** userId → passport/visited city keys */
  citiesOf?: Map<string, string[]>;
  myCities?: string[];
  limit?: number;
}): SuggestedAccount[] {
  const friendSet =
    opts.friendIds instanceof Set
      ? opts.friendIds
      : new Set(opts.friendIds);
  const blocked =
    opts.blockedIds instanceof Set
      ? opts.blockedIds
      : new Set(opts.blockedIds ?? []);
  const myCities = new Set((opts.myCities ?? []).map(norm).filter(Boolean));
  const myCommunities = new Set(opts.myCommunityIds ?? []);
  const limit = opts.limit ?? 50;

  const scored: SuggestedAccount[] = [];
  for (const p of opts.candidates) {
    if (!p?.id || p.id === opts.me.id) continue;
    if (friendSet.has(p.id) || blocked.has(p.id)) continue;

    let score = 1; // floor so every non-friend can appear as a general suggestion
    let reason = 'Suggested for you';

    const sameAbroad = schoolMatch(
      p.studyAbroadProgram,
      opts.me.studyAbroadProgram,
    );
    const sameHome = schoolMatch(p.homeUniversity, opts.me.homeUniversity);

    if (sameAbroad) {
      score += 95;
      reason = 'Same study abroad program';
    }
    if (sameHome) {
      score += 100;
      if (!sameAbroad) reason = 'Same home school';
    }

    const theirFriends = opts.friendsOf?.get(p.id) ?? [];
    let shared = 0;
    let mutualAtHome = 0;
    let mutualAtAbroad = 0;
    for (const fid of theirFriends) {
      if (!friendSet.has(fid)) continue;
      shared += 1;
      const fp = opts.profilesById?.get(fid);
      if (fp && schoolMatch(fp.homeUniversity, opts.me.homeUniversity)) {
        mutualAtHome += 1;
      }
      if (fp && schoolMatch(fp.studyAbroadProgram, opts.me.studyAbroadProgram)) {
        mutualAtAbroad += 1;
      }
    }
    if (shared > 0) {
      score += shared * 30;
      if (!sameAbroad && !sameHome) {
        reason = `${shared} mutual friend${shared === 1 ? '' : 's'}`;
      }
    }
    score += mutualAtHome * 40;
    score += mutualAtAbroad * 40;

    const theirCommunities = opts.communitiesOf?.get(p.id) ?? [];
    let sharedCommunity = false;
    for (const cid of theirCommunities) {
      if (myCommunities.has(cid)) {
        sharedCommunity = true;
        break;
      }
    }
    if (sharedCommunity) {
      score += 55;
      if (!sameAbroad && !sameHome && shared === 0) {
        reason = 'From your school communities';
      }
    }

    if (
      norm(p.hostCity) &&
      norm(opts.me.hostCity) &&
      schoolMatch(p.hostCity || '', opts.me.hostCity || '')
    ) {
      score += 35;
    }

    const theirCities = (opts.citiesOf?.get(p.id) ?? []).map(norm);
    let cityOverlap = 0;
    for (const c of theirCities) {
      if (c && myCities.has(c)) cityOverlap += 1;
    }
    if (cityOverlap > 0) score += cityOverlap * 12;

    scored.push({
      profile: p,
      score,
      homeUniversity: p.homeUniversity || '',
      studyAbroadProgram: p.studyAbroadProgram || '',
      reason,
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.profile.fullName || '').localeCompare(b.profile.fullName || '');
  });
  return scored.slice(0, limit);
}
