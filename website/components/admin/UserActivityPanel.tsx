'use client';

import { useEffect, useMemo, useState } from 'react';
import type { UserActivityDetail } from '@/lib/admin/userActivity';
import styles from '../../app/admin/admin.module.css';

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function MiniStat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <article className={styles.miniStat}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.miniStatValue}>{typeof value === 'number' ? formatNumber(value) : value}</p>
      {hint ? <p className={styles.statHint}>{hint}</p> : null}
    </article>
  );
}

function SparkBars({
  series,
  color = 'teal',
}: {
  series: { date: string; count: number }[];
  color?: 'teal' | 'amber' | 'ink';
}) {
  const max = Math.max(1, ...series.map((s) => s.count));
  return (
    <div className={styles.spark}>
      {series.map((point) => (
        <div
          key={point.date}
          className={`${styles.sparkBar} ${styles[`spark_${color}`]}`}
          style={{ height: `${(point.count / max) * 100}%` }}
          title={`${point.date}: ${point.count}`}
        />
      ))}
    </div>
  );
}

export function UserActivityPanel({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<UserActivityDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/admin/users/${userId}`, { cache: 'no-store' });
        const data = (await res.json()) as {
          ok?: boolean;
          detail?: UserActivityDetail;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok || !data.detail) {
          setError(data.error || 'Could not load user activity.');
          setDetail(null);
          return;
        }
        setDetail(data.detail);
      } catch {
        if (!cancelled) setError('Network error while loading user activity.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const readRate = useMemo(() => {
    if (!detail) return '—';
    const total = detail.totals.notificationsReceived;
    if (!total) return '—';
    return `${Math.round((detail.totals.notificationsRead / total) * 100)}%`;
  }, [detail]);

  return (
    <div className={styles.drawerBackdrop} onClick={onClose} role="presentation">
      <aside
        className={styles.drawer}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="User activity"
      >
        <div className={styles.drawerHeader}>
          <div>
            <p className={styles.eyebrow}>User activity</p>
            <h2 className={styles.drawerTitle}>
              {detail?.profile.name || (loading ? 'Loading…' : 'User')}
            </h2>
            {detail ? (
              <p className={styles.subtitle}>
                {detail.profile.school} · {detail.profile.program}
              </p>
            ) : null}
          </div>
          <button className={styles.secondaryBtn} type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? <p className={styles.bannerError}>{error}</p> : null}
        {loading && !detail ? <p className={styles.loading}>Loading activity…</p> : null}

        {detail ? (
          <div className={styles.drawerBody}>
            {!detail.activityTrackingEnabled ? (
              <p className={styles.note}>
                App-open tracking table is not live yet. Content metrics below are
                still accurate from posts, stamps, messages, and notifications.
              </p>
            ) : null}

            <section className={styles.miniGrid}>
              <MiniStat label="Joined" value={formatWhen(detail.profile.createdAt)} />
              <MiniStat
                label="Last sign-in"
                value={formatWhen(detail.auth.lastSignInAt)}
              />
              <MiniStat
                label="Last active"
                value={formatWhen(
                  detail.profile.lastActiveAt || detail.auth.lastSignInAt,
                )}
              />
              <MiniStat
                label="Explorer score"
                value={detail.profile.explorerScoreMiles}
              />
            </section>

            <h3 className={styles.sectionTitle}>Engagement windows</h3>
            <section className={styles.miniGrid}>
              <MiniStat
                label="App opens today"
                value={detail.windows.appOpensToday}
              />
              <MiniStat
                label="App opens (7d)"
                value={detail.windows.appOpens7d}
                hint={`avg ${detail.windows.avgAppOpensPerDay7d}/day`}
              />
              <MiniStat label="App opens (30d)" value={detail.windows.appOpens30d} />
              <MiniStat
                label="Posts (7d / 30d)"
                value={`${detail.windows.posts7d} / ${detail.windows.posts30d}`}
              />
              <MiniStat
                label="Stamps given (7d / 30d)"
                value={`${detail.windows.stampsGiven7d} / ${detail.windows.stampsGiven30d}`}
              />
              <MiniStat
                label="Messages (7d / 30d)"
                value={`${detail.windows.messages7d} / ${detail.windows.messages30d}`}
              />
            </section>

            <h3 className={styles.sectionTitle}>Lifetime totals</h3>
            <section className={styles.miniGrid}>
              <MiniStat label="Posts" value={detail.totals.posts} />
              <MiniStat label="Stamps given" value={detail.totals.stampsGiven} />
              <MiniStat label="Stamps received" value={detail.totals.stampsReceived} />
              <MiniStat label="Messages sent" value={detail.totals.messagesSent} />
              <MiniStat label="Friends" value={detail.totals.friends} />
              <MiniStat
                label="Trips"
                value={detail.totals.tripsMember}
                hint={`${detail.totals.tripsOwned} owned`}
              />
              <MiniStat label="Album photos" value={detail.totals.albumPhotos} />
              <MiniStat
                label="Push tokens"
                value={detail.totals.pushTokens}
                hint={detail.totals.pushTokens > 0 ? 'Push enabled' : 'No push'}
              />
              <MiniStat label="Home feed opens" value={detail.totals.homeFeedViews} />
              <MiniStat
                label="Notifications screen opens"
                value={detail.totals.notificationsOpens}
              />
              <MiniStat
                label="Notifications received"
                value={detail.totals.notificationsReceived}
              />
              <MiniStat
                label="Unread / read rate"
                value={`${detail.totals.notificationsUnread} / ${readRate}`}
              />
            </section>

            <h3 className={styles.sectionTitle}>Last 30 days</h3>
            <div className={styles.sparkBlock}>
              <p className={styles.rankHeading}>App opens</p>
              <SparkBars series={detail.series.appOpensByDay} color="teal" />
            </div>
            <div className={styles.sparkBlock}>
              <p className={styles.rankHeading}>Posts</p>
              <SparkBars series={detail.series.postsByDay} color="amber" />
            </div>
            <div className={styles.sparkBlock}>
              <p className={styles.rankHeading}>Stamps given</p>
              <SparkBars series={detail.series.stampsByDay} color="ink" />
            </div>

            <div className={styles.splitTight}>
              <section>
                <h3 className={styles.sectionTitle}>Notifications by kind</h3>
                {detail.notificationsByKind.length === 0 ? (
                  <p className={styles.empty}>No notifications yet.</p>
                ) : (
                  <ul className={styles.rankList}>
                    {detail.notificationsByKind.map((row) => (
                      <li key={row.kind}>
                        <span>{row.kind}</span>
                        <strong>{row.count}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className={styles.sectionTitle}>Recent posts</h3>
                {detail.recent.posts.length === 0 ? (
                  <p className={styles.empty}>No posts yet.</p>
                ) : (
                  <ul className={styles.recentList}>
                    {detail.recent.posts.map((p) => (
                      <li key={p.id}>
                        <span>{p.caption || '(no caption)'}</span>
                        <em>{formatWhen(p.createdAt)}</em>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <h3 className={styles.sectionTitle}>Recent app opens</h3>
            {detail.recent.appOpens.length === 0 ? (
              <p className={styles.empty}>
                No app opens recorded yet. Opens start logging after the activity
                migration is applied and users update/open the app.
              </p>
            ) : (
              <ul className={styles.recentList}>
                {detail.recent.appOpens.map((o, i) => (
                  <li key={`${o.createdAt}-${i}`}>
                    <span>{o.source}</span>
                    <em>{formatWhen(o.createdAt)}</em>
                  </li>
                ))}
              </ul>
            )}

            {(detail.auth.email || detail.auth.phone) && (
              <p className={styles.contactLine}>
                {detail.auth.email ? `Email: ${detail.auth.email}` : null}
                {detail.auth.email && detail.auth.phone ? ' · ' : null}
                {detail.auth.phone ? `Phone: ${detail.auth.phone}` : null}
              </p>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
