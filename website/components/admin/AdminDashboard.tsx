'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DashboardStats } from '@/lib/admin/stats';
import type { UserListRow } from '@/lib/admin/userActivity';
import { UserActivityPanel } from './UserActivityPanel';
import styles from '../../app/admin/admin.module.css';

const SUPABASE_PROJECT_URL =
  'https://supabase.com/dashboard/project/ajwnvwvpvasxkwpfdsvo';

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatDay(date: string) {
  const parts = date.split('-');
  if (parts.length !== 3) return date;
  return `${MONTHS[Number(parts[1]) - 1]} ${Number(parts[2])}`;
}

// Bar heights are pixels, not percentages: percentage heights never resolve
// inside these flex column wrappers, so every bar rendered at the 4px
// min-height and the charts looked flat/zero.
const CHART_BAR_MAX_PX = 140;

function formatHour(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * Intraday line chart: distinct active users per hour (UTC) for today.
 * The line only runs up to the current hour — later hours have no data
 * yet. Hovering an hour shows its numbers in the tip line above.
 */
function HourlyLineChart({
  points,
  currentHour,
  hoveredHour,
  onHoverHour,
}: {
  points: { hour: number; users: number }[];
  currentHour: number;
  hoveredHour: number | null;
  onHoverHour: (hour: number | null) => void;
}) {
  const W = 720;
  const H = 190;
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...points.map((p) => p.users));
  const x = (hour: number) => padL + (hour / 23) * plotW;
  const y = (v: number) => padT + (1 - v / max) * plotH;

  const visible = points.filter((p) => p.hour <= currentHour);
  const line = visible
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.hour).toFixed(1)},${y(p.users).toFixed(1)}`)
    .join(' ');
  const area =
    visible.length > 0
      ? `${line} L${x(visible[visible.length - 1].hour).toFixed(1)},${y(0).toFixed(1)} L${x(visible[0].hour).toFixed(1)},${y(0).toFixed(1)} Z`
      : '';
  const peak = points.reduce(
    (best, p) => (p.users > best.users ? p : best),
    { hour: -1, users: 0 },
  );
  const hovered = hoveredHour !== null ? points[hoveredHour] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={styles.lineChart}
      role="img"
      aria-label="Active users per hour today, UTC"
      onMouseLeave={() => onHoverHour(null)}
    >
      {[0, 0.5, 1].map((f) => {
        const v = Math.round(max * f);
        return (
          <g key={f}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(v)}
              y2={y(v)}
              stroke="rgba(23,88,100,0.12)"
              strokeWidth={1}
            />
            <text
              x={padL - 6}
              y={y(v) + 3}
              textAnchor="end"
              fontSize={10}
              fill="#4a5c64"
            >
              {v}
            </text>
          </g>
        );
      })}
      {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
        <text
          key={hour}
          x={x(hour)}
          y={H - 8}
          textAnchor="middle"
          fontSize={10}
          fill="#4a5c64"
        >
          {formatHour(hour)}
        </text>
      ))}
      {area ? <path d={area} fill="rgba(47,143,157,0.12)" /> : null}
      {line ? (
        <path
          d={line}
          fill="none"
          stroke="#2f8f9d"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {visible.map((p) => (
        <circle
          key={p.hour}
          cx={x(p.hour)}
          cy={y(p.users)}
          r={p.hour === peak.hour && p.users > 0 ? 5 : 3}
          fill={p.hour === peak.hour && p.users > 0 ? '#b7791f' : '#175864'}
          stroke="#ffffff"
          strokeWidth={1}
        />
      ))}
      {hovered && hovered.hour <= currentHour ? (
        <g>
          <line
            x1={x(hovered.hour)}
            x2={x(hovered.hour)}
            y1={padT}
            y2={padT + plotH}
            stroke="rgba(23,88,100,0.35)"
            strokeWidth={1}
          />
          <circle
            cx={x(hovered.hour)}
            cy={y(hovered.users)}
            r={6}
            fill="none"
            stroke="#175864"
            strokeWidth={2}
          />
        </g>
      ) : null}
      {points.map((p) => (
        <rect
          key={p.hour}
          x={padL + (p.hour / 24) * plotW}
          y={padT}
          width={plotW / 24}
          height={plotH}
          fill="transparent"
          onMouseEnter={() => onHoverHour(p.hour)}
          onClick={() => onHoverHour(p.hour)}
        />
      ))}
    </svg>
  );
}

function StatCard({
  label,
  value,
  hint,
  live,
}: {
  label: string;
  value: number;
  hint?: string;
  live?: boolean;
}) {
  return (
    <article className={styles.statCard}>
      <p className={styles.statLabel}>
        {live ? <span className={styles.liveDot} aria-label="live" /> : null}
        {label}
      </p>
      <p className={styles.statValue}>{formatNumber(value)}</p>
      {hint ? <p className={styles.statHint}>{hint}</p> : null}
    </article>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<UserListRow[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activitySeries, setActivitySeries] = useState<'users' | 'opens'>(
    'users',
  );
  const [activityView, setActivityView] = useState<'30d' | 'today'>('30d');
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [hoveredSignup, setHoveredSignup] = useState<string | null>(null);
  const [hoveredCurveDay, setHoveredCurveDay] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats', { cache: 'no-store' }),
        fetch('/api/admin/users', { cache: 'no-store' }),
      ]);

      if (statsRes.status === 401 || usersRes.status === 401) {
        router.replace('/admin/login');
        return;
      }

      const statsData = (await statsRes.json()) as {
        ok?: boolean;
        stats?: DashboardStats;
        error?: string;
      };
      const usersData = (await usersRes.json()) as {
        ok?: boolean;
        users?: UserListRow[];
        error?: string;
      };

      if (!statsRes.ok || !statsData.ok || !statsData.stats) {
        setError(statsData.error || 'Could not load dashboard stats.');
        return;
      }

      setStats(statsData.stats);
      if (usersRes.ok && usersData.ok && usersData.users) {
        setUsers(usersData.users);
      } else if (!usersRes.ok || !usersData.ok) {
        setUsers([]);
        setError(
          usersData.error ||
            statsData.error ||
            'Could not load user activity list.',
        );
        return;
      }
      setError('');
    } catch {
      setError('Network error while loading stats.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const chartMax = useMemo(() => {
    if (!stats) return 1;
    return Math.max(1, ...stats.users.signupsByDay.map((d) => d.count));
  }, [stats]);

  const activityMax = useMemo(() => {
    if (!stats) return 1;
    return Math.max(
      1,
      ...stats.activity.byDay.map((d) =>
        activitySeries === 'users' ? d.activeUsers : d.opens,
      ),
    );
  }, [stats, activitySeries]);

  const hoveredActivity = useMemo(() => {
    if (!stats || !hoveredDay) return null;
    return (
      stats.activity.byDay.find((d) => d.date === hoveredDay) ?? null
    );
  }, [stats, hoveredDay]);

  // Current UTC hour, from the data's own fetch time so it stays in sync
  // with the hourly buckets (which are UTC).
  const currentHourUtc = stats
    ? new Date(stats.generatedAt).getUTCHours()
    : new Date().getUTCHours();

  const hoveredHourlyPoint = useMemo(() => {
    if (!stats || hoveredHour === null) return null;
    return stats.hourly.points[hoveredHour] ?? null;
  }, [stats, hoveredHour]);

  const hoveredSignupPoint = useMemo(() => {
    if (!stats || !hoveredSignup) return null;
    return (
      stats.users.signupsByDay.find((d) => d.date === hoveredSignup) ?? null
    );
  }, [stats, hoveredSignup]);

  // Peak day follows the selected series (users vs opens).
  const peakActivity = useMemo(() => {
    if (!stats) return null;
    if (activitySeries === 'users') {
      const p = stats.activity.peakDay;
      return p ? { date: p.date, value: p.activeUsers, label: 'users' } : null;
    }
    const p = stats.activity.peakOpensDay;
    return p ? { date: p.date, value: p.opens, label: 'opens' } : null;
  }, [stats, activitySeries]);

  const hoveredCurvePoint = useMemo(() => {
    if (!stats || hoveredCurveDay === null) return null;
    return stats.retention.curve.find((p) => p.day === hoveredCurveDay) ?? null;
  }, [stats, hoveredCurveDay]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.school.toLowerCase().includes(q) ||
        u.program.toLowerCase().includes(q),
    );
  }, [users, userQuery]);

  async function onLogout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Live metrics</p>
          <h1 className={styles.title}>Abroadster dashboard</h1>
          <p className={styles.subtitle}>
            {stats
              ? `Last updated ${formatWhen(stats.generatedAt)} · auto-refreshes every minute`
              : 'Loading live data from Supabase…'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <a
            className={styles.secondaryBtn}
            href={SUPABASE_PROJECT_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open Supabase
          </a>
          <button className={styles.secondaryBtn} type="button" onClick={() => void load()}>
            Refresh
          </button>
          <button className={styles.primaryBtn} type="button" onClick={() => void onLogout()}>
            Sign out
          </button>
        </div>
      </header>

      {error ? <p className={styles.bannerError}>{error}</p> : null}

      {loading && !stats ? <p className={styles.loading}>Loading dashboard…</p> : null}

      {stats ? (
        <>
          <section className={styles.grid}>
            <StatCard label="Total users" value={stats.users.total} />
            <StatCard label="Signups (24h)" value={stats.users.last24h} />
            <StatCard label="Signups (7d)" value={stats.users.last7d} />
            <StatCard label="Signups (30d)" value={stats.users.last30d} />
            <StatCard
              label="Live now"
              value={stats.activity.liveNow}
              hint="active in the last 15 min"
              live
            />
            <StatCard
              label="Active today"
              value={stats.activity.activeToday}
              hint={`${formatNumber(stats.activity.opensToday)} opens today`}
            />
            <StatCard
              label="Active (30d)"
              value={stats.activity.active30d}
              hint="distinct users active in the app"
            />
            <StatCard
              label="App opens (30d)"
              value={stats.activity.opens30d}
              hint={`${formatNumber(stats.activity.opens7d)} in the last 7d`}
            />
            <StatCard
              label="Trips"
              value={stats.engagement.trips}
              hint={`${stats.engagement.tripsUpcoming} upcoming/planning`}
            />
            <StatCard label="Posts" value={stats.engagement.posts} />
            <StatCard label="Messages" value={stats.engagement.messages} />
            <StatCard label="Friendships" value={stats.engagement.friendships} />
            <StatCard label="Album photos" value={stats.engagement.albumPhotos} />
            <StatCard label="Push tokens" value={stats.engagement.pushTokens} />
            <StatCard
              label="Pending friend requests"
              value={stats.engagement.friendRequestsPending}
            />
            <StatCard
              label="Pending trip join requests"
              value={stats.engagement.tripJoinRequestsPending}
            />
            <StatCard
              label="Open reports"
              value={stats.moderation.openReports}
              hint="Needs review"
            />
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Signups · last 30 days</h2>
            <p className={styles.chartTip}>
              {hoveredSignupPoint
                ? `${formatDay(hoveredSignupPoint.date)} — ${formatNumber(hoveredSignupPoint.count)} signups`
                : 'Hover a bar to see each day.'}
            </p>
            <div
              className={styles.chart}
              onMouseLeave={() => setHoveredSignup(null)}
            >
              {stats.users.signupsByDay.map((point) => (
                <div
                  key={point.date}
                  className={styles.barWrap}
                  onMouseEnter={() => setHoveredSignup(point.date)}
                  onClick={() => setHoveredSignup(point.date)}
                >
                  <div
                    className={`${styles.bar} ${hoveredSignup === point.date ? styles.barHovered : ''}`}
                    style={{
                      height: `${Math.round((point.count / chartMax) * CHART_BAR_MAX_PX)}px`,
                    }}
                    title={`${formatDay(point.date)}: ${point.count} signups`}
                  />
                  <span className={styles.barLabel}>{point.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeaderRow}>
              <div>
                <h2 className={styles.panelTitle}>
                  {activityView === 'today'
                    ? 'Active users · today, hour by hour'
                    : 'Active users · last 30 days'}
                </h2>
                <p className={styles.subtitle}>
                  {stats.activity.trackingEnabled
                    ? activityView === 'today'
                      ? `${formatNumber(stats.hourly.totalUsers)} users active today so far${stats.hourly.peakHour !== null ? ` · peak ${formatHour(stats.hourly.peakHour)} UTC with ${formatNumber(stats.hourly.peakUsers)} users` : ''} · hours in UTC`
                      : `${formatNumber(stats.activity.active30d)} users were active in the last 30 days · ${formatNumber(stats.activity.opens30d)} app opens logged${peakActivity ? ` · peak ${formatDay(peakActivity.date)} with ${formatNumber(peakActivity.value)} ${peakActivity.label}` : ''}`
                    : 'App-open tracking is not available yet — no activity data in Supabase.'}
                </p>
              </div>
              {activityView === '30d' ? (
                <div className={styles.toggle} role="group" aria-label="Chart series">
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${activitySeries === 'users' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setActivitySeries('users')}
                  >
                    Active users
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${activitySeries === 'opens' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setActivitySeries('opens')}
                  >
                    App opens
                  </button>
                </div>
              ) : null}
            </div>
            <div
              className={styles.toggle}
              role="group"
              aria-label="Activity view"
              style={{ marginBottom: '0.6rem' }}
            >
              <button
                type="button"
                className={`${styles.toggleBtn} ${activityView === '30d' ? styles.toggleBtnActive : ''}`}
                onClick={() => setActivityView('30d')}
              >
                30 days
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${activityView === 'today' ? styles.toggleBtnActive : ''}`}
                onClick={() => setActivityView('today')}
              >
                Today (hourly)
              </button>
            </div>
            <p className={styles.chartTip}>
              {activityView === 'today'
                ? hoveredHourlyPoint
                  ? `${formatHour(hoveredHourlyPoint.hour)} UTC — ${formatNumber(hoveredHourlyPoint.users)} active users`
                  : stats.hourly.peakHour !== null
                    ? `Hover the line to see each hour — peak so far: ${formatHour(stats.hourly.peakHour)} UTC (${formatNumber(stats.hourly.peakUsers)} users)`
                    : 'Hover the line to see each hour.'
                : hoveredActivity
                  ? `${formatDay(hoveredActivity.date)} — ${formatNumber(hoveredActivity.activeUsers)} active users · ${formatNumber(hoveredActivity.opens)} opens`
                  : peakActivity
                    ? `Hover a bar for a day's numbers — peak so far: ${formatDay(peakActivity.date)} (${formatNumber(peakActivity.value)} ${peakActivity.label})`
                    : 'Hover a bar to see each day.'}
            </p>
            {activityView === 'today' ? (
              <HourlyLineChart
                points={stats.hourly.points}
                currentHour={currentHourUtc}
                hoveredHour={hoveredHour}
                onHoverHour={setHoveredHour}
              />
            ) : (
              <div className={styles.chart} onMouseLeave={() => setHoveredDay(null)}>
                {stats.activity.byDay.map((point) => {
                  const value =
                    activitySeries === 'users' ? point.activeUsers : point.opens;
                  const isPeak = peakActivity?.date === point.date;
                  return (
                    <div
                      key={point.date}
                      className={styles.barWrap}
                      onMouseEnter={() => setHoveredDay(point.date)}
                      onClick={() => setHoveredDay(point.date)}
                    >
                      <div
                        className={`${styles.bar} ${isPeak ? styles.barPeak : ''} ${hoveredDay === point.date ? styles.barHovered : ''}`}
                        style={{
                          height: `${Math.round((value / activityMax) * CHART_BAR_MAX_PX)}px`,
                        }}
                        title={`${formatDay(point.date)}: ${formatNumber(point.activeUsers)} users, ${formatNumber(point.opens)} opens`}
                      />
                      <span className={styles.barLabel}>{point.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeaderRow}>
              <div>
                <h2 className={styles.panelTitle}>User retention · weekly cohorts</h2>
                <p className={styles.subtitle}>
                  {stats.retention.trackingEnabled
                    ? `Share of each signup week still active in the app N days after joining. Cohorts start Oct 1, 2026.${stats.retention.trackingStart ? ` Days before ${formatDay(stats.retention.trackingStart)} were never recorded (tracking began then) and show —, as do days a cohort has not reached yet.` : ''}`
                    : 'Retention tracking is not available yet — no app-open data in Supabase.'}
                </p>
              </div>
            </div>
            {stats.retention.trackingEnabled ? (
              <>
                <div className={styles.miniGrid}>
                  {[
                    { label: 'Day 1 retention', cell: stats.retention.day1 },
                    { label: 'Day 7 retention', cell: stats.retention.day7 },
                    { label: 'Day 30 retention', cell: stats.retention.day30 },
                  ].map(({ label, cell }) => (
                    <div key={label} className={styles.miniStat}>
                      <p className={styles.statLabel}>{label}</p>
                      <p className={styles.miniStatValue}>
                        {cell.pct === null ? '—' : `${cell.pct}%`}
                      </p>
                      <p className={styles.statHint}>
                        {cell.eligible > 0
                          ? `${formatNumber(cell.retained)} of ${formatNumber(cell.eligible)} users came back`
                          : 'No users old enough yet'}
                      </p>
                    </div>
                  ))}
                </div>

                <h3 className={styles.rankHeading}>
                  Average retention by day since signup
                </h3>
                <p className={styles.chartTip}>
                  {hoveredCurvePoint
                    ? hoveredCurvePoint.pct === null
                      ? `Day ${hoveredCurvePoint.day} — no users old enough yet`
                      : `Day ${hoveredCurvePoint.day} — ${hoveredCurvePoint.pct}% retained (${formatNumber(hoveredCurvePoint.retained)} of ${formatNumber(hoveredCurvePoint.eligible)} users)`
                    : 'Hover a bar for a day.'}
                </p>
                <div
                  className={styles.retentionCurve}
                  onMouseLeave={() => setHoveredCurveDay(null)}
                >
                  {stats.retention.curve.map((point) => (
                    <div
                      key={point.day}
                      className={styles.barWrap}
                      onMouseEnter={() => setHoveredCurveDay(point.day)}
                      onClick={() => setHoveredCurveDay(point.day)}
                    >
                      <div
                        className={`${styles.bar} ${hoveredCurveDay === point.day ? styles.barHovered : ''}`}
                        style={{
                          height: `${point.pct === null ? 0 : point.pct}px`,
                        }}
                        title={
                          point.pct === null
                            ? `Day ${point.day}: no users old enough yet`
                            : `Day ${point.day}: ${point.pct}% retained (${point.retained} of ${point.eligible} users)`
                        }
                      />
                      <span className={styles.barLabel}>
                        {[0, 1, 3, 7, 14, 21, 30].includes(point.day)
                          ? `D${point.day}`
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>

                <h3 className={styles.rankHeading}>
                  Cohorts · % still active N days after signup
                </h3>
                {stats.retention.cohorts.length === 0 ? (
                  <p className={styles.empty}>
                    No signup cohorts yet in the tracked window.
                  </p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Week of</th>
                          <th>Users</th>
                          <th>Day 0</th>
                          <th>Day 1</th>
                          <th>Day 3</th>
                          <th>Day 7</th>
                          <th>Day 14</th>
                          <th>Day 30</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.retention.cohorts.map((cohort) => (
                          <tr key={cohort.cohortStart}>
                            <td>Week of {formatDay(cohort.cohortStart)}</td>
                            <td>{formatNumber(cohort.size)}</td>
                            {cohort.cells.map((cell) => (
                              <td
                                key={cell.day}
                                style={
                                  cell.pct === null
                                    ? undefined
                                    : {
                                        background: `rgba(23, 88, 100, ${(cell.pct / 100) * 0.22})`,
                                        fontWeight: 700,
                                      }
                                }
                                title={
                                  cell.pct === null
                                    ? `Day ${cell.day}: not reached yet`
                                    : `Day ${cell.day}: ${cell.retained} of ${cell.eligible} users (${cell.pct}%)`
                                }
                              >
                                {cell.pct === null ? '—' : `${cell.pct}%`}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeaderRow}>
              <div>
                <h2 className={styles.panelTitle}>Users & activity</h2>
                <p className={styles.subtitle}>
                  Click any user for posts, stamps, messages, notifications, and app opens.
                </p>
              </div>
              <input
                className={styles.searchInput}
                type="search"
                placeholder="Search name, school, program…"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                aria-label="Search users"
              />
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Home school</th>
                    <th>Program</th>
                    <th>Posts</th>
                    <th>Stamps</th>
                    <th>Messages</th>
                    <th>Active days (7d)</th>
                    <th>Last active</th>
                    <th>Push</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((row) => (
                    <tr
                      key={row.id}
                      className={styles.clickRow}
                      onClick={() => setSelectedUserId(row.id)}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() => setSelectedUserId(row.id)}
                        >
                          {row.name}
                        </button>
                      </td>
                      <td>{row.school}</td>
                      <td>{row.program}</td>
                      <td>{row.posts}</td>
                      <td>{row.stampsGiven}</td>
                      <td>{row.messages}</td>
                      <td>{row.activeDays7d}</td>
                      <td>{formatWhen(row.lastActiveAt || row.lastSignInAt)}</td>
                      <td>{row.hasPush ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredUsers.length === 0 ? (
              <p className={styles.empty}>No users match that search.</p>
            ) : null}
          </section>

          <div className={styles.split}>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Recent signups</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Home school</th>
                      <th>Program</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.users.recent.map((row) => (
                      <tr
                        key={row.id}
                        className={styles.clickRow}
                        onClick={() => setSelectedUserId(row.id)}
                      >
                        <td>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => setSelectedUserId(row.id)}
                          >
                            {row.name}
                          </button>
                        </td>
                        <td>{row.school}</td>
                        <td>{row.program}</td>
                        <td>{formatWhen(row.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Top schools & programs</h2>
              <div className={styles.rankColumns}>
                <div>
                  <h3 className={styles.rankHeading}>Home universities</h3>
                  <ul className={styles.rankList}>
                    {stats.users.topSchools.map((row) => (
                      <li key={row.name}>
                        <span>{row.name}</span>
                        <strong>{row.count}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className={styles.rankHeading}>Study abroad programs</h3>
                  <ul className={styles.rankList}>
                    {stats.users.topPrograms.map((row) => (
                      <li key={row.name}>
                        <span>{row.name}</span>
                        <strong>{row.count}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Recent content reports</h2>
            {stats.moderation.recentReports.length === 0 ? (
              <p className={styles.empty}>No reports yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Reported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.moderation.recentReports.map((row) => (
                      <tr key={row.id}>
                        <td>{row.targetType}</td>
                        <td>{row.reason}</td>
                        <td>
                          <span className={styles.statusBadge}>{row.status}</span>
                        </td>
                        <td>{formatWhen(row.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {selectedUserId ? (
        <UserActivityPanel
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      ) : null}
    </div>
  );
}
