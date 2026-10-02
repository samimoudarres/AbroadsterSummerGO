import { getSupabaseAdmin } from './supabaseAdmin';

export type DayCount = { date: string; count: number };

export type UserListRow = {
  id: string;
  name: string;
  school: string;
  program: string;
  createdAt: string;
  lastActiveAt: string | null;
  lastSignInAt: string | null;
  posts: number;
  stampsGiven: number;
  messages: number;
  appOpens7d: number;
  hasPush: boolean;
};

export type UserActivityDetail = {
  generatedAt: string;
  profile: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    school: string;
    program: string;
    hostCity: string | null;
    hostCountry: string | null;
    avatarUrl: string | null;
    createdAt: string;
    lastActiveAt: string | null;
    explorerScoreMiles: number;
    citiesVisited: number | null;
    isVerifiedStudent: boolean;
  };
  auth: {
    lastSignInAt: string | null;
    email: string | null;
    phone: string | null;
  };
  totals: {
    posts: number;
    stampsGiven: number;
    stampsReceived: number;
    messagesSent: number;
    friends: number;
    tripsMember: number;
    tripsOwned: number;
    albumPhotos: number;
    notificationsReceived: number;
    notificationsUnread: number;
    notificationsRead: number;
    pushTokens: number;
    appOpens: number;
    homeFeedViews: number;
    notificationsOpens: number;
  };
  windows: {
    posts7d: number;
    posts30d: number;
    stampsGiven7d: number;
    stampsGiven30d: number;
    messages7d: number;
    messages30d: number;
    appOpensToday: number;
    appOpens7d: number;
    appOpens30d: number;
    avgAppOpensPerDay7d: number;
  };
  series: {
    appOpensByDay: DayCount[];
    postsByDay: DayCount[];
    stampsByDay: DayCount[];
  };
  notificationsByKind: { kind: string; count: number }[];
  recent: {
    posts: { id: string; caption: string; createdAt: string }[];
    appOpens: { createdAt: string; source: string }[];
  };
  activityTrackingEnabled: boolean;
};

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function emptySeries(days: number): Map<string, number> {
  const counts = new Map<string, number>();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    counts.set(dayKey(d.toISOString()), 0);
  }
  return counts;
}

function toSeries(map: Map<string, number>): DayCount[] {
  return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
}

function fillSeries(
  rows: { created_at: string }[],
  days: number,
): DayCount[] {
  const counts = emptySeries(days);
  for (const row of rows) {
    const key = dayKey(row.created_at);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return toSeries(counts);
}

async function countEq(
  table: string,
  column: string,
  value: string,
  since?: string,
  sinceColumn = 'created_at',
) {
  const admin = getSupabaseAdmin();
  let q = admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value);
  if (since) q = q.gte(sinceColumn, since);
  const { count, error } = await q;
  if (error) {
    // Missing table / column — treat as zero so dashboard stays resilient.
    if (
      error.code === 'PGRST205' ||
      error.code === '42P01' ||
      /does not exist|schema cache/i.test(error.message)
    ) {
      return 0;
    }
    throw error;
  }
  return count ?? 0;
}

async function tableExists(table: string) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from(table).select('id', { head: true, count: 'exact' }).limit(1);
  if (!error) return true;
  if (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /does not exist|schema cache/i.test(error.message)
  ) {
    return false;
  }
  // Other errors still mean the table is addressable.
  return true;
}

export async function fetchUsersActivityList(): Promise<UserListRow[]> {
  const admin = getSupabaseAdmin();
  const since7d = isoDaysAgo(7);
  const hasActivity = await tableExists('user_activity_events');

  let profiles: {
    id: string;
    full_name: string | null;
    home_university: string | null;
    study_abroad_program: string | null;
    created_at: string;
    last_active_at?: string | null;
  }[] = [];

  {
    const withActive = await admin
      .from('profiles')
      .select(
        'id, full_name, home_university, study_abroad_program, created_at, last_active_at',
      )
      .order('created_at', { ascending: false })
      .limit(200);
    if (withActive.error) {
      const fallback = await admin
        .from('profiles')
        .select(
          'id, full_name, home_university, study_abroad_program, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(200);
      if (fallback.error) throw fallback.error;
      profiles = fallback.data ?? [];
    } else {
      profiles = withActive.data ?? [];
    }
  }

  const ids = profiles.map((p) => p.id);
  if (!ids.length) return [];

  const [
    posts,
    stamps,
    messages,
    pushTokens,
    appOpens,
    authUsers,
  ] = await Promise.all([
    admin.from('posts').select('author_id').in('author_id', ids),
    admin.from('post_stamps').select('user_id').in('user_id', ids),
    admin.from('messages').select('sender_id').in('sender_id', ids),
    admin.from('user_push_tokens').select('user_id').in('user_id', ids),
    hasActivity
      ? admin
          .from('user_activity_events')
          .select('user_id')
          .eq('kind', 'app_open')
          .gte('created_at', since7d)
          .in('user_id', ids)
      : Promise.resolve({ data: [] as { user_id: string }[], error: null }),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);

  if (posts.error) throw posts.error;
  if (stamps.error) throw stamps.error;
  if (messages.error) throw messages.error;
  if (pushTokens.error) throw pushTokens.error;
  if (appOpens.error) throw appOpens.error;

  const countMap = (rows: { [k: string]: string }[] | null, key: string) => {
    const m = new Map<string, number>();
    for (const row of rows ?? []) {
      const id = row[key];
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  };

  const postCounts = countMap(posts.data as any, 'author_id');
  const stampCounts = countMap(stamps.data as any, 'user_id');
  const messageCounts = countMap(messages.data as any, 'sender_id');
  const openCounts = countMap(appOpens.data as any, 'user_id');
  const pushSet = new Set((pushTokens.data ?? []).map((r) => r.user_id));
  const signInById = new Map(
    (authUsers.data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]),
  );

  return profiles.map((p) => ({
    id: p.id,
    name: p.full_name || 'User',
    school: p.home_university || '—',
    program: p.study_abroad_program || '—',
    createdAt: p.created_at,
    lastActiveAt: p.last_active_at ?? null,
    lastSignInAt: signInById.get(p.id) ?? null,
    posts: postCounts.get(p.id) ?? 0,
    stampsGiven: stampCounts.get(p.id) ?? 0,
    messages: messageCounts.get(p.id) ?? 0,
    appOpens7d: openCounts.get(p.id) ?? 0,
    hasPush: pushSet.has(p.id),
  }));
}

export async function fetchUserActivityDetail(
  userId: string,
): Promise<UserActivityDetail> {
  const admin = getSupabaseAdmin();
  const since30d = isoDaysAgo(30);
  const since7d = isoDaysAgo(7);
  const sinceToday = isoDaysAgo(0);
  const hasActivity = await tableExists('user_activity_events');

  const { data: profileData, error: profileErr } = await admin
    .from('profiles')
    .select(
      'id, first_name, last_name, full_name, home_university, study_abroad_program, host_city, host_country, avatar_url, created_at, last_active_at, explorer_score_miles, cities_visited, is_verified_student, login_email, phone_number, student_email',
    )
    .eq('id', userId)
    .maybeSingle();

  let profileRow = profileData as
    | (NonNullable<typeof profileData> & { last_active_at?: string | null })
    | null;
  if (profileErr) {
    const fallback = await admin
      .from('profiles')
      .select(
        'id, first_name, last_name, full_name, home_university, study_abroad_program, host_city, host_country, avatar_url, created_at, explorer_score_miles, cities_visited, is_verified_student, login_email, phone_number, student_email',
      )
      .eq('id', userId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    profileRow = fallback.data as typeof profileRow;
  }
  if (!profileRow) throw new Error('User not found');
  const profile = {
    ...profileRow,
    last_active_at: profileRow.last_active_at ?? null,
  };

  const authUser = await admin.auth.admin.getUserById(userId);

  const postIdsRes = await admin.from('posts').select('id').eq('author_id', userId);
  if (postIdsRes.error) throw postIdsRes.error;
  const postIds = (postIdsRes.data ?? []).map((p) => p.id);

  const [
    postsTotal,
    posts7d,
    posts30d,
    stampsGiven,
    stampsGiven7d,
    stampsGiven30d,
    stampsReceived,
    messagesSent,
    messages7d,
    messages30d,
    friends,
    tripsMember,
    tripsOwned,
    albumPhotos,
    notificationsReceived,
    notificationsUnread,
    pushTokens,
    appOpens,
    appOpensToday,
    appOpens7d,
    appOpens30d,
    homeFeedViews,
    notificationsOpens,
    postsSeriesRows,
    stampsSeriesRows,
    opensSeriesRows,
    notifKinds,
    recentPosts,
    recentOpens,
  ] = await Promise.all([
    countEq('posts', 'author_id', userId),
    countEq('posts', 'author_id', userId, since7d),
    countEq('posts', 'author_id', userId, since30d),
    countEq('post_stamps', 'user_id', userId),
    countEq('post_stamps', 'user_id', userId, since7d),
    countEq('post_stamps', 'user_id', userId, since30d),
    postIds.length
      ? admin
          .from('post_stamps')
          .select('*', { count: 'exact', head: true })
          .in('post_id', postIds)
          .then((r) => {
            if (r.error) throw r.error;
            return r.count ?? 0;
          })
      : Promise.resolve(0),
    countEq('messages', 'sender_id', userId),
    countEq('messages', 'sender_id', userId, since7d),
    countEq('messages', 'sender_id', userId, since30d),
    countEq('friendships', 'user_id', userId),
    countEq('trip_members', 'user_id', userId),
    countEq('trips', 'owner_id', userId),
    countEq('album_photos', 'uploader_id', userId),
    countEq('notifications', 'user_id', userId),
    admin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
      .then((r) => {
        if (r.error) throw r.error;
        return r.count ?? 0;
      }),
    countEq('user_push_tokens', 'user_id', userId),
    hasActivity
      ? admin
          .from('user_activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('kind', 'app_open')
          .then((r) => (r.error ? 0 : r.count ?? 0))
      : Promise.resolve(0),
    hasActivity
      ? admin
          .from('user_activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('kind', 'app_open')
          .gte('created_at', sinceToday)
          .then((r) => (r.error ? 0 : r.count ?? 0))
      : Promise.resolve(0),
    hasActivity
      ? admin
          .from('user_activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('kind', 'app_open')
          .gte('created_at', since7d)
          .then((r) => (r.error ? 0 : r.count ?? 0))
      : Promise.resolve(0),
    hasActivity
      ? admin
          .from('user_activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('kind', 'app_open')
          .gte('created_at', since30d)
          .then((r) => (r.error ? 0 : r.count ?? 0))
      : Promise.resolve(0),
    hasActivity
      ? admin
          .from('user_activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('kind', 'home_feed')
          .then((r) => (r.error ? 0 : r.count ?? 0))
      : Promise.resolve(0),
    hasActivity
      ? admin
          .from('user_activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('kind', 'notifications_open')
          .then((r) => (r.error ? 0 : r.count ?? 0))
      : Promise.resolve(0),
    admin
      .from('posts')
      .select('created_at')
      .eq('author_id', userId)
      .gte('created_at', since30d),
    admin
      .from('post_stamps')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', since30d),
    hasActivity
      ? admin
          .from('user_activity_events')
          .select('created_at')
          .eq('user_id', userId)
          .eq('kind', 'app_open')
          .gte('created_at', since30d)
      : Promise.resolve({ data: [] as { created_at: string }[], error: null }),
    admin.from('notifications').select('kind').eq('user_id', userId),
    admin
      .from('posts')
      .select('id, caption, created_at')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(8),
    hasActivity
      ? admin
          .from('user_activity_events')
          .select('created_at, meta')
          .eq('user_id', userId)
          .eq('kind', 'app_open')
          .order('created_at', { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (postsSeriesRows.error) throw postsSeriesRows.error;
  if (stampsSeriesRows.error) throw stampsSeriesRows.error;
  if (opensSeriesRows.error) throw opensSeriesRows.error;
  if (notifKinds.error) throw notifKinds.error;
  if (recentPosts.error) throw recentPosts.error;
  if (recentOpens.error) throw recentOpens.error;

  const kindCounts = new Map<string, number>();
  for (const row of notifKinds.data ?? []) {
    const k = row.kind || 'unknown';
    kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1);
  }

  const notificationsRead = Math.max(
    0,
    notificationsReceived - notificationsUnread,
  );

  return {
    generatedAt: new Date().toISOString(),
    profile: {
      id: profile.id,
      name: profile.full_name || 'User',
      firstName: profile.first_name || '',
      lastName: profile.last_name || '',
      school: profile.home_university || '—',
      program: profile.study_abroad_program || '—',
      hostCity: profile.host_city,
      hostCountry: profile.host_country,
      avatarUrl: profile.avatar_url,
      createdAt: profile.created_at,
      lastActiveAt: profile.last_active_at,
      explorerScoreMiles: profile.explorer_score_miles ?? 0,
      citiesVisited: profile.cities_visited,
      isVerifiedStudent: Boolean(profile.is_verified_student),
    },
    auth: {
      lastSignInAt: authUser.data.user?.last_sign_in_at ?? null,
      email:
        profile.login_email ||
        profile.student_email ||
        authUser.data.user?.email ||
        null,
      phone: profile.phone_number || authUser.data.user?.phone || null,
    },
    totals: {
      posts: postsTotal,
      stampsGiven,
      stampsReceived,
      messagesSent,
      friends,
      tripsMember,
      tripsOwned,
      albumPhotos,
      notificationsReceived,
      notificationsUnread,
      notificationsRead,
      pushTokens,
      appOpens,
      homeFeedViews,
      notificationsOpens,
    },
    windows: {
      posts7d,
      posts30d,
      stampsGiven7d,
      stampsGiven30d,
      messages7d,
      messages30d,
      appOpensToday,
      appOpens7d,
      appOpens30d,
      avgAppOpensPerDay7d: Math.round((appOpens7d / 7) * 10) / 10,
    },
    series: {
      appOpensByDay: fillSeries(opensSeriesRows.data ?? [], 30),
      postsByDay: fillSeries(postsSeriesRows.data ?? [], 30),
      stampsByDay: fillSeries(stampsSeriesRows.data ?? [], 30),
    },
    notificationsByKind: Array.from(kindCounts.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    recent: {
      posts: (recentPosts.data ?? []).map((p) => ({
        id: p.id,
        caption: (p.caption || '').slice(0, 120),
        createdAt: p.created_at,
      })),
      appOpens: (recentOpens.data ?? []).map((r: any) => ({
        createdAt: r.created_at,
        source:
          typeof r.meta?.source === 'string'
            ? r.meta.source
            : typeof r.meta?.platform === 'string'
              ? r.meta.platform
              : 'app',
      })),
    },
    activityTrackingEnabled: hasActivity,
  };
}
