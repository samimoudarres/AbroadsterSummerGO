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

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const admin = getSupabaseAdmin();
  const since30d = isoDaysAgo(30);
  const since7d = isoDaysAgo(7);
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
