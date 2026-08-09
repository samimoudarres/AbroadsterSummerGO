import { hasSupabase, supabase } from '../supabase';
import { demoChat, loadDemoState, subscribeDemo, DEMO_ME_ID } from './demoStore';
import { defaultAvatarUrl } from '../images';
import type {
  AlbumPhoto,
  ChatChannel,
  ChatCommunity,
  ChatMessage,
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
  TripChannel,
} from '../../data/chatTypes';
import { shortWeekdayRange, tripChatTitle } from '../trips/dates';
import { usablePostPhotos } from '../feed/feedPhotos';
import { DEFAULT_CROP } from '../feed/collageLayouts';
import { ALBUM_PLACEHOLDER_PHOTOS } from '../trips/albumPlaceholders';
import { computeExplorerScoreMiles } from '../explorerScore';
import {
  getLocalStudyPrograms,
  getProgramByName,
  programToPin,
  resolveSchoolVisual as resolveSchoolVisualLocal,
  searchInstitutionsLocal,
  type CatalogInstitution,
} from '../schools/catalog';
import { coordsForHostPersistence } from '../map/resolveProfileCoords';
import {
  ensureHostCity,
  passportForUser,
  type StoredCity,
  type StoredUnlock,
} from '../passport/demoPassport';
import { countryKeyFromName } from '../passport/countries';

export { DEMO_ME_ID };

/** Auth user id when signed into Supabase (hybrid with demo directory). */
let cachedAuthUserId: string | null = null;

/** True when this sender is the person currently using the app. */
export function isOwnSender(
  senderId: string | null | undefined,
  meId: string | null | undefined,
): boolean {
  if (!senderId) return false;
  if (meId && senderId === meId) return true;
  // Demo-store messages use user-me; live session uses a UUID — same person in hybrid mode
  if (senderId === DEMO_ME_ID) return true;
  if (meId === DEMO_ME_ID && cachedAuthUserId && senderId === cachedAuthUserId) {
    return true;
  }
  if (cachedAuthUserId && senderId === cachedAuthUserId) return true;
  return false;
}

/** Normalize member id lists from RPC/jsonb (array, stringified JSON, or {user_id} rows). */
export function normalizeMemberIds(ids: unknown): string[] {
  if (!ids) return [];
  if (typeof ids === 'string') {
    const trimmed = ids.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        return normalizeMemberIds(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }
    return [trimmed];
  }
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const item of ids) {
    if (typeof item === 'string' && item) out.push(item);
    else if (item && typeof item === 'object') {
      const id =
        (item as { user_id?: string; userId?: string; id?: string }).user_id ||
        (item as { userId?: string }).userId ||
        (item as { id?: string }).id;
      if (typeof id === 'string' && id) out.push(id);
    }
  }
  return out;
}

/**
 * True when the viewer owns or is already on this trip.
 * Uses auth cache so join CTAs stay hidden even before React meId state loads.
 */
export function isTripParticipant(
  trip: {
    ownerId?: string | null;
    memberIds?: unknown;
    myJoinStatus?: string | null;
  } | null | undefined,
  meId?: string | null,
): boolean {
  if (!trip) return false;
  if (trip.myJoinStatus === 'accepted') return true;
  if (isOwnSender(trip.ownerId, meId)) return true;
  return normalizeMemberIds(trip.memberIds).some((id) =>
    isOwnSender(id, meId),
  );
}

/** Use live Supabase only when keys exist AND a user session is present. */
async function useLive(): Promise<boolean> {
  if (!hasSupabase || !supabase) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return Boolean(session?.user);
}

/** Demo directory ids are like user-chelsea / dm-abc123 — not Postgres UUIDs. */
function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

function isDemoTarget(target: ChatTarget): boolean {
  if (target.type === 'dm') return !isUuid(target.threadId);
  return !isUuid(target.channelId);
}

export const chatMeId = () => (hasSupabase ? undefined : DEMO_ME_ID);

export { allowDemoSeedMerge } from '../demoFlags';
import { allowDemoSeedMerge } from '../demoFlags';

export async function initChat() {
  // Live session: ensure profile first; defer demo hydrate (E8)
  if (hasSupabase && supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      await ensureMyProfile();
      // Do not hydrate demo seed while a real account is signed in.
      return;
    }
  }
  // Offline / welcome — load local demo directory
  await loadDemoState();
}

/** Create/backfill the signed-in user's profile + default avatar_url (Instagram-style). */
async function ensureMyProfile(): Promise<void> {
  if (!hasSupabase || !supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  cachedAuthUserId = user.id;

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const meta = user.user_metadata ?? {};
  const firstName =
    (meta.first_name as string) ||
    (meta.full_name as string)?.split(' ')[0] ||
    user.email?.split('@')[0] ||
    'Abroadster';
  const lastName =
    (meta.last_name as string) ||
    (meta.full_name as string)?.split(' ').slice(1).join(' ') ||
    '';
  const fullName =
    (meta.full_name as string) ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    firstName;
  // Never invent UT Austin / NYU — only schools the user actually selected (auth metadata)
  const homeUniversity = String(meta.home_university ?? '').trim();
  const studyAbroadProgram = String(meta.study_abroad_program ?? '').trim();
  const homeVisual = homeUniversity
    ? resolveSchoolVisualLocal({ name: homeUniversity })
    : null;
  const abroadVisual = studyAbroadProgram
    ? resolveSchoolVisualLocal({ name: studyAbroadProgram })
    : null;
  const avatarUrl =
    (existing?.avatar_url as string | null) ||
    (meta.avatar_url as string) ||
    defaultAvatarUrl(fullName);

  if (!existing) {
    // profiles.home_university / study_abroad_program are NOT NULL — only insert when we
    // have real schools (auth trigger usually created the row already).
    if (homeUniversity && studyAbroadProgram) {
      await supabase.from('profiles').insert({
        id: user.id,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        avatar_url: avatarUrl,
        home_university: homeUniversity,
        study_abroad_program: studyAbroadProgram,
        home_accent: homeVisual?.accent || '#175864',
        abroad_accent: abroadVisual?.accent || '#175864',
        phone_number: (meta.phone_number as string) || null,
        date_of_birth: (meta.date_of_birth as string) || null,
        student_email: (meta.student_email as string) || null,
        is_verified_student: Boolean(meta.is_verified_student),
        login_email: user.email ?? null,
      });
    }
  } else {
    const patch: Record<string, unknown> = {};
    if (!existing.avatar_url) patch.avatar_url = avatarUrl;
    // Backfill schools from auth metadata when profile row is missing them
    if (homeUniversity && !String(existing.home_university ?? '').trim()) {
      patch.home_university = homeUniversity;
      if (homeVisual?.accent) patch.home_accent = homeVisual.accent;
    }
    if (
      studyAbroadProgram &&
      !String(existing.study_abroad_program ?? '').trim()
    ) {
      patch.study_abroad_program = studyAbroadProgram;
      if (abroadVisual?.accent) patch.abroad_accent = abroadVisual.accent;
    }
    if (Object.keys(patch).length) {
      await supabase.from('profiles').update(patch).eq('id', user.id);
    }
  }

  // Always auto-join home + abroad school chats when schools exist
  const { data: latest } = await supabase
    .from('profiles')
    .select('home_university, study_abroad_program')
    .eq('id', user.id)
    .maybeSingle();
  const home =
    String(latest?.home_university ?? '').trim() || homeUniversity;
  const abroad =
    String(latest?.study_abroad_program ?? '').trim() || studyAbroadProgram;
  if (home || abroad) {
    try {
      await supabase.rpc('sync_profile_communities', { p_user_id: user.id });
    } catch {
      // 020 / 022 may not be applied yet
    }
  }
}

/** Normalize jsonb / array RPC payloads from Supabase. */
function asRpcRows(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Refresh accent/logo from the community's real name.
 * Does NOT rename communities (avoids showing Duke on a UT Austin channel).
 */
function decorateCommunityVisuals(
  communities: ChatCommunity[],
): ChatCommunity[] {
  return communities.map((c) => {
    const v = resolveSchoolVisualLocal({ name: c.name });
    return {
      ...c,
      accent: v.accent || c.accent,
      logoUri: v.logoUrl || c.logoUri,
    };
  });
}

/** Prefer one abroad + one home community (matching profile names when possible). */
function pickPrimarySchoolCommunities(
  communities: ChatCommunity[],
  me: ChatProfile,
): ChatCommunity[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const abroad =
    communities.find(
      (c) =>
        c.kind === 'abroad' &&
        me.studyAbroadProgram &&
        norm(c.name) === norm(me.studyAbroadProgram),
    ) ?? communities.find((c) => c.kind === 'abroad');
  const home =
    communities.find(
      (c) =>
        c.kind === 'home' &&
        me.homeUniversity &&
        norm(c.name) === norm(me.homeUniversity),
    ) ?? communities.find((c) => c.kind === 'home');
  return [abroad, home].filter(Boolean) as ChatCommunity[];
}

async function uriToDataUrl(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    if (typeof FileReader !== 'undefined') {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // fall through to legacy FileSystem (native file:// URIs)
  }
  const FileSystem = await import('expo-file-system/legacy');
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const mime =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

function isBucketMissingError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
  const status = (err as any)?.statusCode ?? (err as any)?.status;
  return (
    msg.includes('bucket') && msg.includes('not found')
  ) || status === 404 || msg.includes('bucket not found');
}

function mapPassportPayload(data: any): PassportData {
  const unlocks = Array.isArray(data?.unlocks) ? data.unlocks : [];
  const cities = Array.isArray(data?.cities) ? data.cities : [];
  return {
    unlocks: unlocks.map((u: any) => ({
      countryKey: u.country_key ?? u.countryKey,
      countryName: u.country_name ?? u.countryName,
      unlockedAt: u.unlocked_at ?? u.unlockedAt,
      sourceTripId: u.source_trip_id ?? u.sourceTripId ?? null,
    })),
    cities: cities.map((c: any) => ({
      id: c.id,
      cityName: c.city_name ?? c.cityName,
      countryName: c.country_name ?? c.countryName ?? '',
      sortOrder: c.sort_order ?? c.sortOrder ?? 0,
      source: c.source,
      tripId: c.trip_id ?? c.tripId ?? null,
      latitude: c.latitude ?? null,
      longitude: c.longitude ?? null,
    })),
  };
}

/** Normalize live notification JSON keys so the UI can read camelCase. */
function normalizeNotificationData(data: Record<string, unknown> | null | undefined) {
  const d = data ?? {};
  return {
    ...d,
    fromUserId:
      (d.fromUserId as string) ||
      (d.from_user_id as string) ||
      (d.ownerId as string) ||
      (d.owner_id as string) ||
      (d.inviterId as string) ||
      (d.inviter_id as string) ||
      (d.requesterId as string) ||
      (d.requester_id as string) ||
      undefined,
    tripId: (d.tripId as string) || (d.trip_id as string) || undefined,
    postId: (d.postId as string) || (d.post_id as string) || undefined,
    albumId: (d.albumId as string) || (d.album_id as string) || undefined,
    ownerId: (d.ownerId as string) || (d.owner_id as string) || undefined,
    inviterId: (d.inviterId as string) || (d.inviter_id as string) || undefined,
    inviteId: (d.inviteId as string) || (d.invite_id as string) || undefined,
    requestId: (d.requestId as string) || (d.request_id as string) || undefined,
    requesterId:
      (d.requesterId as string) || (d.requester_id as string) || undefined,
    inviteeId: (d.inviteeId as string) || (d.invitee_id as string) || undefined,
  };
}

function onlyUuids(ids: string[] | null | undefined): string[] {
  return (ids ?? []).filter((id) => typeof id === 'string' && isUuid(id));
}

async function persistHostPassportDirect(
  userId: string,
  hostCity: string,
  hostCountry: string | null | undefined,
): Promise<void> {
  if (!supabase) return;
  const city = hostCity.trim();
  if (!city) return;
  const country = (hostCountry ?? '').trim();
  const key = countryKeyFromName(country);

  if (key) {
    await supabase.from('passport_country_unlocks').upsert(
      {
        user_id: userId,
        country_key: key,
        country_name: country || key,
        unlocked_at: new Date().toISOString(),
        source_trip_id: null,
      },
      { onConflict: 'user_id,country_key' },
    );
  }

  const { data: existing } = await supabase
    .from('passport_city_ranks')
    .select('id, sort_order')
    .eq('user_id', userId)
    .ilike('city_name', city)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    if ((existing.sort_order ?? 0) !== 0) {
      const { data: others } = await supabase
        .from('passport_city_ranks')
        .select('id, sort_order')
        .eq('user_id', userId)
        .neq('id', existing.id);
      for (const row of others ?? []) {
        await supabase
          .from('passport_city_ranks')
          .update({ sort_order: (row.sort_order ?? 0) + 1 })
          .eq('id', row.id);
      }
      await supabase
        .from('passport_city_ranks')
        .update({
          sort_order: 0,
          source: 'host',
          country_name: country || undefined,
          trip_id: null,
        })
        .eq('id', existing.id);
    }
    return;
  }

  const { data: all } = await supabase
    .from('passport_city_ranks')
    .select('id, sort_order')
    .eq('user_id', userId);
  for (const row of all ?? []) {
    await supabase
      .from('passport_city_ranks')
      .update({ sort_order: (row.sort_order ?? 0) + 1 })
      .eq('id', row.id);
  }
  await supabase.from('passport_city_ranks').insert({
    user_id: userId,
    city_name: city,
    country_name: country,
    sort_order: 0,
    source: 'host',
    trip_id: null,
  });
}

const chatListeners = new Set<() => void>();

/** Notify hybrid/demo + live UI listeners (messages, trips, nav badges). */
export function notifyChatListeners() {
  chatListeners.forEach((l) => l());
  // Demo bus still drives offline / seed-directory updates
}

export function subscribeChat(listener: () => void) {
  chatListeners.add(listener);
  const unsubDemo = subscribeDemo(listener);
  return () => {
    chatListeners.delete(listener);
    unsubDemo();
  };
}

const MESSAGE_PAGE_SIZE = 50;

/** Live postgres_changes on the active thread; falls back to no-op cleanup. */
export function subscribeMessages(
  target: ChatTarget,
  onChange: () => void,
): () => void {
  let cancelled = false;
  let channel: { unsubscribe: () => void } | null = null;

  void (async () => {
    if (cancelled) return;
    if (!(await useLive()) || isDemoTarget(target) || !supabase) {
      // Demo: any store emit refreshes the open thread
      return;
    }
    const filter =
      target.type === 'dm'
        ? `dm_thread_id=eq.${target.threadId}`
        : `channel_id=eq.${target.channelId}`;
    const ch = supabase
      .channel(`messages:${filter}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter,
        },
        () => {
          if (!cancelled) onChange();
        },
      )
      .subscribe();
    channel = {
      unsubscribe: () => {
        void supabase!.removeChannel(ch);
      },
    };
  })();

  return () => {
    cancelled = true;
    channel?.unsubscribe();
  };
}

export const chatRepo = {
  async getMe(): Promise<ChatProfile> {
    if (!(await useLive())) return demoChat.getMe();
    const {
      data: { user },
    } = await supabase!.auth.getUser();
    if (!user) return demoChat.getMe();
    cachedAuthUserId = user.id;
    await ensureMyProfile();
    const { data, error } = await supabase!
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error || !data) throw error ?? new Error('No profile');
    return mapProfile(data);
  },

  async getProfile(userId: string) {
    if (!isUuid(userId) || !(await useLive())) {
      return demoChat.getProfile(userId);
    }
    const { data } = await supabase!.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) return mapProfile(data);
    return demoChat.getProfile(userId);
  },

  async listProfiles() {
    if (!(await useLive())) return demoChat.listProfiles();
    const { data } = await supabase!.from('profiles').select('*');
    return (data ?? []).map(mapProfile);
  },

  /**
   * Every Abroadster profile at a home university or study-abroad program
   * (map school filter — not friends-only). Prefers the security-definer RPC.
   */
  async listStudentsAtSchool(opts: {
    kind: 'program' | 'university';
    label: string;
    limit?: number;
  }): Promise<{ profiles: ChatProfile[]; total: number }> {
    const label = (opts.label || '').trim();
    const kind = opts.kind;
    const limit = opts.limit ?? 500;
    if (!label) return { profiles: [], total: 0 };

    const { schoolMatchAliases, matchesStudyProgram, matchesHomeUniversity } =
      await import('../schools/matchSchool');
    const aliases = schoolMatchAliases(kind, label);

    const matchClient = (p: ChatProfile) =>
      kind === 'program'
        ? matchesStudyProgram(p.studyAbroadProgram || '', label)
        : matchesHomeUniversity(p.homeUniversity || '', label);

    if ((await useLive()) && supabase) {
      try {
        const [{ data: rows, error: listErr }, { data: countRaw, error: countErr }] =
          await Promise.all([
            supabase.rpc('list_students_at_school', {
              p_kind: kind,
              p_label: label,
              p_limit: limit,
              p_aliases: aliases,
            }),
            supabase.rpc('count_students_at_school', {
              p_kind: kind,
              p_label: label,
              p_aliases: aliases,
            }),
          ]);
        if (!listErr && Array.isArray(rows)) {
          const profiles = rows.map(mapProfile);
          const total =
            !countErr && typeof countRaw === 'number'
              ? countRaw
              : profiles.length;
          return { profiles, total };
        }
      } catch {
        // fall through to client scan
      }
      try {
        const all = await this.listProfiles();
        const matched = all.filter(matchClient);
        return {
          profiles: matched.slice(0, limit),
          total: matched.length,
        };
      } catch {
        // fall through to demo
      }
    }

    const all = await demoChat.listProfiles();
    const matched = all.filter(matchClient);
    return {
      profiles: matched.slice(0, limit),
      total: matched.length,
    };
  },

  async getMyCommunities(): Promise<ChatCommunity[]> {
    if (!(await useLive())) return demoChat.getMyCommunities();
    // ensureMyProfile backfills schools from auth metadata + syncs memberships
    let me = await this.getMe();

    const sortPills = (list: ChatCommunity[]) =>
      decorateCommunityVisuals(pickPrimarySchoolCommunities(list, me)).sort(
        (a, b) => (a.kind === 'abroad' ? -1 : 1),
      );

    // Preferred path: security-definer RPC auto-joins home + abroad and returns them
    try {
      const { data, error } = await supabase!.rpc('get_my_school_communities');
      const rows = asRpcRows(data);
      if (!error && rows.length > 0) {
        const mapped = rows.map((c: any) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          accent: c.accent,
          logoUri: c.logo_url ?? null,
          channelIds: (c.channel_ids ?? {}) as ChatCommunity['channelIds'],
        })) as ChatCommunity[];
        return sortPills(mapped);
      }
    } catch {
      // fall through to sync + table read
    }

    try {
      await supabase!.rpc('sync_profile_communities', { p_user_id: me.id });
    } catch {
      // migration may not be applied
    }

    // Re-read profile after sync/backfill (schools may have been written from metadata)
    me = await this.getMe();

    // ensure_community creates the school chat; membership join requires sync RPC (RLS)
    const pairs: Array<{
      name: string;
      kind: 'home' | 'abroad';
      accent: string;
    }> = [];
    if (me.studyAbroadProgram?.trim()) {
      pairs.push({
        name: me.studyAbroadProgram.trim(),
        kind: 'abroad',
        accent: me.abroadAccent || '#9B51E0',
      });
    }
    if (me.homeUniversity?.trim()) {
      pairs.push({
        name: me.homeUniversity.trim(),
        kind: 'home',
        accent: me.homeAccent || '#BF5700',
      });
    }
    for (const pair of pairs) {
      try {
        await supabase!.rpc('ensure_community', {
          p_name: pair.name,
          p_kind: pair.kind,
          p_accent: pair.accent,
        });
      } catch {
        // grant may be missing until 022
      }
    }
    // Second sync after ensure_community so memberships exist
    if (pairs.length) {
      try {
        await supabase!.rpc('sync_profile_communities', { p_user_id: me.id });
      } catch {
        // ignore
      }
    }

    const { data: memberships } = await supabase!
      .from('community_members')
      .select('community_id, communities(*)')
      .eq('user_id', me.id);
    const communities: ChatCommunity[] = [];
    for (const row of memberships ?? []) {
      const c = (row as any).communities;
      if (!c) continue;
      if (c.kind !== 'home' && c.kind !== 'abroad') continue;
      const { data: channels } = await supabase!
        .from('channels')
        .select('*')
        .eq('community_id', c.id);
      const channelIds = Object.fromEntries(
        (channels ?? []).map((ch: any) => [ch.slug, ch.id]),
      ) as ChatCommunity['channelIds'];
      communities.push({
        id: c.id,
        name: c.name,
        kind: c.kind,
        accent: c.accent,
        logoUri: c.logo_url,
        channelIds,
      });
    }

    if (communities.length === 0) return [];
    return sortPills(communities);
  },

  async getChannels(communityId: string): Promise<ChatChannel[]> {
    if (!(await useLive()) || !isUuid(communityId)) {
      return demoChat.getChannels(communityId);
    }
    const { data } = await supabase!
      .from('channels')
      .select('*')
      .eq('community_id', communityId);
    return (data ?? []).map((c: any) => ({
      id: c.id,
      communityId: c.community_id,
      slug: c.slug,
      name: c.name,
    }));
  },

  async getCommunityMembers(communityId: string) {
    if (!(await useLive()) || !isUuid(communityId)) {
      return demoChat.getCommunityMembers(communityId);
    }
    const { data } = await supabase!
      .from('community_members')
      .select('profiles(*)')
      .eq('community_id', communityId);
    return (data ?? [])
      .map((r: any) => r.profiles)
      .filter(Boolean)
      .map(mapProfile);
  },

  async getMessages(
    target: ChatTarget,
    opts?: { limit?: number; before?: string },
  ): Promise<ChatMessage[]> {
    const limit = opts?.limit ?? MESSAGE_PAGE_SIZE;
    if (!(await useLive()) || isDemoTarget(target)) {
      return demoChat.getMessages(target, { limit, before: opts?.before });
    }
    // Newest page first, then reverse for chronological FlatList
    let q = supabase!
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (target.type === 'dm') q = q.eq('dm_thread_id', target.threadId);
    else q = q.eq('channel_id', target.channelId);
    if (opts?.before) q = q.lt('created_at', opts.before);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    // Load reactions separately (avoids embed RLS wiping the parent query)
    const ids = rows.map((r: any) => r.id as string).filter(Boolean);
    let reactionsByMsg: Record<string, any[]> = {};
    if (ids.length) {
      const { data: reacts } = await supabase!
        .from('message_reactions')
        .select('*')
        .in('message_id', ids);
      for (const r of reacts ?? []) {
        (reactionsByMsg[r.message_id] ??= []).push(r);
      }
    }
    return rows
      .map((row: any) =>
        mapMessage({
          ...row,
          message_reactions: reactionsByMsg[row.id] ?? [],
        }),
      )
      .reverse();
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
  }) {
    // Demo directory / non-UUID threads always use the stable demo "me" id so
    // bubbles align with seed data and hybrid UUID sessions.
    if (!(await useLive()) || isDemoTarget(input.target)) {
      return demoChat.sendMessage({ ...input, senderId: DEMO_ME_ID });
    }
    const me = await this.getMe();
    if (input.target.type === 'dm' && isUuid(input.target.threadId)) {
      const { data: others } = await supabase!
        .from('dm_participants')
        .select('user_id')
        .eq('thread_id', input.target.threadId)
        .neq('user_id', me.id)
        .limit(1);
      const otherId = others?.[0]?.user_id as string | undefined;
      if (otherId && (await this.isBlockedEither(otherId))) {
        throw new Error('Messaging isn’t available with this account.');
      }
    }
    const row: any = {
      sender_id: me.id,
      kind: input.kind,
      body: input.body ?? null,
      reply_to_id: input.replyToId ?? null,
      trip_id: input.tripId ?? null,
      poll_id: input.pollId ?? null,
      image_url: input.imageUrl ?? null,
      post_id: input.postId ?? null,
      metadata: input.metadata ?? {},
    };
    if (input.target.type === 'dm') row.dm_thread_id = input.target.threadId;
    else row.channel_id = input.target.channelId;

    // Avoid embedding reactions here — separate policy can wipe RETURNING.
    const { data, error } = await supabase!
      .from('messages')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    notifyChatListeners();
    const mapped = mapMessage(data);
    // Keep tripId even if column was null for any reason
    if (!mapped.tripId && input.tripId) {
      return {
        ...mapped,
        tripId: input.tripId,
        metadata: { ...mapped.metadata, tripId: input.tripId },
      };
    }
    return mapped;
  },

  /** Update editable profile fields (name, bio, schools, etc.). */
  async updateMyProfile(patch: {
    firstName?: string;
    lastName?: string;
    bio?: string | null;
    homeUniversity?: string;
    studyAbroadProgram?: string;
    semester?: string | null;
    hostCity?: string | null;
    hostCountry?: string | null;
  }): Promise<ChatProfile> {
    const firstName = patch.firstName?.trim();
    const lastName = patch.lastName?.trim();
    const fullName =
      firstName != null || lastName != null
        ? `${firstName ?? ''} ${lastName ?? ''}`.trim()
        : undefined;

    if (!(await useLive()) || !supabase) {
      const me = await demoChat.getMe();
      const { applyOnboardingToDemoMe } = await import('./demoMeOnboarding');
      const nextFirst = firstName ?? me.firstName;
      const nextLast = lastName ?? me.lastName;
      await applyOnboardingToDemoMe({
        firstName: nextFirst,
        lastName: nextLast,
        avatarUri: typeof me.avatar === 'string' ? me.avatar : null,
        isVerifiedStudent: Boolean(me.isVerifiedStudent),
        studentEmail: me.studentEmail ?? null,
        phoneNumber: me.phoneNumber ?? null,
        dateOfBirth: me.dateOfBirth ?? null,
        bio: patch.bio !== undefined ? patch.bio : me.bio ?? null,
        homeUniversity: patch.homeUniversity ?? me.homeUniversity,
        studyAbroadProgram:
          patch.studyAbroadProgram ?? me.studyAbroadProgram,
        semester:
          patch.semester !== undefined ? patch.semester : me.semester ?? null,
        hostCity:
          patch.hostCity !== undefined ? patch.hostCity : me.hostCity ?? null,
        hostCountry:
          patch.hostCountry !== undefined
            ? patch.hostCountry
            : me.hostCountry ?? null,
      });
      return demoChat.getMe();
    }

    const me = await this.getMe();
    const row: Record<string, unknown> = {};
    if (firstName != null) row.first_name = firstName;
    if (lastName != null) row.last_name = lastName;
    if (fullName) row.full_name = fullName;
    if (patch.bio !== undefined) row.bio = patch.bio;
    if (patch.homeUniversity != null) row.home_university = patch.homeUniversity;
    if (patch.studyAbroadProgram != null) {
      row.study_abroad_program = patch.studyAbroadProgram;
    }
    if (patch.semester !== undefined) row.semester = patch.semester;
    if (patch.hostCity !== undefined) row.host_city = patch.hostCity;
    if (patch.hostCountry !== undefined) row.host_country = patch.hostCountry;

    const nextHostCity =
      patch.hostCity !== undefined ? patch.hostCity : me.hostCity;
    const nextAbroadProg =
      patch.studyAbroadProgram ?? me.studyAbroadProgram ?? '';
    if (
      patch.hostCity !== undefined ||
      patch.studyAbroadProgram !== undefined
    ) {
      const coords = coordsForHostPersistence({
        hostCity: nextHostCity,
        studyAbroadProgram: nextAbroadProg,
      });
      if (coords) {
        row.host_latitude = coords.latitude;
        row.host_longitude = coords.longitude;
      } else if (patch.hostCity !== undefined && !nextHostCity) {
        row.host_latitude = null;
        row.host_longitude = null;
      }
    }

    const nextHome = patch.homeUniversity ?? me.homeUniversity;
    const nextAbroad = patch.studyAbroadProgram ?? me.studyAbroadProgram;
    const homeVisual = resolveSchoolVisualLocal({ name: nextHome || '' });
    const abroadVisual = resolveSchoolVisualLocal({ name: nextAbroad || '' });
    row.home_accent = homeVisual.accent;
    row.abroad_accent = abroadVisual.accent;

    const clientMiles = computeExplorerScoreMiles({
      homeUniversity: nextHome,
      studyAbroadProgram: nextAbroad,
      hostCity:
        patch.hostCity !== undefined ? patch.hostCity : me.hostCity,
      hostCountry:
        patch.hostCountry !== undefined ? patch.hostCountry : me.hostCountry,
      trips: [],
    });
    if (clientMiles > 0) row.explorer_score_miles = clientMiles;

    const { error } = await supabase
      .from('profiles')
      .update(row)
      .eq('id', me.id);
    if (error) throw error;

    try {
      await supabase.rpc('recompute_explorer_score', { p_user_id: me.id });
    } catch {
      // optional if migration not applied
    }
    if (clientMiles > 0) {
      await supabase
        .from('profiles')
        .update({ explorer_score_miles: clientMiles })
        .eq('id', me.id);
    }
    try {
      await supabase.rpc('passport_ensure_host_city', { p_user_id: me.id });
    } catch {
      // optional if migration not applied
    }
    try {
      await supabase.rpc('sync_profile_communities', { p_user_id: me.id });
    } catch {
      // optional if migration 020 not applied
    }
    // Client-side host passport persistence when RPCs are unavailable
    const nextCity =
      patch.hostCity !== undefined ? patch.hostCity : me.hostCity;
    const nextCountry =
      patch.hostCountry !== undefined ? patch.hostCountry : me.hostCountry;
    if (nextCity?.trim()) {
      try {
        await persistHostPassportDirect(me.id, nextCity, nextCountry);
      } catch {
        // best-effort
      }
    }

    // Keep hybrid demo mirror in sync so community pills / passport update immediately
    try {
      const { applyOnboardingToDemoMe } = await import('./demoMeOnboarding');
      await applyOnboardingToDemoMe({
        firstName: firstName ?? me.firstName,
        lastName: lastName ?? me.lastName,
        avatarUri: typeof me.avatar === 'string' ? me.avatar : null,
        isVerifiedStudent: Boolean(me.isVerifiedStudent),
        studentEmail: me.studentEmail ?? null,
        phoneNumber: me.phoneNumber ?? null,
        dateOfBirth: me.dateOfBirth ?? null,
        bio: patch.bio !== undefined ? patch.bio : me.bio ?? null,
        homeUniversity: nextHome,
        studyAbroadProgram: nextAbroad,
        semester:
          patch.semester !== undefined ? patch.semester : me.semester ?? null,
        hostCity: nextCity ?? null,
        hostCountry: nextCountry ?? null,
      });
    } catch {
      demoChat.notify();
    }

    return this.getMe();
  },

  /** Upload a profile photo and persist avatar_url on profiles (public avatars bucket). */
  async updateMyAvatar(localUri: string): Promise<ChatProfile> {
    if (!(await useLive()) || !supabase) {
      const me = await demoChat.getMe();
      const { applyOnboardingToDemoMe } = await import('./demoMeOnboarding');
      await applyOnboardingToDemoMe({
        firstName: me.firstName,
        lastName: me.lastName,
        avatarUri: localUri,
        isVerifiedStudent: Boolean(me.isVerifiedStudent),
        studentEmail: me.studentEmail ?? null,
        phoneNumber: me.phoneNumber ?? null,
        dateOfBirth: me.dateOfBirth ?? null,
      });
      return demoChat.getMe();
    }
    const me = await this.getMe();
    const rawExt = localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    const ext =
      rawExt === 'heic' || rawExt === 'heif'
        ? 'jpg'
        : rawExt.length > 5
          ? 'jpg'
          : rawExt;
    const path = `${me.id}/avatar.${ext}`;
    let avatarUrl: string | null = null;

    const tryUpload = async (): Promise<string | null> => {
      const res = await fetch(localUri);
      const blob = await res.blob();
      const contentType =
        blob.type && blob.type.startsWith('image/')
          ? blob.type
          : ext === 'png'
            ? 'image/png'
            : ext === 'webp'
              ? 'image/webp'
              : 'image/jpeg';
      const { error: upErr } = await supabase!.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType });
      if (upErr) throw upErr;
      const { data: pub } = supabase!.storage.from('avatars').getPublicUrl(path);
      return `${pub.publicUrl}?t=${Date.now()}`;
    };

    try {
      try {
        avatarUrl = await tryUpload();
      } catch (e1) {
        // One retry for transient failures
        if (isBucketMissingError(e1)) throw e1;
        await new Promise((r) => setTimeout(r, 400));
        avatarUrl = await tryUpload();
      }
    } catch (e) {
      if (!isBucketMissingError(e)) throw e;
      // Bucket missing on remote — last resort so the profile still updates
      avatarUrl = await uriToDataUrl(localUri);
    }

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', me.id);
    if (error) throw error;

    // Mirror into demo store so hybrid UI (BottomNav etc.) refreshes immediately
    try {
      const { applyOnboardingToDemoMe } = await import('./demoMeOnboarding');
      await applyOnboardingToDemoMe({
        firstName: me.firstName,
        lastName: me.lastName,
        avatarUri: avatarUrl,
        isVerifiedStudent: Boolean(me.isVerifiedStudent),
        studentEmail: me.studentEmail ?? null,
        phoneNumber: me.phoneNumber ?? null,
        dateOfBirth: me.dateOfBirth ?? null,
      });
    } catch {
      // demo mirror is best-effort
    }

    notifyChatListeners();
    return this.getMe();
  },

  async toggleReaction(messageId: string, emoji: string) {
    if (!(await useLive()) || !isUuid(messageId)) {
      return demoChat.toggleReaction(messageId, emoji);
    }
    const me = await this.getMe();
    const { data: existing } = await supabase!
      .from('message_reactions')
      .select('*')
      .eq('message_id', messageId)
      .eq('user_id', me.id)
      .eq('emoji', emoji)
      .maybeSingle();
    if (existing) {
      await supabase!
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', me.id)
        .eq('emoji', emoji);
    } else {
      await supabase!.from('message_reactions').insert({
        message_id: messageId,
        user_id: me.id,
        emoji,
      });
    }
  },

  async getTripsForMe() {
    if (!(await useLive())) return demoChat.getTripsForMe();
    const me = await this.getMe();
    const live = await fetchTripsFeedBatched(me.id, true);
    if (!allowDemoSeedMerge()) return live;
    const trips = [...live];
    const seen = new Set(trips.map((t) => t.id));
    const demo = await demoChat.getTripsForMe();
    for (const t of demo) {
      if (!seen.has(t.id)) trips.push(t);
    }
    return trips;
  },

  /** Trips feed — full catalog; TripsScreen applies friend vs school visibility. */
  async listTripsFeed(): Promise<ChatTrip[]> {
    if (!(await useLive())) return demoChat.listTripsFeed();
    const me = await this.getMe();
    const out = await fetchTripsFeedBatched(me.id, false);
    if (!allowDemoSeedMerge()) return out;
    const demo = await demoChat.listTripsFeed();
    const seen = new Set(out.map((t) => t.id));
    for (const t of demo) {
      if (!seen.has(t.id)) out.push(t);
    }
    return out;
  },

  async getFriendIds(): Promise<string[]> {
    if (!(await useLive())) return demoChat.getFriendIds();
    const me = await this.getMe();
    const { data } = await supabase!
      .from('friendships')
      .select('friend_id')
      .eq('user_id', me.id);
    const live = (data ?? []).map((r: any) => r.friend_id as string);
    if (!allowDemoSeedMerge()) return live;
    const demoFriends = await demoChat.getFriendIds();
    return [...new Set([...live, ...demoFriends])];
  },

  /** Friends that `userId` has added (Instagram-style following). */
  async listFriendsForUser(userId: string): Promise<ChatProfile[]> {
    if (!(await useLive()) || !isUuid(userId)) {
      return demoChat.listFriendsForUser(userId);
    }
    try {
      const { data, error } = await supabase!.rpc('list_user_friends', {
        p_user_id: userId,
      });
      if (!error && Array.isArray(data)) {
        const live = data.map((row: any) =>
          mapProfile({
            id: row.user_id,
            first_name: row.first_name,
            last_name: row.last_name,
            full_name: row.full_name,
            avatar_url: row.avatar_url,
            home_university: row.home_university,
            study_abroad_program: row.study_abroad_program,
            host_city: row.host_city,
            host_country: row.host_country,
          }),
        );
        if (!allowDemoSeedMerge()) return live;
        const demo = await demoChat.listFriendsForUser(userId);
        const seen = new Set(live.map((p) => p.id));
        return [...live, ...demo.filter((p) => !seen.has(p.id))];
      }
    } catch {
      // fall through
    }
    // Fallback: direct query if RPC missing
    const { data } = await supabase!
      .from('friendships')
      .select('friend_id')
      .eq('user_id', userId);
    const ids = (data ?? []).map((r: any) => r.friend_id as string);
    const profiles = await Promise.all(ids.map((id) => this.getProfile(id)));
    return profiles.filter(Boolean) as ChatProfile[];
  },

  async countFriendsForUser(userId: string): Promise<number> {
    if (!(await useLive()) || !isUuid(userId)) {
      return demoChat.countFriendsForUser(userId);
    }
    try {
      const { data, error } = await supabase!.rpc('count_user_friends', {
        p_user_id: userId,
      });
      if (!error && typeof data === 'number') {
        if (!allowDemoSeedMerge()) return data;
        const demoCount = await demoChat.countFriendsForUser(userId);
        return Math.max(data, demoCount);
      }
    } catch {
      // fall through
    }
    const list = await this.listFriendsForUser(userId);
    return list.length;
  },

  async getTrip(tripId: string) {
    let trip: ChatTrip | null = null;
    if (!(await useLive()) || !isUuid(tripId)) {
      trip = await demoChat.getTrip(tripId);
    } else {
      const me = await this.getMe();
      const { data: t } = await supabase!
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .maybeSingle();
      trip = t ? await hydrateTrip(t, me.id) : await demoChat.getTrip(tripId);
    }
    if (!trip) return null;
    if (!allowDemoSeedMerge() || isUuid(tripId)) {
      return trip;
    }
    const demoPending = await demoChat.listPendingInviteeIds(tripId);
    return {
      ...trip,
      pendingInviteeIds: [
        ...new Set([...(trip.pendingInviteeIds ?? []), ...demoPending]),
      ],
    };
  },

  async requestTripJoin(tripId: string) {
    const trip = await this.getTrip(tripId);
    if (trip && isTripParticipant(trip, (await this.getMe()).id)) {
      return; // already on the trip — never send a join request to yourself
    }
    if (!(await useLive()) || !isUuid(tripId)) {
      return demoChat.requestTripJoin(tripId);
    }
    const { error } = await supabase!.rpc('request_trip_join', { p_trip_id: tripId });
    if (error) throw error;
    notifyChatListeners();
  },

  /** Withdraw a pending join request (tap Request again to unrequest). */
  async cancelTripJoin(tripId: string) {
    if (!(await useLive()) || !isUuid(tripId)) {
      return demoChat.cancelTripJoin(tripId);
    }
    const { error } = await supabase!.rpc('cancel_trip_join', {
      p_trip_id: tripId,
    });
    if (error) {
      // Fallback if RPC not yet applied: delete own pending row
      const me = await this.getMe();
      const { error: delErr } = await supabase!
        .from('trip_join_requests')
        .delete()
        .eq('trip_id', tripId)
        .eq('requester_id', me.id)
        .eq('status', 'pending');
      if (delErr) throw error;
    }
    notifyChatListeners();
  },

  /** Ensure the trip group channel exists and return its id + title. */
  async ensureTripChannel(
    tripId: string,
  ): Promise<{ channelId: string; title: string } | null> {
    const trip = await this.getTrip(tripId);
    if (!trip) return null;
    const title = tripChatTitle(trip.destinationCity, trip.destinationCountry);

    if (!(await useLive()) || !isUuid(tripId)) {
      const channels = await demoChat.listMyTripChannels();
      const hit = channels.find((c) => c.tripId === tripId);
      if (hit) return { channelId: hit.id, title: hit.name || title };
      return trip.channelId
        ? { channelId: trip.channelId, title }
        : null;
    }

    let channelId: string | null = trip.channelId ?? null;
    try {
      const { data: ensured } = await supabase!.rpc('ensure_trip_channel', {
        p_trip_id: tripId,
      });
      if (ensured) channelId = ensured as string;
    } catch {
      // RPC may be missing
    }
    if (!channelId) {
      const { data: channel } = await supabase!
        .from('channels')
        .select('id')
        .eq('slug', 'trip')
        .eq('trip_id', tripId)
        .maybeSingle();
      channelId = channel?.id ?? null;
    }
    if (!channelId) return null;
    return { channelId, title };
  },

  async followTripAlbum(tripId: string) {
    if (!(await useLive()) || !isUuid(tripId)) {
      await demoChat.followTripAlbum(tripId);
      return;
    }
    const { error } = await supabase!.rpc('follow_trip_album', { p_trip_id: tripId });
    if (error) throw error;
  },

  async unfollowTripAlbum(tripId: string) {
    if (!(await useLive()) || !isUuid(tripId)) {
      await demoChat.unfollowTripAlbum(tripId);
      return;
    }
    const me = await this.getMe();
    const { data: album } = await supabase!
      .from('trip_albums')
      .select('id')
      .eq('trip_id', tripId)
      .maybeSingle();
    if (!album) return;
    await supabase!
      .from('album_followers')
      .delete()
      .eq('album_id', album.id)
      .eq('user_id', me.id);
  },

  async getNotifications() {
    if (!(await useLive())) return demoChat.getNotifications();
    const me = await this.getMe();
    const { data } = await supabase!
      .from('notifications')
      .select('*')
      .eq('user_id', me.id)
      .order('created_at', { ascending: false });
    // Live session: only real notifications (no seed/demo pollution)
    return (data ?? []).map((n: any) => ({
      id: n.id,
      userId: n.user_id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      data: normalizeNotificationData(n.data ?? {}),
      readAt: n.read_at,
      createdAt: n.created_at,
    }));
  },

  async getUnreadNotificationCount(): Promise<number> {
    if (!(await useLive())) return demoChat.getUnreadNotificationCount();
    try {
      const { data, error } = await supabase!.rpc('unread_notification_count');
      if (!error && typeof data === 'number') return data;
    } catch {
      // fall through
    }
    const all = await this.getNotifications();
    return all.filter((n) => !n.readAt).length;
  },

  async markNotificationsRead(ids?: string[]): Promise<void> {
    if (!(await useLive())) {
      await demoChat.markNotificationsRead(ids);
      return;
    }
    try {
      await supabase!.rpc('mark_notifications_read', {
        p_ids: ids?.filter(isUuid) ?? null,
      });
    } catch {
      // RPC may be missing until 010 is applied
    }
  },

  async listHomeFeed(limit = 30, offset = 0): Promise<FeedPost[]> {
    if (!(await useLive())) return demoChat.listHomeFeed(limit, offset);
    try {
      const blocked = new Set(await this.listBlockedEitherIds());
      const { data, error } = await supabase!.rpc('list_home_feed', {
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      const live: FeedPost[] = (Array.isArray(data) ? data : [])
        .map(mapFeedPostRow)
        .filter((p) => !blocked.has(p.authorId));
      if (!allowDemoSeedMerge()) return live;

      // Hybrid: keep RPC relevance order for live posts; only top-up with demo
      // after re-ranking the combined set with the same formula.
      const demo = (await demoChat.listHomeFeed(limit, offset)).filter(
        (p) => !blocked.has(p.authorId),
      );
      if (!live.length) return demo;
      const seen = new Set(live.map((p) => p.id));
      const merged = [...live, ...demo.filter((p) => !seen.has(p.id))];
      try {
        const me = await this.getMe();
        const friendIds = new Set(await this.getFriendIds());
        const authors = await Promise.all(
          [...new Set(merged.map((p) => p.authorId))].map((id) =>
            this.getProfile(id),
          ),
        );
        const byId = new Map(
          authors.filter(Boolean).map((p) => [p!.id, p!]),
        );
        const { scoreHomeFeedPost, sortHomeFeedPosts } = await import(
          '../feed/homeFeedRank'
        );
        const ctx = {
          meId: me.id,
          me,
          friendIds,
        };
        return sortHomeFeedPosts(merged, (p) =>
          scoreHomeFeedPost(p, byId.get(p.authorId), ctx),
        ).slice(0, limit);
      } catch {
        return merged
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() -
              new Date(a.createdAt).getTime(),
          )
          .slice(0, limit);
      }
    } catch {
      if (!allowDemoSeedMerge()) return [];
      return demoChat.listHomeFeed(limit, offset);
    }
  },

  async createPost(input: CreatePostInput): Promise<FeedPost> {
    if (!(await useLive())) {
      return demoChat.createPost(input);
    }
    const me = await this.getMe();
    const uploaded: Array<{
      image_url: string;
      sort_order: number;
      crop_json: Record<string, number>;
    }> = [];

    for (let i = 0; i < input.photos.length; i++) {
      const photo = input.photos[i];
      let imageUrl: string;
      if (typeof photo.uri === 'string' && /^https?:\/\//i.test(photo.uri)) {
        imageUrl = photo.uri;
      } else if (typeof photo.uri === 'string') {
        imageUrl = await uploadPostPhoto(me.id, photo.uri, i);
      } else {
        throw new Error(
          'Could not upload that photo. Please pick an image from your library and try again.',
        );
      }
      const crop = photo.crop ?? DEFAULT_CROP;
      uploaded.push({
        image_url: imageUrl,
        sort_order: i,
        crop_json: {
          scale: crop.scale,
          offsetX: crop.offsetX,
          offsetY: crop.offsetY,
        },
      });
    }

    const taggedTripId =
      input.taggedTripId && isUuid(input.taggedTripId)
        ? input.taggedTripId
        : null;
    const taggedUserIds = onlyUuids(input.taggedUserIds);
    const audienceCommunityIds = onlyUuids(input.audienceCommunityIds);

    const { data, error } = await supabase!.rpc('create_post', {
      p_caption: input.caption ?? '',
      p_location_label: input.locationLabel,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_display_mode: input.displayMode,
      p_collage_layout_id: input.collageLayoutId ?? null,
      p_audience: input.audience,
      p_tagged_trip_id: taggedTripId,
      p_photos: uploaded,
      p_tagged_user_ids: taggedUserIds,
      p_audience_community_ids: audienceCommunityIds,
    });
    if (error || !data) {
      throw new Error(
        error?.message ||
          'Could not share your post. Check your connection and try again.',
      );
    }
    demoChat.notify();
    return mapFeedPostRow(data);
  },

  async deletePost(postId: string): Promise<void> {
    if (!(await useLive()) || !isUuid(postId)) {
      await demoChat.deletePost(postId);
      return;
    }
    const { error } = await supabase!.rpc('delete_post', { p_post_id: postId });
    if (error) {
      // Fallback: direct delete (RLS own-row)
      const { error: delErr } = await supabase!
        .from('posts')
        .delete()
        .eq('id', postId);
      if (delErr) throw error;
    }
    notifyChatListeners();
    demoChat.notify();
  },

  async updatePost(
    postId: string,
    input: CreatePostInput,
  ): Promise<FeedPost> {
    if (!(await useLive()) || !isUuid(postId)) {
      return demoChat.updatePost(postId, input);
    }
    const me = await this.getMe();
    const uploaded: Array<{
      image_url: string;
      sort_order: number;
      crop_json: Record<string, number>;
    }> = [];

    for (let i = 0; i < input.photos.length; i++) {
      const photo = input.photos[i];
      let imageUrl: string;
      if (typeof photo.uri === 'string' && /^https?:\/\//i.test(photo.uri)) {
        imageUrl = photo.uri;
      } else if (typeof photo.uri === 'string') {
        imageUrl = await uploadPostPhoto(me.id, photo.uri, i);
      } else {
        throw new Error('Could not upload that photo.');
      }
      const crop = photo.crop ?? DEFAULT_CROP;
      uploaded.push({
        image_url: imageUrl,
        sort_order: i,
        crop_json: {
          scale: crop.scale,
          offsetX: crop.offsetX,
          offsetY: crop.offsetY,
        },
      });
    }

    const { error } = await supabase!.rpc('update_post', {
      p_post_id: postId,
      p_caption: input.caption ?? '',
      p_location_label: input.locationLabel,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_display_mode: input.displayMode,
      p_collage_layout_id: input.collageLayoutId ?? null,
      p_audience: input.audience,
      p_tagged_trip_id:
        input.taggedTripId && isUuid(input.taggedTripId)
          ? input.taggedTripId
          : null,
      p_photos: uploaded,
      p_tagged_user_ids: onlyUuids(input.taggedUserIds),
      p_audience_community_ids: onlyUuids(input.audienceCommunityIds),
    });
    if (error) throw error;
    const full = await this.getPost(postId);
    if (!full) throw new Error('Post updated but could not reload');
    notifyChatListeners();
    demoChat.notify();
    return full;
  },

  async listAuthorPosts(authorId: string): Promise<FeedPost[]> {
    if (await this.isBlockedEither(authorId)) return [];
    if (!(await useLive()) || !isUuid(authorId)) {
      return demoChat.listAuthorPosts(authorId);
    }
    try {
      const { data: rows, error } = await supabase!
        .from('posts')
        .select('*')
        .eq('author_id', authorId)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      const mapped: FeedPost[] = [];
      for (const p of rows ?? []) {
        const full = await this.getPost(p.id);
        if (full) mapped.push(full);
      }
      if (!allowDemoSeedMerge()) return mapped;
      const demo = await demoChat.listAuthorPosts(authorId);
      if (!mapped.length) return demo;
      const seen = new Set(mapped.map((x) => x.id));
      return [...mapped, ...demo.filter((d) => !seen.has(d.id))];
    } catch {
      if (!allowDemoSeedMerge()) return [];
      return demoChat.listAuthorPosts(authorId);
    }
  },

  async togglePostStamp(postId: string): Promise<FeedPost | null> {
    if (!(await useLive()) || !isUuid(postId)) {
      return demoChat.togglePostStamp(postId);
    }
    const { data, error } = await supabase!.rpc('toggle_post_stamp', {
      p_post_id: postId,
    });
    if (error) throw error;
    const post = await this.getPost(postId);
    if (post && data) {
      return {
        ...post,
        iStamped: Boolean(data.stamped),
        stampCount: data.stamp_count ?? post.stampCount,
      };
    }
    return post;
  },

  async listPostStampers(postId: string): Promise<ChatProfile[]> {
    if (!(await useLive()) || !isUuid(postId)) {
      return demoChat.listPostStampers(postId);
    }
    try {
      const { data, error } = await supabase!.rpc('list_post_stampers', {
        p_post_id: postId,
      });
      let ids: string[] = [];
      if (!error && data?.length) {
        ids = (data as any[]).map((r) => r.user_id as string);
      } else {
        const { data: stamps } = await supabase!
          .from('post_stamps')
          .select('user_id')
          .eq('post_id', postId)
          .order('created_at', { ascending: false });
        ids = (stamps ?? []).map((s: any) => s.user_id as string);
      }
      const out: ChatProfile[] = [];
      for (const id of ids) {
        const p = await this.getProfile(id);
        if (p) out.push(p);
      }
      return out.length ? out : demoChat.listPostStampers(postId);
    } catch {
      return demoChat.listPostStampers(postId);
    }
  },

  async getPost(postId: string): Promise<FeedPost | null> {
    if (!(await useLive()) || !isUuid(postId)) {
      return demoChat.getPost(postId);
    }
    const { data: p } = await supabase!
      .from('posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle();
    if (!p) return demoChat.getPost(postId);
    const me = await this.getMe();
    const { data: photos } = await supabase!
      .from('post_photos')
      .select('image_url, crop_json')
      .eq('post_id', postId)
      .order('sort_order');
    const { data: stamps } = await supabase!
      .from('post_stamps')
      .select('user_id')
      .eq('post_id', postId)
      .order('created_at', { ascending: false });
    const stampIds = (stamps ?? []).map((s: any) => s.user_id as string);
    const { data: tags } = await supabase!
      .from('post_tags')
      .select('user_id')
      .eq('post_id', postId);
    return {
      id: p.id,
      authorId: p.author_id,
      caption: p.caption ?? '',
      locationLabel: p.location_label,
      latitude: p.latitude,
      longitude: p.longitude,
      createdAt: p.created_at,
      photoUrls: (photos ?? []).map((x: any) => x.image_url),
      photoCrops: (photos ?? []).map((x: any) => {
        const c = x.crop_json;
        if (!c || typeof c !== 'object') return { ...DEFAULT_CROP };
        return {
          scale: Number(c.scale) || 1,
          offsetX: Number(c.offsetX) || 0,
          offsetY: Number(c.offsetY) || 0,
        };
      }),
      stampCount: stampIds.length,
      iStamped: stampIds.includes(me.id),
      stamperPreviewIds: stampIds.slice(0, 3),
      displayMode: (p.display_mode as FeedPost['displayMode']) ?? 'carousel',
      collageLayoutId: p.collage_layout_id ?? null,
      audience: (p.audience as FeedPost['audience']) ?? 'all',
      taggedTripId: p.tagged_trip_id ?? null,
      taggedUserIds: (tags ?? []).map((t: any) => t.user_id as string),
    };
  },

  async listFeedAlbums(limit = 12): Promise<FeedAlbumCard[]> {
    if (!(await useLive())) return demoChat.listFeedAlbums(limit);
    try {
      const { data, error } = await supabase!.rpc('list_feed_albums', {
        p_limit: limit,
      });
      if (error) throw error;
      const blocked = new Set(await this.listBlockedEitherIds());
      const live: FeedAlbumCard[] = (Array.isArray(data) ? data : [])
        .map((row: any) => ({
          albumId: row.album_id,
          tripId: row.trip_id,
          destinationCity: row.destination_city,
          destinationCountry: row.destination_country ?? '',
          dateStart: row.date_start,
          dateEnd: row.date_end,
          dateLabel: row.date_label,
          ownerId: row.owner_id,
          memberIds: row.member_ids ?? [],
          coverUrls:
            Array.isArray(row.cover_urls) && row.cover_urls.length > 0
              ? row.cover_urls
              : [...ALBUM_PLACEHOLDER_PHOTOS],
          isFollowing: Boolean(row.is_following),
        }))
        .filter((a) => !blocked.has(a.ownerId));
      if (!allowDemoSeedMerge()) return live;
      const demo = (await demoChat.listFeedAlbums(limit)).filter(
        (a) => !blocked.has(a.ownerId),
      );
      if (!live.length) return demo;
      const seen = new Set(live.map((a) => a.tripId));
      return [...live, ...demo.filter((a) => !seen.has(a.tripId))].slice(
        0,
        limit,
      );
    } catch {
      if (!allowDemoSeedMerge()) return [];
      return demoChat.listFeedAlbums(limit);
    }
  },

  async listAuthorAlbums(userId: string, limit = 40): Promise<FeedAlbumCard[]> {
    if (!(await useLive()) || !isUuid(userId)) {
      return demoChat.listAuthorAlbums(userId, limit);
    }
    try {
      const { data, error } = await supabase!.rpc('list_author_albums', {
        p_user_id: userId,
        p_limit: limit,
      });
      if (error) throw error;
      const live: FeedAlbumCard[] = (Array.isArray(data) ? data : []).map(
        (row: any) => ({
          albumId: row.album_id,
          tripId: row.trip_id,
          destinationCity: row.destination_city,
          destinationCountry: row.destination_country ?? '',
          dateStart: row.date_start,
          dateEnd: row.date_end,
          dateLabel: row.date_label,
          ownerId: row.owner_id,
          memberIds: row.member_ids ?? [],
          coverUrls:
            Array.isArray(row.cover_urls) && row.cover_urls.length > 0
              ? row.cover_urls
              : [...ALBUM_PLACEHOLDER_PHOTOS],
          isFollowing: Boolean(row.is_following),
        }),
      );
      if (!allowDemoSeedMerge()) return live;
      const demo = await demoChat.listAuthorAlbums(userId, limit);
      if (!live.length) return demo;
      const seen = new Set(live.map((a) => a.tripId));
      return [...live, ...demo.filter((a) => !seen.has(a.tripId))].slice(
        0,
        limit,
      );
    } catch {
      if (!allowDemoSeedMerge()) return [];
      return demoChat.listAuthorAlbums(userId, limit);
    }
  },

  async getTripAlbumPhotos(tripId: string): Promise<AlbumPhoto[]> {
    const demo = await demoChat.getTripAlbumPhotos(tripId);
    if (!(await useLive()) || !isUuid(tripId)) return demo;
    try {
      const { data: album } = await supabase!
        .from('trip_albums')
        .select('id')
        .eq('trip_id', tripId)
        .maybeSingle();
      if (!album?.id) return demo;
      const { data: photos } = await supabase!
        .from('album_photos')
        .select('id, album_id, uploader_id, image_url, created_at')
        .eq('album_id', album.id)
        .order('created_at', { ascending: false });
      const live: AlbumPhoto[] = (photos ?? []).map((p: any) => ({
        id: p.id,
        albumId: p.album_id,
        tripId,
        uploaderId: p.uploader_id,
        imageUrl: p.image_url,
        createdAt: p.created_at,
      }));
      if (!live.length) return demo;
      // Prefer live rows; never pad with demo photos that share the same URL
      const seenIds = new Set(live.map((p) => p.id));
      const seenUrls = new Set(live.map((p) => p.imageUrl));
      const extras = demo.filter(
        (d) => !seenIds.has(d.id) && !seenUrls.has(d.imageUrl),
      );
      return [...live, ...extras];
    } catch {
      return demo;
    }
  },

  async uploadTripAlbumPhotos(
    tripId: string,
    localUris: string[],
  ): Promise<AlbumPhoto[]> {
    if (!localUris.length) return [];
    if (!(await useLive()) || !isUuid(tripId)) {
      return demoChat.uploadTripAlbumPhotos(tripId, localUris);
    }
    const me = await this.getMe();
    const urls: string[] = [];
    for (let i = 0; i < localUris.length; i++) {
      urls.push(await uploadAlbumPhoto(me.id, localUris[i], i));
    }
    const { data, error } = await supabase!.rpc('upload_album_photos', {
      p_trip_id: tripId,
      p_image_urls: urls,
    });
    if (error) throw error;
    demoChat.notify();
    return this.getTripAlbumPhotos(tripId);
  },

  async shareAlbumPhotoToChat(
    photo: AlbumPhoto,
    target: ChatTarget,
    uploaderName?: string,
  ): Promise<ChatMessage> {
    let imageUrl: string | undefined;
    try {
      const { ensureImageUri } = await import('../images');
      imageUrl = await ensureImageUri(photo.imageUrl as any);
    } catch {
      if (typeof photo.imageUrl === 'string') imageUrl = photo.imageUrl;
    }
    return this.sendMessage({
      target,
      kind: 'image',
      body: uploaderName
        ? `Album photo · ${uploaderName}`
        : 'Shared an album photo',
      imageUrl,
      metadata: {
        albumPhotoId: photo.id,
        tripId: photo.tripId,
        uploaderId: photo.uploaderId,
      },
    });
  },

  async sharePostToChat(
    postId: string,
    target: ChatTarget,
  ): Promise<ChatMessage> {
    const post = await this.getPost(postId);
    const author = post
      ? await this.getProfile(post.authorId)
      : null;
    const first = usablePostPhotos(postId, post?.photoUrls)[0];
    // Always persist a concrete URI so every recipient can render without
    // depending on require() module ids (those change across Metro restarts).
    let imageUrl: string | undefined;
    try {
      const { ensureImageUri } = await import('../images');
      imageUrl = await ensureImageUri(first as any);
    } catch {
      if (typeof first === 'string') imageUrl = first;
    }
    return this.sendMessage({
      target,
      kind: 'post',
      postId,
      body: author
        ? `${author.fullName} · ${post?.locationLabel ?? 'Post'}`
        : 'Shared a post',
      imageUrl,
      metadata: {
        locationLabel: post?.locationLabel,
        authorId: post?.authorId,
        // Seed key only — never rely on numeric module ids after reload
        seedPostId: postId,
      },
    });
  },

  async isFriend(userId: string) {
    // Demo ids (user-jack, …) are not Postgres UUIDs — never query friendships with them.
    if (!(await useLive()) || !isUuid(userId)) return demoChat.isFriend(userId);
    const me = await this.getMe();
    const { data } = await supabase!
      .from('friendships')
      .select('*')
      .eq('user_id', me.id)
      .eq('friend_id', userId)
      .maybeSingle();
    if (data) return true;
    return demoChat.isFriend(userId);
  },

  async addFriend(userId: string) {
    if (!(await useLive()) || !isUuid(userId)) {
      await demoChat.addFriend(userId);
      notifyChatListeners();
      return;
    }
    const { error } = await supabase!.rpc('add_friend', { p_friend_id: userId });
    if (error) throw error;
    try {
      await demoChat.addFriend(userId);
    } catch {
      // demo mirror best-effort
    }
    notifyChatListeners();
  },

  async removeFriend(userId: string) {
    if (!(await useLive()) || !isUuid(userId)) {
      await demoChat.removeFriend(userId);
      notifyChatListeners();
      return;
    }
    const { error } = await supabase!.rpc('remove_friend', {
      p_friend_id: userId,
    });
    if (error) throw error;
    try {
      await demoChat.removeFriend(userId);
    } catch {
      // demo mirror best-effort
    }
    notifyChatListeners();
  },

  async registerPushToken(token: string, platform?: string) {
    if (!(await useLive()) || !token) return;
    const { error } = await supabase!.rpc('register_push_token', {
      p_token: token,
      p_platform: platform ?? null,
    });
    if (error) throw error;
  },

  async unregisterPushToken(token: string) {
    if (!(await useLive()) || !token) return;
    try {
      await supabase!.rpc('unregister_push_token', { p_token: token });
    } catch {
      // ignore
    }
  },

  async muteChannel(channelId: string) {
    if (!(await useLive()) || !supabase) {
      return demoChat.muteChannel(channelId);
    }
    const { error } = await supabase.rpc('mute_channel', {
      p_channel_id: channelId,
    });
    if (error) throw error;
    await demoChat.muteChannel(channelId);
  },

  async unmuteChannel(channelId: string) {
    if (!(await useLive()) || !supabase) {
      return demoChat.unmuteChannel(channelId);
    }
    const { error } = await supabase.rpc('unmute_channel', {
      p_channel_id: channelId,
    });
    if (error) throw error;
    await demoChat.unmuteChannel(channelId);
  },

  async isChannelMuted(channelId: string): Promise<boolean> {
    if (!(await useLive()) || !supabase) {
      return demoChat.isChannelMuted(channelId);
    }
    const { data, error } = await supabase.rpc('is_channel_muted', {
      p_channel_id: channelId,
    });
    if (error) return demoChat.isChannelMuted(channelId);
    return Boolean(data);
  },

  async isBlocked(userId: string) {
    if (!(await useLive()) || !isUuid(userId)) {
      return demoChat.isBlocked(userId);
    }
    const me = await this.getMe();
    const { data } = await supabase!
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', me.id)
      .eq('blocked_id', userId)
      .maybeSingle();
    return Boolean(data);
  },

  /** True if either user blocked the other. */
  async isBlockedEither(userId: string) {
    if (!(await useLive()) || !isUuid(userId)) {
      return demoChat.isBlocked(userId);
    }
    const me = await this.getMe();
    if (userId === me.id) return false;
    try {
      const { data, error } = await supabase!.rpc('users_blocked_either', {
        p_a: me.id,
        p_b: userId,
      });
      if (!error) return Boolean(data);
    } catch {
      // fall through
    }
    return this.isBlocked(userId);
  },

  /** Users blocked in either direction (for feed / search / DMs). */
  async listBlockedEitherIds(): Promise<string[]> {
    if (!(await useLive())) {
      return demoChat.listBlockedUsers().then((rows) => rows.map((p) => p.id));
    }
    try {
      const { data, error } = await supabase!.rpc('list_blocked_either_ids');
      if (!error && Array.isArray(data)) {
        return data.filter((id): id is string => typeof id === 'string');
      }
    } catch {
      // fall through
    }
    const me = await this.getMe();
    const { data } = await supabase!
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', me.id);
    return (data ?? []).map((r: any) => r.blocked_id as string);
  },

  async blockUser(userId: string) {
    await demoChat.blockUser(userId);
    if (!(await useLive()) || !isUuid(userId)) return;
    const { error } = await supabase!.rpc('block_user', {
      p_blocked_id: userId,
    });
    if (error) {
      // Fallback if RPC missing
      const me = await this.getMe();
      const { error: insErr } = await supabase!.from('user_blocks').insert({
        blocker_id: me.id,
        blocked_id: userId,
      });
      if (insErr && !/duplicate|unique/i.test(String(insErr.message || ''))) {
        throw error;
      }
      try {
        await this.removeFriend(userId);
      } catch {
        // ignore
      }
    }
    notifyChatListeners();
  },

  async unblockUser(userId: string) {
    await demoChat.unblockUser(userId);
    if (!(await useLive()) || !isUuid(userId)) return;
    const { error } = await supabase!.rpc('unblock_user', {
      p_blocked_id: userId,
    });
    if (error) {
      const me = await this.getMe();
      const { error: delErr } = await supabase!
        .from('user_blocks')
        .delete()
        .eq('blocker_id', me.id)
        .eq('blocked_id', userId);
      if (delErr) throw error;
    }
    notifyChatListeners();
  },

  async reportContent(input: {
    targetType: 'user' | 'post' | 'message' | 'trip' | 'album_photo';
    targetId?: string | null;
    reportedUserId?: string | null;
    reason: string;
    details?: string;
  }) {
    if (!(await useLive())) {
      // Demo: acknowledge locally
      return { id: `report-${Date.now()}` };
    }
    const { data, error } = await supabase!.rpc('report_content', {
      p_target_type: input.targetType,
      p_target_id: input.targetId ?? null,
      p_reported_user_id: input.reportedUserId ?? null,
      p_reason: input.reason,
      p_details: input.details ?? null,
    });
    if (error) throw error;
    return { id: data as string };
  },

  async isTripNotifyEnabled(userId: string) {
    return demoChat.isTripNotifyEnabled(userId);
  },

  async setTripNotify(userId: string, enabled: boolean) {
    return demoChat.setTripNotify(userId, enabled);
  },

  async searchUsers(query: string) {
    const q = query.trim();
    if (!q) return [];

    if (!(await useLive())) return demoChat.searchUsers(query);

    const me = await this.getMe();
    const { data } = await supabase!
      .from('profiles')
      .select('*')
      .or(
        `full_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`,
      )
      .neq('id', me.id)
      .limit(30);
    const liveHits = (data ?? []).map(mapProfile);
    const blockedSet = new Set(await this.listBlockedEitherIds());
    const filteredHits = liveHits.filter((p) => !blockedSet.has(p.id));

    if (!allowDemoSeedMerge()) {
      const friendFlags = await Promise.all(
        filteredHits.map((p) => this.isFriend(p.id)),
      );
      return filteredHits
        .map((p, i) => ({ p, f: friendFlags[i] }))
        .sort(
          (a, b) =>
            Number(b.f) - Number(a.f) || a.p.fullName.localeCompare(b.p.fullName),
        )
        .map((x) => x.p);
    }

    const demoHits = await demoChat.searchUsers(query);
    const seen = new Set(filteredHits.map((p) => p.id));
    const merged = [...filteredHits];
    for (const p of demoHits) {
      if (!seen.has(p.id) && !blockedSet.has(p.id)) {
        merged.push(p);
        seen.add(p.id);
      }
    }
    const friendFlags = await Promise.all(
      merged.map(async (p) => {
        if (!isUuid(p.id)) return demoChat.isFriend(p.id);
        return this.isFriend(p.id);
      }),
    );
    return merged
      .map((p, i) => ({ p, f: friendFlags[i] }))
      .sort(
        (a, b) => Number(b.f) - Number(a.f) || a.p.fullName.localeCompare(b.p.fullName),
      )
      .map((x) => x.p);
  },

  async listDmThreads(): Promise<DmThread[]> {
    if (!(await useLive())) return demoChat.listDmThreads();

    const me = await this.getMe();
    const { data: parts } = await supabase!
      .from('dm_participants')
      .select('thread_id, dm_threads(*)')
      .eq('user_id', me.id);
    const liveThreads: DmThread[] = [];
    for (const row of parts ?? []) {
      const threadId = (row as any).thread_id;
      const { data: others } = await supabase!
        .from('dm_participants')
        .select('user_id')
        .eq('thread_id', threadId)
        .neq('user_id', me.id);
      const otherUserId = others?.[0]?.user_id;
      if (!otherUserId) continue;
      const meta = (row as any).dm_threads;
      liveThreads.push({
        id: threadId,
        otherUserId,
        updatedAt: meta?.updated_at ?? new Date().toISOString(),
      });
    }
    const blocked = new Set(await this.listBlockedEitherIds());
    const visibleLive = liveThreads.filter((t) => !blocked.has(t.otherUserId));
    if (!allowDemoSeedMerge()) {
      return visibleLive.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }
    const demoThreads = (await demoChat.listDmThreads()).filter(
      (t) => !blocked.has(t.otherUserId),
    );
    const merged = [...visibleLive, ...demoThreads];
    return merged.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  },

  /**
   * Open or create a DM thread.
   * Default requires friendship (AirMail list / share sheets).
   * Pass `{ requireFriend: false }` from profile AirMail (Instagram-style).
   */
  async openDm(
    otherUserId: string,
    opts?: { requireFriend?: boolean; threadId?: string | null },
  ): Promise<DmThread> {
    const requireFriend = opts?.requireFriend !== false;
    // Prefer an explicit thread from a notification — never create a second empty DM
    if (opts?.threadId && isUuid(opts.threadId)) {
      return {
        id: opts.threadId,
        otherUserId,
        updatedAt: new Date().toISOString(),
      };
    }
    // Seed/local users are not in auth.users — keep those DMs in the demo store
    if (!(await useLive()) || !isUuid(otherUserId)) {
      if (await demoChat.isBlocked(otherUserId)) {
        throw new Error('You blocked this account.');
      }
      if (requireFriend) {
        const friends = await demoChat.getFriendIds();
        if (!friends.includes(otherUserId)) {
          throw new Error('Add them as a friend to send a message.');
        }
      }
      return demoChat.openDm(otherUserId);
    }
    if (await this.isBlockedEither(otherUserId)) {
      throw new Error('Messaging isn’t available with this account.');
    }

    // Prefer RPC so we always reuse the real 1:1 thread (avoids empty duplicate threads)
    try {
      const { data: threadId, error: rpcErr } = await supabase!.rpc('open_dm', {
        p_other_user_id: otherUserId,
      });
      if (!rpcErr && threadId) {
        return {
          id: threadId as string,
          otherUserId,
          updatedAt: new Date().toISOString(),
        };
      }
    } catch {
      // fall through
    }

    const liveThreads = await this.listDmThreads();
    const existing = liveThreads.find(
      (t) => t.otherUserId === otherUserId && isUuid(t.id),
    );
    if (existing) return existing;

    if (requireFriend) {
      const friended = await this.isFriend(otherUserId);
      if (!friended) {
        throw new Error('Add them as a friend to send a message.');
      }
    }

    const me = await this.getMe();
    const { data: thread, error } = await supabase!
      .from('dm_threads')
      .insert({})
      .select('*')
      .single();
    if (error) throw error;
    const { error: partErr } = await supabase!.from('dm_participants').insert([
      { thread_id: thread.id, user_id: me.id },
      { thread_id: thread.id, user_id: otherUserId },
    ]);
    if (partErr) throw partErr;
    return {
      id: thread.id,
      otherUserId,
      updatedAt: thread.updated_at,
    };
  },

  async createPoll(question: string, options: string[]) {
    if (!(await useLive())) return demoChat.createPoll(question, options);
    const me = await this.getMe();
    const { data: poll, error } = await supabase!
      .from('polls')
      .insert({ question, created_by: me.id })
      .select('*')
      .single();
    if (error) throw error;
    const opts = options.map((label, i) => ({
      poll_id: poll.id,
      label,
      sort_order: i,
    }));
    const { data: created } = await supabase!.from('poll_options').insert(opts).select('*');
    return {
      id: poll.id,
      question,
      options: (created ?? []).map((o: any) => ({ id: o.id, label: o.label, votes: 0 })),
      myVoteOptionId: null,
    } as PollData;
  },

  async getPoll(pollId: string) {
    if (!(await useLive())) return demoChat.getPoll(pollId);
    const { data: poll } = await supabase!.from('polls').select('*').eq('id', pollId).maybeSingle();
    if (!poll) return null;
    const { data: options } = await supabase!
      .from('poll_options')
      .select('*')
      .eq('poll_id', pollId)
      .order('sort_order');
    const { data: votes } = await supabase!.from('poll_votes').select('*').eq('poll_id', pollId);
    const me = await this.getMe();
    const my = votes?.find((v: any) => v.user_id === me.id);
    return {
      id: poll.id,
      question: poll.question,
      options: (options ?? []).map((o: any) => ({
        id: o.id,
        label: o.label,
        votes: (votes ?? []).filter((v: any) => v.option_id === o.id).length,
      })),
      myVoteOptionId: my?.option_id ?? null,
    } as PollData;
  },

  async votePoll(pollId: string, optionId: string) {
    if (!(await useLive())) return demoChat.votePoll(pollId, optionId);
    const me = await this.getMe();
    await supabase!.from('poll_votes').upsert({
      poll_id: pollId,
      option_id: optionId,
      user_id: me.id,
    });
  },

  async createTrip(input: CreateTripInput): Promise<ChatTrip> {
    // Non-UUID invitees or offline → demo create (hybrid-safe)
    const liveInvitees = input.inviteeIds.filter(isUuid);
    const demoInvitees = input.inviteeIds.filter((id) => !isUuid(id));

    if (!(await useLive())) {
      return demoChat.createTrip(input);
    }

    const dateLabel =
      input.dateLabel ||
      shortWeekdayRange(input.dateStart, input.dateEnd, '') ||
      null;

    const { data, error } = await supabase!.rpc('create_trip', {
      p_destination_city: input.destinationCity,
      p_destination_country: input.destinationCountry,
      p_latitude: input.latitude ?? null,
      p_longitude: input.longitude ?? null,
      p_date_start: input.dateStart ?? null,
      p_date_end: input.dateEnd ?? null,
      p_date_label: dateLabel,
      p_description: input.description ?? null,
      p_open_to_join: input.openToJoin,
      p_max_members: input.maxMembers ?? null,
      p_invitee_ids: liveInvitees,
      p_notify_friends: input.notifyFriends,
    });
    if (error) throw error;

    const tripId = (data as any)?.trip_id as string;
    let channelId = (data as any)?.channel_id as string | undefined;
    // Ensure chat channel exists + named even if older create_trip omitted it
    if (isUuid(tripId)) {
      const { data: ensured } = await supabase!.rpc('ensure_trip_channel', {
        p_trip_id: tripId,
      });
      if (ensured) channelId = ensured as string;
    }

    let trip = await this.getTrip(tripId);
    if (!trip) throw new Error('Trip created but not found');
    if (channelId && !trip.channelId) {
      trip = { ...trip, channelId };
    }

    // Demo-directory friends can't hit Supabase UUID invites — record local pending + notifs
    if (demoInvitees.length) {
      await demoChat.attachPendingInvites(
        tripId,
        demoInvitees,
        trip.destinationCity,
      );
      trip = {
        ...trip,
        pendingInviteeIds: [
          ...new Set([...(trip.pendingInviteeIds ?? []), ...demoInvitees]),
        ],
      };
    }

    // Mirror into demo so Messages sidebar always lists this trip chat
    await demoChat.mirrorLiveTrip(trip);
    return trip;
  },

  async inviteToTrip(tripId: string, inviteeId: string) {
    // Live UUID friends → Supabase; always also record demo pending for hybrid friends.
    if ((await useLive()) && isUuid(tripId) && isUuid(inviteeId)) {
      const { error } = await supabase!.rpc('invite_to_trip', {
        p_trip_id: tripId,
        p_invitee_id: inviteeId,
      });
      if (error) throw error;
    }
    await demoChat.inviteToTrip(tripId, inviteeId);
  },

  async uninviteFromTrip(tripId: string, inviteeId: string) {
    if ((await useLive()) && isUuid(tripId) && isUuid(inviteeId)) {
      const { error } = await supabase!.rpc('cancel_trip_invite', {
        p_trip_id: tripId,
        p_invitee_id: inviteeId,
      });
      if (error) throw error;
    }
    await demoChat.uninviteFromTrip(tripId, inviteeId);
  },

  async confirmTrip(tripId: string) {
    let liveOk = false;
    if ((await useLive()) && isUuid(tripId)) {
      const { error } = await supabase!.rpc('confirm_trip', {
        p_trip_id: tripId,
      });
      if (error) throw error;
      liveOk = true;
    }
    await demoChat.confirmTrip(tripId);
    if (liveOk) demoChat.notify();
  },

  async getPassport(userId: string): Promise<PassportData> {
    let result: PassportData = { unlocks: [], cities: [] };

    if ((await useLive()) && isUuid(userId)) {
      try {
        await supabase!.rpc('passport_ensure_host_city', { p_user_id: userId });
      } catch {
        // optional
      }
      try {
        const { data, error } = await supabase!.rpc('get_passport', {
          p_user_id: userId,
        });
        if (!error && data) {
          result = mapPassportPayload(data);
        }
      } catch {
        // fall through to client ensure
      }

      const me = await this.getMe();
      const profile =
        userId === me.id ? me : await this.getProfile(userId);

      if (profile?.hostCity?.trim()) {
        // Persist when RPC/ensure failed or returned empty for own profile
        if (userId === me.id) {
          const missingCity = !result.cities.some(
            (c) =>
              c.cityName.toLowerCase() === profile.hostCity!.trim().toLowerCase(),
          );
          const key = countryKeyFromName(profile.hostCountry);
          const missingStamp =
            Boolean(key) &&
            !result.unlocks.some((u) => u.countryKey === key);
          if (missingCity || missingStamp) {
            try {
              await persistHostPassportDirect(
                userId,
                profile.hostCity,
                profile.hostCountry,
              );
              const { data } = await supabase!.rpc('get_passport', {
                p_user_id: userId,
              });
              if (data) {
                result = mapPassportPayload(data);
              }
            } catch {
              // client-side merge below still shows host city/stamp
            }
          }
        }

        const unlocks: StoredUnlock[] = result.unlocks.map((u) => ({
          ...u,
          userId,
        }));
        const cities: StoredCity[] = result.cities.map((c) => ({
          ...c,
          userId,
        }));
        ensureHostCity({
          unlocks,
          cities,
          userId,
          hostCity: profile.hostCity,
          hostCountry: profile.hostCountry,
        });
        result = passportForUser(userId, unlocks, cities);
      }

      // Live path: never fall back to another user's / seed passport
      return result;
    }

    return demoChat.getPassport(userId);
  },

  async reorderPassportCities(cityIds: string[]): Promise<void> {
    if ((await useLive()) && cityIds.every(isUuid)) {
      const { error } = await supabase!.rpc('reorder_passport_cities', {
        p_city_ids: cityIds,
      });
      if (error) throw error;
      demoChat.notify();
      return;
    }
    await demoChat.reorderPassportCities(cityIds);
  },

  async addPassportCity(input: {
    cityName: string;
    countryName: string;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<PassportCityRank> {
    if (await useLive()) {
      try {
        const { data, error } = await supabase!.rpc('add_passport_city', {
          p_city: input.cityName,
          p_country: input.countryName,
          p_lat: input.latitude ?? null,
          p_lng: input.longitude ?? null,
        });
        if (!error && data) {
          demoChat.notify();
          return {
            id: data.id,
            cityName: data.city_name,
            countryName: data.country_name ?? '',
            sortOrder: data.sort_order ?? 0,
            source: data.source,
            tripId: data.trip_id ?? null,
            latitude: data.latitude ?? null,
            longitude: data.longitude ?? null,
          };
        }
      } catch {
        // fall through
      }
    }
    return demoChat.addPassportCity(input);
  },

  async unconfirmTrip(tripId: string) {
    if ((await useLive()) && isUuid(tripId)) {
      const { error } = await supabase!.rpc('unconfirm_trip', {
        p_trip_id: tripId,
      });
      if (error) {
        // Fallback if RPC missing / RLS: direct host update
        const me = await this.getMe();
        const { error: updateError } = await supabase!
          .from('trips')
          .update({ status: 'planning' })
          .eq('id', tripId)
          .eq('owner_id', me.id);
        if (updateError) {
          throw new Error(
            error.message ||
              updateError.message ||
              'Could not unlock trip. Run 007_unconfirm_trip.sql in Supabase.',
          );
        }
      }
    }
    await demoChat.unconfirmTrip(tripId);
    demoChat.notify();
  },

  async setTripOpenToJoin(tripId: string, open: boolean) {
    let liveOk = false;
    if ((await useLive()) && isUuid(tripId)) {
      const { error } = await supabase!.rpc('set_trip_open_to_join', {
        p_trip_id: tripId,
        p_open: open,
      });
      if (error) throw error;
      liveOk = true;
    }
    await demoChat.setTripOpenToJoin(tripId, open);
    if (liveOk) demoChat.notify();
  },

  async respondTripInvite(inviteId: string, accept: boolean) {
    if (!(await useLive()) || !isUuid(inviteId)) {
      return demoChat.respondTripInvite(inviteId, accept);
    }
    const { error } = await supabase!.rpc('respond_trip_invite', {
      p_invite_id: inviteId,
      p_accept: accept,
    });
    if (error) throw error;
    demoChat.notify();
  },

  /** Host accepts or declines an open-to-join request. */
  async respondTripJoinRequest(requestId: string, accept: boolean) {
    if (!(await useLive()) || !isUuid(requestId)) {
      return demoChat.respondTripJoinRequest(requestId, accept);
    }
    const { error } = await supabase!.rpc('respond_trip_join_request', {
      p_request_id: requestId,
      p_accept: accept,
    });
    if (error) throw error;
    demoChat.notify();
  },

  /** Pending join requests for a trip (host manage UI). */
  async listTripJoinRequests(
    tripId: string,
  ): Promise<Array<{ id: string; requesterId: string; status: string }>> {
    if (!(await useLive()) || !isUuid(tripId)) {
      return demoChat.listTripJoinRequests(tripId);
    }
    const { data, error } = await supabase!
      .from('trip_join_requests')
      .select('id, requester_id, status')
      .eq('trip_id', tripId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id as string,
      requesterId: r.requester_id as string,
      status: r.status as string,
    }));
  },

  /** Count of pending join requests (for confirm-trip warning). */
  async countPendingJoinRequests(tripId: string): Promise<number> {
    const rows = await this.listTripJoinRequests(tripId);
    return rows.length;
  },

  async removeTripMember(tripId: string, userId: string) {
    if ((await useLive()) && isUuid(tripId) && isUuid(userId)) {
      const { error } = await supabase!.rpc('remove_trip_member', {
        p_trip_id: tripId,
        p_user_id: userId,
      });
      if (error) throw error;
    }
    await demoChat.removeTripMember(tripId, userId);
    demoChat.notify();
  },

  async listMyTripChannels(): Promise<TripChannel[]> {
    const demo = await demoChat.listMyTripChannels();
    if (!(await useLive())) return demo;

    const me = await this.getMe();
    const { data: memberships } = await supabase!
      .from('trip_members')
      .select('trip_id')
      .eq('user_id', me.id);
    const tripIds = (memberships ?? []).map((r: any) => r.trip_id as string);

    const live: TripChannel[] = [];
    for (const tripId of tripIds) {
      // Always load destination from the trip row (don't rely on nested joins)
      const { data: tripRow } = await supabase!
        .from('trips')
        .select('destination_city, destination_country')
        .eq('id', tripId)
        .maybeSingle();

      let city = (tripRow?.destination_city as string | undefined)?.trim() ?? '';
      let country =
        (tripRow?.destination_country as string | undefined)?.trim() ?? '';

      // Ensure channel row exists (also renames via SQL when 009 is applied)
      let channelId: string | null = null;
      try {
        const { data: ensured } = await supabase!.rpc('ensure_trip_channel', {
          p_trip_id: tripId,
        });
        if (ensured) channelId = ensured as string;
      } catch {
        // RPC may be missing until 009 is applied
      }

      const { data: channel } = await supabase!
        .from('channels')
        .select('id, trip_id, name')
        .eq('slug', 'trip')
        .eq('trip_id', tripId)
        .maybeSingle();

      // Fallback: parse city/country from channel name if trip row blocked
      if (!city && typeof channel?.name === 'string') {
        const raw = channel.name.replace(/\s+trip$/i, '').trim();
        if (raw && !/^trip$/i.test(raw)) {
          const parts = raw.split(',').map((s: string) => s.trim());
          city = parts[0] ?? raw;
          country = parts.slice(1).join(', ');
        }
      }

      // Last resort: full hydrate (works even when list select is limited)
      if (!city) {
        const t = await this.getTrip(tripId);
        if (t?.destinationCity) {
          city = t.destinationCity.trim();
          country = (t.destinationCountry ?? '').trim();
        }
      }

      const id = channel?.id ?? channelId;
      if (!id) continue;

      const name = tripChatTitle(city, country);
      if (city && channel?.name !== name) {
        await supabase!.from('channels').update({ name }).eq('id', id);
      }

      live.push({
        id,
        tripId,
        name,
        destinationCity: city || 'Trip',
        destinationCountry: country,
      });
    }

    const seen = new Set(live.map((c) => c.tripId));
    for (const d of demo) {
      if (!seen.has(d.tripId)) {
        live.push({
          ...d,
          name: tripChatTitle(d.destinationCity, d.destinationCountry),
        });
      }
    }
    return live;
  },

  async suggestTripInvitees(): Promise<ChatProfile[]> {
    if (!(await useLive())) return demoChat.suggestTripInvitees();
    const me = await this.getMe();
    const { data } = await supabase!
      .from('friendships')
      .select('friend_id')
      .eq('user_id', me.id);
    const ids = (data ?? [])
      .map((r: any) => r.friend_id as string)
      .filter((id) => isUuid(id) && id !== me.id);
    const out: ChatProfile[] = [];
    for (const id of ids) {
      const p = await this.getProfile(id);
      if (p) out.push(p);
    }
    return out;
  },

  async resolveTripInviteToken(token: string): Promise<ChatTrip | null> {
    if (!(await useLive())) return demoChat.resolveTripInviteToken(token);
    const { data: tripId, error } = await supabase!.rpc(
      'resolve_trip_invite_token',
      { p_token: token },
    );
    if (error || !tripId) {
      return demoChat.resolveTripInviteToken(token);
    }
    return this.getTrip(tripId as string);
  },

  tripInviteLink(trip: ChatTrip): string {
    return demoChat.tripInviteLink(trip);
  },

  async searchInstitutions(
    q: string,
    limit = 20,
  ): Promise<CatalogInstitution[]> {
    if (!(await useLive())) {
      return searchInstitutionsLocal(q, limit);
    }
    try {
      const { data, error } = await supabase!.rpc('search_institutions', {
        q,
        lim: limit,
      });
      if (error || !data?.length) return searchInstitutionsLocal(q, limit);
      return (data as any[]).map((row) => ({
        slug: row.slug,
        name: row.name,
        country: row.country ?? '',
        state: row.state,
        domains: row.domains ?? [],
        website: row.website,
        logo_url: row.logo_url,
        accent_hex: row.accent_hex ?? '#175864',
        kind: row.kind ?? 'university',
        id: row.id,
      }));
    } catch {
      return searchInstitutionsLocal(q, limit);
    }
  },

  async listStudyPrograms() {
    if (!(await useLive())) {
      return getLocalStudyPrograms().map(programToPin);
    }
    try {
      const { data, error } = await supabase!.rpc('list_study_programs');
      if (error || !data?.length) {
        return getLocalStudyPrograms().map(programToPin);
      }
      return (data as any[]).map((row) =>
        programToPin({
          slug: row.slug,
          name: row.name,
          short_name: row.short_name,
          provider: row.provider ?? '',
          city: row.city,
          country: row.country,
          latitude: row.latitude,
          longitude: row.longitude,
          address: row.address,
          domains: row.domains ?? [],
          logo_url: row.logo_url,
          accent_hex: row.accent_hex ?? '#175864',
          id: row.id,
        }),
      );
    } catch {
      return getLocalStudyPrograms().map(programToPin);
    }
  },

  resolveSchoolVisual(name: string) {
    return resolveSchoolVisualLocal({ name });
  },

  async getMySettings() {
    const {
      emptyUserSettings,
      mergeNotifPrefs,
      mergeOnboarding,
    } = await import('../social/userSettings');
    if (!(await useLive()) || !supabase) {
      return demoChat.getMySettings();
    }
    try {
      const { data, error } = await supabase.rpc('get_my_settings');
      if (error) throw error;
      const row = (data ?? {}) as any;
      return {
        notificationPrefs: mergeNotifPrefs(row.notification_prefs),
        onboarding: mergeOnboarding(row.onboarding),
        updatedAt:
          row.updated_at ?? new Date().toISOString(),
      };
    } catch {
      return emptyUserSettings();
    }
  },

  async updateMySettings(patch: {
    notificationPrefs?: Partial<
      import('../social/userSettings').UserSettings['notificationPrefs']
    >;
    onboarding?: import('../social/userSettings').OnboardingFlags;
  }) {
    const {
      mergeNotifPrefs,
      mergeOnboarding,
    } = await import('../social/userSettings');
    // Always mirror demo for hybrid / offline
    const demoNext = await demoChat.updateMySettings(patch);
    if (!(await useLive()) || !supabase) return demoNext;
    try {
      const { data, error } = await supabase.rpc('upsert_my_settings', {
        p_notification_prefs: patch.notificationPrefs
          ? patch.notificationPrefs
          : null,
        p_onboarding: patch.onboarding ? patch.onboarding : null,
      });
      if (error) throw error;
      const row = (data ?? {}) as any;
      return {
        notificationPrefs: mergeNotifPrefs(row.notification_prefs),
        onboarding: mergeOnboarding(row.onboarding),
        updatedAt: row.updated_at ?? new Date().toISOString(),
      };
    } catch {
      return demoNext;
    }
  },

  async listBlockedUsers(): Promise<ChatProfile[]> {
    if (!(await useLive())) return demoChat.listBlockedUsers();
    const me = await this.getMe();
    const { data, error } = await supabase!
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', me.id);
    if (error) return demoChat.listBlockedUsers();
    const ids = (data ?? []).map((r: any) => r.blocked_id as string);
    const profiles = await Promise.all(ids.map((id) => this.getProfile(id)));
    return profiles.filter(Boolean) as ChatProfile[];
  },

  async suggestAccounts(limit = 40) {
    const { scoreSuggestedAccounts } = await import(
      '../social/suggestAccounts'
    );
    const mapRpcRow = (row: any): import('../social/suggestAccounts').SuggestedAccount => ({
      profile: mapProfile({
        id: row.user_id,
        first_name: row.first_name,
        last_name: row.last_name,
        full_name: row.full_name,
        avatar_url: row.avatar_url,
        home_university: row.home_university,
        study_abroad_program: row.study_abroad_program,
        host_city: row.host_city,
        host_country: row.host_country,
      }),
      score: Number(row.score) || 0,
      homeUniversity: row.home_university || '',
      studyAbroadProgram: row.study_abroad_program || '',
      reason:
        (typeof row.reason === 'string' && row.reason.trim()) ||
        (Number(row.shared_friends) > 0
          ? `${row.shared_friends} mutual friend${
              Number(row.shared_friends) === 1 ? '' : 's'
            }`
          : 'Suggested for you'),
    });

    if ((await useLive()) && supabase) {
      try {
        const { data, error } = await supabase.rpc('suggest_accounts', {
          p_limit: limit,
        });
        if (!error && Array.isArray(data)) {
          const live: import('../social/suggestAccounts').SuggestedAccount[] =
            data.map(mapRpcRow);
          if (live.length >= Math.min(8, limit) || !allowDemoSeedMerge()) {
            return live;
          }
          // Dev/hybrid: top up thin live lists with seeded demo people
          const demo = await demoChat.suggestAccounts(
            limit,
            scoreSuggestedAccounts,
          );
          const seen = new Set(live.map((x) => x.profile.id));
          for (const d of demo) {
            if (seen.has(d.profile.id)) continue;
            live.push(d);
            seen.add(d.profile.id);
            if (live.length >= limit) break;
          }
          return live;
        }
      } catch {
        // fall through to client scorer
      }

      // RPC missing/failed — score live profiles on the client
      try {
        const me = await this.getMe();
        const friendIds = await this.getFriendIds();
        const profiles = await this.listProfiles();
        const profilesById = new Map(profiles.map((p) => [p.id, p]));
        const liveScored = scoreSuggestedAccounts({
          me,
          candidates: profiles,
          friendIds,
          profilesById,
          limit,
        });
        if (liveScored.length > 0 || !allowDemoSeedMerge()) {
          return liveScored;
        }
      } catch {
        // fall through
      }
    }
    return demoChat.suggestAccounts(limit, scoreSuggestedAccounts);
  },
};

function mapTripFeedRow(row: any): ChatTrip {
  const ownerId = (row.owner_id ?? row.ownerId) as string;
  const memberIds = [
    ...new Set([
      ...normalizeMemberIds(row.member_ids ?? row.memberIds),
      ...(ownerId ? [ownerId] : []),
    ]),
  ];
  return {
    id: row.id,
    ownerId,
    status: row.status,
    openToJoin: Boolean(row.open_to_join ?? row.openToJoin),
    destinationCity: row.destination_city ?? row.destinationCity,
    destinationCountry: row.destination_country ?? row.destinationCountry,
    dateLabel: row.date_label ?? row.dateLabel ?? '',
    dateStart: row.date_start ?? row.dateStart ?? null,
    dateEnd: row.date_end ?? row.dateEnd ?? null,
    leavingTime: row.leaving_time ?? row.leavingTime ?? null,
    memberIds,
    myJoinStatus: row.my_join_status ?? row.myJoinStatus ?? null,
    albumId: row.album_id ?? row.albumId ?? null,
    isFollowingAlbum: Boolean(row.is_following_album ?? row.isFollowingAlbum),
    albumPreviewUrls: (row.album_preview_urls ??
      row.albumPreviewUrls ??
      []) as string[],
    description: row.description ?? null,
    maxMembers: row.max_members ?? row.maxMembers ?? null,
    inviteToken: row.invite_token ?? row.inviteToken ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    channelId: row.channel_id ?? row.channelId ?? null,
    pendingInviteeIds: normalizeMemberIds(
      row.pending_invitee_ids ?? row.pendingInviteeIds,
    ),
    myPendingInviteId:
      (row.my_pending_invite_id as string) ??
      (row.myPendingInviteId as string) ??
      null,
  };
}

/** One RPC (or batched fallback) instead of N× hydrateTrip round-trips. */
async function fetchTripsFeedBatched(
  meId: string,
  mineOnly: boolean,
): Promise<ChatTrip[]> {
  try {
    const { data, error } = await supabase!.rpc('list_trips_feed', {
      p_mine_only: mineOnly,
    });
    if (!error && data != null) {
      const rows = asRpcRows(data);
      // Empty feed is a valid RPC result — do not fall through to N+1
      if (Array.isArray(data) || rows.length > 0 || data === '[]') {
        return rows.map(mapTripFeedRow);
      }
    }
  } catch {
    // migration 023 not applied — fall through
  }

  let trips: any[] = [];
  if (mineOnly) {
    const { data } = await supabase!
      .from('trip_members')
      .select('trips(*)')
      .eq('user_id', meId);
    trips = (data ?? []).map((r: any) => r.trips).filter(Boolean);
  } else {
    const { data } = await supabase!.from('trips').select('*');
    trips = data ?? [];
  }

  // Batch member ids for all trips in one query
  const ids = trips.map((t) => t.id as string);
  const memberIdsByTrip = new Map<string, string[]>();
  if (ids.length) {
    const { data: members } = await supabase!
      .from('trip_members')
      .select('trip_id, user_id')
      .in('trip_id', ids);
    for (const m of members ?? []) {
      const list = memberIdsByTrip.get(m.trip_id) ?? [];
      list.push(m.user_id);
      memberIdsByTrip.set(m.trip_id, list);
    }
  }

  const out: ChatTrip[] = [];
  for (const t of trips) {
    out.push(await hydrateTrip(t, meId, memberIdsByTrip.get(t.id)));
  }
  return out;
}

async function hydrateTrip(
  t: any,
  meId: string,
  memberIdsPrefetch?: string[],
): Promise<ChatTrip> {
  let memberIds = memberIdsPrefetch
    ? normalizeMemberIds(memberIdsPrefetch)
    : undefined;
  if (!memberIds) {
    const { data: members } = await supabase!
      .from('trip_members')
      .select('user_id')
      .eq('trip_id', t.id);
    memberIds = (members ?? []).map((m: any) => m.user_id as string);
  }
  const ownerId = (t.owner_id ?? t.ownerId) as string;
  // Owner is always a participant — never omit even if trip_members read is empty
  memberIds = [...new Set([...(memberIds ?? []), ...(ownerId ? [ownerId] : [])])];
  const { data: req } = await supabase!
    .from('trip_join_requests')
    .select('status')
    .eq('trip_id', t.id)
    .eq('requester_id', meId)
    .maybeSingle();

  let albumId: string | null = null;
  let isFollowingAlbum = false;
  let albumPreviewUrls: string[] = [];

  const { data: album } = await supabase!
    .from('trip_albums')
    .select('id')
    .eq('trip_id', t.id)
    .maybeSingle();
  if (album) {
    albumId = album.id;
    const { data: follow } = await supabase!
      .from('album_followers')
      .select('user_id')
      .eq('album_id', album.id)
      .eq('user_id', meId)
      .maybeSingle();
    isFollowingAlbum = Boolean(follow);
    const { data: photos } = await supabase!
      .from('album_photos')
      .select('image_url')
      .eq('album_id', album.id)
      .order('created_at', { ascending: false })
      .limit(3);
    albumPreviewUrls = (photos ?? []).map((p: any) => p.image_url as string);
  }

  const { data: pendingInvites } = await supabase!
    .from('trip_invites')
    .select('id, invitee_id')
    .eq('trip_id', t.id)
    .eq('status', 'pending');

  const { data: channel } = await supabase!
    .from('channels')
    .select('id')
    .eq('trip_id', t.id)
    .eq('slug', 'trip')
    .maybeSingle();

  const pendingInviteeIds = (pendingInvites ?? []).map(
    (i: any) => i.invitee_id as string,
  );
  const myInvite = (pendingInvites ?? []).find(
    (i: any) => i.invitee_id === meId,
  );

  return {
    id: t.id,
    ownerId,
    status: t.status,
    openToJoin: t.open_to_join,
    destinationCity: t.destination_city,
    destinationCountry: t.destination_country,
    dateLabel: t.date_label ?? '',
    dateStart: t.date_start ?? null,
    dateEnd: t.date_end ?? null,
    leavingTime: t.leaving_time,
    memberIds,
    myJoinStatus: req?.status ?? null,
    albumId,
    isFollowingAlbum,
    albumPreviewUrls,
    description: t.description ?? null,
    maxMembers: t.max_members ?? null,
    inviteToken: t.invite_token ?? null,
    latitude: t.latitude ?? null,
    longitude: t.longitude ?? null,
    channelId: channel?.id ?? null,
    pendingInviteeIds,
    myPendingInviteId: (myInvite?.id as string) ?? null,
  };
}

function mapFeedPostRow(row: any): FeedPost {
  const crops = Array.isArray(row.photo_crops) ? row.photo_crops : [];
  return {
    id: row.id,
    authorId: row.author_id,
    caption: row.caption ?? '',
    locationLabel: row.location_label,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.created_at,
    photoUrls: row.photo_urls ?? [],
    photoCrops: crops.map((c: any) =>
      c && typeof c === 'object'
        ? {
            scale: Number(c.scale) || 1,
            offsetX: Number(c.offsetX) || 0,
            offsetY: Number(c.offsetY) || 0,
          }
        : { ...DEFAULT_CROP },
    ),
    stampCount: row.stamp_count ?? 0,
    iStamped: Boolean(row.i_stamped),
    stamperPreviewIds: row.stamper_preview_ids ?? [],
    displayMode: row.display_mode ?? 'carousel',
    collageLayoutId: row.collage_layout_id ?? null,
    audience: row.audience ?? 'all',
    audienceCommunityIds: row.audience_community_ids ?? [],
    taggedTripId: row.tagged_trip_id ?? null,
    taggedUserIds: row.tagged_user_ids ?? [],
  };
}

async function uploadPostPhoto(
  userId: string,
  localUri: string,
  index: number,
): Promise<string> {
  const ext =
    localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const path = `${userId}/${Date.now()}-${index}.${ext}`;
  const res = await fetch(localUri);
  const buf = await res.arrayBuffer();
  const contentType =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const { error } = await supabase!.storage
    .from('post-photos')
    .upload(path, buf, { contentType, upsert: false });
  if (error) throw error;
  const { data } = supabase!.storage.from('post-photos').getPublicUrl(path);
  return data.publicUrl;
}

async function uploadAlbumPhoto(
  userId: string,
  localUri: string,
  index: number,
): Promise<string> {
  // Module / require assets — skip storage and keep as-is for hybrid demo
  if (typeof localUri === 'number' || !String(localUri).startsWith('http') && !String(localUri).startsWith('file') && !String(localUri).startsWith('blob') && !String(localUri).startsWith('data:')) {
    if (typeof localUri !== 'string') return String(localUri);
  }
  const uri = String(localUri);
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const path = `${userId}/${Date.now()}-${index}.${ext}`;
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  const contentType =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const { error } = await supabase!.storage
    .from('album-photos')
    .upload(path, buf, { contentType, upsert: false });
  if (error) {
    // Fallback to post-photos bucket if album bucket not migrated yet
    const retry = await supabase!.storage
      .from('post-photos')
      .upload(`album/${path}`, buf, { contentType, upsert: false });
    if (retry.error) throw retry.error;
    const { data } = supabase!.storage
      .from('post-photos')
      .getPublicUrl(`album/${path}`);
    return data.publicUrl;
  }
  const { data } = supabase!.storage.from('album-photos').getPublicUrl(path);
  return data.publicUrl;
}

function mapProfile(row: any): ChatProfile {
  const fullName = row.full_name ?? 'User';
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName,
    avatar: row.avatar_url || defaultAvatarUrl(fullName),
    homeUniversity: row.home_university,
    studyAbroadProgram: row.study_abroad_program,
    homeAccent: row.home_accent,
    abroadAccent: row.abroad_accent,
    bio: row.bio ?? null,
    semester: row.semester ?? null,
    hostCity: row.host_city ?? null,
    hostCountry: row.host_country ?? null,
    hostLatitude:
      typeof row.host_latitude === 'number' ? row.host_latitude : null,
    hostLongitude:
      typeof row.host_longitude === 'number' ? row.host_longitude : null,
    citiesVisited:
      typeof row.cities_visited === 'number' ? row.cities_visited : null,
    countriesVisited:
      typeof row.countries_visited === 'number' ? row.countries_visited : null,
    explorerScoreMiles:
      typeof row.explorer_score_miles === 'number'
        ? row.explorer_score_miles
        : null,
    isVerifiedStudent: Boolean(row.is_verified_student),
    studentEmail: row.student_email ?? null,
    phoneNumber: row.phone_number ?? null,
    dateOfBirth: row.date_of_birth ?? null,
  };
}

function mapMessage(row: any): ChatMessage {
  const reactionsRaw = row.message_reactions ?? [];
  const byEmoji: Record<string, string[]> = {};
  for (const r of reactionsRaw) {
    (byEmoji[r.emoji] ??= []).push(r.user_id);
  }
  const metadata = row.metadata ?? {};
  const tripId =
    row.trip_id ??
    (typeof metadata.tripId === 'string' ? metadata.tripId : null);
  return {
    id: row.id,
    channelId: row.channel_id ?? undefined,
    dmThreadId: row.dm_thread_id ?? undefined,
    senderId: row.sender_id,
    kind: row.kind,
    body: row.body ?? undefined,
    replyToId: row.reply_to_id,
    tripId,
    pollId: row.poll_id,
    imageUrl: row.image_url,
    postId: row.post_id ?? null,
    createdAt: row.created_at,
    reactions: Object.entries(byEmoji).map(([emoji, userIds]) => ({ emoji, userIds })),
    metadata,
  };
}
