'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DashboardStats } from '@/lib/admin/stats';
import styles from '../../app/admin/admin.module.css';

const SUPABASE_PROJECT_URL =
  'https://supabase.com/dashboard/project/ajwnvwvpvasxkwpfdsvo';

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <article className={styles.statCard}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue}>{formatNumber(value)}</p>
      {hint ? <p className={styles.statHint}>{hint}</p> : null}
    </article>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' });
      const data = (await res.json()) as {
        ok?: boolean;
        stats?: DashboardStats;
        error?: string;
      };

      if (res.status === 401) {
        router.replace('/admin/login');
        return;
      }

      if (!res.ok || !data.ok || !data.stats) {
        setError(data.error || 'Could not load dashboard stats.');
        return;
      }

      setStats(data.stats);
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
            <StatCard label="Trips" value={stats.engagement.trips} hint={`${stats.engagement.tripsUpcoming} upcoming/planning`} />
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
            <div className={styles.chart}>
              {stats.users.signupsByDay.map((point) => (
                <div key={point.date} className={styles.barWrap}>
                  <div
                    className={styles.bar}
                    style={{ height: `${(point.count / chartMax) * 100}%` }}
                    title={`${point.date}: ${point.count}`}
                  />
                  <span className={styles.barLabel}>{point.date.slice(5)}</span>
                </div>
              ))}
            </div>
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
                      <tr key={row.id}>
                        <td>{row.name}</td>
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
    </div>
  );
}
