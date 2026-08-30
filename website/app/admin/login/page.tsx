'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error || 'Sign in failed.');
        return;
      }

      router.replace('/admin');
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.loginWrap}>
      <form className={styles.loginCard} onSubmit={onSubmit}>
        <p className={styles.eyebrow}>Private</p>
        <h1 className={styles.loginTitle}>Abroadster dashboard</h1>
        <p className={styles.loginHint}>
          Sign in to view live signups, engagement, and moderation stats.
        </p>
        <label className={styles.label} htmlFor="admin-password">
          Dashboard password
        </label>
        <input
          id="admin-password"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your admin password"
          required
        />
        {error ? <p className={styles.error}>{error}</p> : null}
        <button className={styles.primaryBtn} type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
