import { getSupabaseAdmin } from './supabaseAdmin';

export type SignupPoint = { date: string; count: number };

export type RankedRow = { name: string; count: number };

export type RecentSignup = {
  id: string;
  name: string;
  school: string;
  program: string;
  createdAt: string;
};

export type RecentReport = {
  id: string;
  targetType: string;
  reason: string;
  status: string;
  createdAt: string;
};

export type ActivityPoint = {
  date: string;
  activeUsers: number;
  opens: number;
};

export type ActivityStats = {
  byDay: ActivityPoint[];
  liveNow: number;
  activeToday: number;
  active7d: number;
  active30d: number;
  opensToday: number;
  opens7d: number;
  opens30d: number;
  peakDay: { date: string; activeUsers: number } | null;
  peakOpensDay: { date: string; opens: number } | null;
  trackingEnabled: boolean;
};

export type RetentionCell = {
  day: number;
  retained: number;
  eligible: number;
  pct: number | null;
};

export type RetentionCohort = {
  cohortStart: string;
  size: number;
  cells: RetentionCell[];
};

export type RetentionCurvePoint = {
  day: number;
  retained: number;
  eligible: number;
  pct: number | null;
};

export type RetentionStats = {
  trackingEnabled: boolean;
  trackingStart: string | null;
  cohorts: RetentionCohort[];
  day1: RetentionCell;
  day7: RetentionCell;
  day30: RetentionCell;
  curve: RetentionCurvePoint[];
};

export type DashboardStats = {
  generatedAt: string;
  users: {
    total: number;
    last24h: number;
    last7d: number;
    last30d: number;
    signupsByDay: SignupPoint[];
    recent: RecentSignup[];
    topSchools: RankedRow[];
    topPrograms: RankedRow[];
  };
  activity: ActivityStats;
  retention: RetentionStats;
  engagement: {
    trips: number;
    tripsUpcoming: number;
    posts: number;
    messages: number;
    friendships: number;
    friendRequestsPending: number;
    tripJoinRequestsPending: number;
    albumPhotos: number;
    pushTokens: number;
  };
  moderation: {
    openReports: number;
    recentReports: RecentReport[];
  };
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

function buildSignupSeries(
  rows: { created_at: string }[],
  days: number,
): SignupPoint[] {
  const counts = new Map<string, number>();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    counts.set(dayKey(d.toISOString()), 0);
  }

  for (const row of rows) {
    const key = dayKey(row.created_at);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

function rankField(
  rows: Record<string, unknown>[],
  field: string,
  limit = 8,
): RankedRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = row[field];
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

async function countRows(table: string) {
  const admin = getSupabaseAdmin();
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countRowsGte(table: string, column: string, value: string) {
  const admin = getSupabaseAdmin();
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .gte(column, value);
  if (error) throw error;
  return count ?? 0;
}

async function countRowsEq(table: string, column: string, value: string) {
  const admin = getSupabaseAdmin();
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

async function countRowsIn(table: string, column: string, values: string[]) {
  const admin = getSupabaseAdmin();
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .in(column, values);
  if (error) throw error;
  return count ?? 0;
}

function buildActivitySeries(
  rows: { user_id: string; created_at: string }[],
  days: number,
): ActivityPoint[] {
  const perDay = new Map<string, { users: Set<string>; opens: number }>();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    perDay.set(dayKey(d.toISOString()), { users: new Set(), opens: 0 });
  }

  for (const row of rows) {
    const day = perDay.get(dayKey(row.created_at));
    if (!day) continue;
    day.users.add(row.user_id);
    day.opens += 1;
  }

  return Array.from(perDay.entries()).map(([date, day]) => ({
    date,
    activeUsers: day.users.size,
    opens: day.opens,
  }));
}

function emptyActivityStats(): ActivityStats {
  return {
    byDay: buildActivitySeries([], 30),
    liveNow: 0,
    activeToday: 0,
    active7d: 0,
    active30d: 0,
    opensToday: 0,
    opens7d: 0,
    opens30d: 0,
    peakDay: null,
    peakOpensDay: null,
    trackingEnabled: false,
  };
}

function isMissingActivityTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /does not exist|schema cache/i.test(error.message || '')
  );
}

/**
 * Daily active users + app opens for the last 30 days, from
 * user_activity_events (kind = 'app_open'). "Live now" is profiles whose
 * last_active_at is within the last 15 minutes (any recorded activity).
 * Never throws: if activity tracking is unavailable the dashboard still
 * loads with zeroed activity stats.
 */
async function fetchActivityStats(): Promise<ActivityStats> {
  try {
    const admin = getSupabaseAdmin();
    // Calendar-day windows (29/6 days back from today at 00:00 UTC) so the
    // totals match the 30-day chart day for day.
    const since30d = isoDaysAgo(29);
    const since7d = isoDaysAgo(6);
    const sinceToday = isoDaysAgo(0);
    const liveSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Paginate: the client caps a single select at 1,000 rows.
    const rows: { user_id: string; created_at: string }[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin
        .from('user_activity_events')
        .select('user_id, created_at')
        .eq('kind', 'app_open')
        .gte('created_at', since30d)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        if (isMissingActivityTable(error)) return emptyActivityStats();
        throw error;
      }
      rows.push(...(data ?? []));
      if ((data ?? []).length < pageSize) break;
    }

    const byDay = buildActivitySeries(rows, 30);
    const usersToday = new Set<string>();
    const users7d = new Set<string>();
    const users30d = new Set<string>();
    let opensToday = 0;
    let opens7d = 0;
    for (const row of rows) {
      users30d.add(row.user_id);
      if (row.created_at >= since7d) {
        users7d.add(row.user_id);
        opens7d += 1;
      }
      if (row.created_at >= sinceToday) {
        usersToday.add(row.user_id);
        opensToday += 1;
      }
    }

    let liveNow = 0;
    try {
      liveNow = await countRowsGte('profiles', 'last_active_at', liveSince);
    } catch {
      liveNow = 0;
    }

    let peakDay: { date: string; activeUsers: number } | null = null;
    for (const point of byDay) {
      if (!peakDay || point.activeUsers > peakDay.activeUsers) {
        peakDay = { date: point.date, activeUsers: point.activeUsers };
      }
    }
    if (peakDay && peakDay.activeUsers === 0) peakDay = null;

    let peakOpensDay: { date: string; opens: number } | null = null;
    for (const point of byDay) {
      if (!peakOpensDay || point.opens > peakOpensDay.opens) {
        peakOpensDay = { date: point.date, opens: point.opens };
      }
    }
    if (peakOpensDay && peakOpensDay.opens === 0) peakOpensDay = null;

    return {
      byDay,
      liveNow,
      activeToday: usersToday.size,
      active7d: users7d.size,
      active30d: users30d.size,
      opensToday,
      opens7d,
      opens30d: rows.length,
      peakDay,
      peakOpensDay,
      trackingEnabled: true,
    };
  } catch {
    return emptyActivityStats();
  }
}

function emptyRetentionStats(): RetentionStats {
  const emptyCell = (day: number): RetentionCell => ({
    day,
    retained: 0,
    eligible: 0,
    pct: null,
  });
  return {
    trackingEnabled: false,
    trackingStart: null,
    cohorts: [],
    day1: emptyCell(1),
    day7: emptyCell(7),
    day30: emptyCell(30),
    curve: Array.from({ length: 31 }, (_, day) => ({
      day,
      retained: 0,
      eligible: 0,
      pct: null,
    })),
  };
}

function parseDayKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function daysBetween(fromKey: string, toKey: string) {
  return Math.round(
    (parseDayKey(toKey) - parseDayKey(fromKey)) / (24 * 60 * 60 * 1000),
  );
}

function addDaysToKey(key: string, days: number) {
  const d = new Date(parseDayKey(key) + days * 24 * 60 * 60 * 1000);
  return dayKey(d.toISOString());
}

function mondayKey(key: string) {
  const ms = parseDayKey(key);
  const dayOfWeek = new Date(ms).getUTCDay();
  const back = (dayOfWeek + 6) % 7;
  return addDaysToKey(key, -back);
}

const RETENTION_COHORT_DAYS = [0, 1, 3, 7, 14, 30];

// Cohorts go back to the start of October 2026.
const RETENTION_SINCE = '2026-10-01';

/**
 * Cohort retention — the standard way consumer apps track it. Rows are
 * weekly signup cohorts (Monday-start, UTC) going back to Oct 1, 2026;
 * each cell is the share of that cohort who opened the app N days after
 * signing up. A user only counts as eligible for day N once N days have
 * passed since their own signup, so recent cohorts show "—" for days they
 * have not reached yet. Days before app-open tracking began (Oct 18,
 * 2026) were never recorded, so they are not measurable either: a user
 * only counts for day N when signup day + N falls on/after tracking
 * started. That keeps early-October cohorts honest instead of reading
 * 0% for days with no data. Never throws.
 */
async function fetchRetentionStats(): Promise<RetentionStats> {
  try {
    const admin = getSupabaseAdmin();
    const today = dayKey(new Date().toISOString());
    const sinceUsers = isoDaysAgo(84);
    const sinceEvents = isoDaysAgo(120);
    const pageSize = 1000;

    const profiles: { id: string; created_at: string }[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin
        .from('profiles')
        .select('id, created_at')
        .gte('created_at', sinceUsers)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      profiles.push(...(data ?? []));
      if ((data ?? []).length < pageSize) break;
    }

    const events: { user_id: string; created_at: string }[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin
        .from('user_activity_events')
        .select('user_id, created_at')
        .eq('kind', 'app_open')
        .gte('created_at', sinceEvents)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        if (isMissingActivityTable(error)) return emptyRetentionStats();
        throw error;
      }
      events.push(...(data ?? []));
      if ((data ?? []).length < pageSize) break;
    }

    if (events.length === 0) return emptyRetentionStats();
    const trackingStart = dayKey(events[0].created_at);

    const activeDays = new Map<string, Set<string>>();
    for (const event of events) {
      const days = activeDays.get(event.user_id) ?? new Set<string>();
      days.add(dayKey(event.created_at));
      activeDays.set(event.user_id, days);
    }

    const users = profiles
      .map((p) => ({ id: p.id, signupDay: dayKey(p.created_at) }))
      .filter((u) => u.signupDay >= RETENTION_SINCE);
    if (users.length === 0) {
      return { ...emptyRetentionStats(), trackingEnabled: true, trackingStart };
    }

    const cellFor = (members: { id: string; signupDay: string }[], day: number): RetentionCell => {
      let eligible = 0;
      let retained = 0;
      for (const user of members) {
        const targetDay = addDaysToKey(user.signupDay, day);
        // Day falls before tracking began — never recorded, not measurable.
        if (targetDay < trackingStart) continue;
        if (daysBetween(user.signupDay, today) < day) continue;
        eligible += 1;
        if (activeDays.get(user.id)?.has(targetDay)) {
          retained += 1;
        }
      }
      return {
        day,
        retained,
        eligible,
        pct: eligible > 0 ? Math.round((retained / eligible) * 100) : null,
      };
    };

    const byCohort = new Map<string, { id: string; signupDay: string }[]>();
    for (const user of users) {
      const key = mondayKey(user.signupDay);
      const members = byCohort.get(key) ?? [];
      members.push(user);
      byCohort.set(key, members);
    }
    const cohorts: RetentionCohort[] = Array.from(byCohort.entries())
      .map(([cohortStart, members]) => ({
        cohortStart,
        size: members.length,
        cells: RETENTION_COHORT_DAYS.map((day) => cellFor(members, day)),
      }))
      .sort((a, b) => (a.cohortStart < b.cohortStart ? 1 : -1));

    const curve: RetentionCurvePoint[] = Array.from(
      { length: 31 },
      (_, day) => {
        const cell = cellFor(users, day);
        return { day, retained: cell.retained, eligible: cell.eligible, pct: cell.pct };
      },
    );

    return {
      trackingEnabled: true,
      trackingStart,
      cohorts,
      day1: cellFor(users, 1),
      day7: cellFor(users, 7),
      day30: cellFor(users, 30),
      curve,
    };
  } catch {
    return emptyRetentionStats();
  }
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const admin = getSupabaseAdmin();
  // Calendar-day windows so the card totals match the 30-day chart exactly
  // (30 calendar days ending today, 7 calendar days ending today).
  const since30d = isoDaysAgo(29);
  const since7d = isoDaysAgo(6);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    totalUsers,
    users24h,
    users7d,
    users30d,
    signupRows,
    recentProfiles,
    schoolRows,
    programRows,
    trips,
    tripsUpcoming,
    posts,
    messages,
    friendships,
    friendRequestsPending,
    tripJoinRequestsPending,
    albumPhotos,
    pushTokens,
    openReports,
    recentReports,
    activity,
    retention,
  ] = await Promise.all([
    countRows('profiles'),
    countRowsGte('profiles', 'created_at', since24h),
    countRowsGte('profiles', 'created_at', since7d),
    countRowsGte('profiles', 'created_at', since30d),
    admin
      .from('profiles')
      .select('created_at')
      .gte('created_at', since30d)
      .order('created_at', { ascending: true }),
    admin
      .from('profiles')
      .select('id, full_name, home_university, study_abroad_program, created_at')
      .order('created_at', { ascending: false })
      .limit(12),
    admin.from('profiles').select('home_university'),
    admin.from('profiles').select('study_abroad_program'),
    countRows('trips'),
    countRowsIn('trips', 'status', ['upcoming', 'planning']),
    countRows('posts'),
    countRows('messages'),
    countRows('friendships'),
    countRowsEq('friend_requests', 'status', 'pending'),
    countRowsEq('trip_join_requests', 'status', 'pending'),
    countRows('album_photos'),
    countRows('user_push_tokens'),
    countRowsEq('content_reports', 'status', 'open'),
    admin
      .from('content_reports')
      .select('id, target_type, reason, status, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
    fetchActivityStats(),
    fetchRetentionStats(),
  ]);

  if (signupRows.error) throw signupRows.error;
  if (recentProfiles.error) throw recentProfiles.error;
  if (schoolRows.error) throw schoolRows.error;
  if (programRows.error) throw programRows.error;
  if (recentReports.error) throw recentReports.error;

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: totalUsers,
      last24h: users24h,
      last7d: users7d,
      last30d: users30d,
      signupsByDay: buildSignupSeries(signupRows.data ?? [], 30),
      recent: (recentProfiles.data ?? []).map((p) => ({
        id: p.id,
        name: p.full_name,
        school: p.home_university,
        program: p.study_abroad_program,
        createdAt: p.created_at,
      })),
      topSchools: rankField(schoolRows.data ?? [], 'home_university'),
      topPrograms: rankField(programRows.data ?? [], 'study_abroad_program'),
    },
    activity,
    retention,
    engagement: {
      trips,
      tripsUpcoming,
      posts,
      messages,
      friendships,
      friendRequestsPending,
      tripJoinRequestsPending,
      albumPhotos,
      pushTokens,
    },
    moderation: {
      openReports,
      recentReports: (recentReports.data ?? []).map((r) => ({
        id: r.id,
        targetType: r.target_type,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
      })),
    },
  };
}
