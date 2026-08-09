/**
 * Apply a migration SQL file via Supabase Management API.
 *
 * Usage:
 *   node scripts/apply-pending-sql.mjs
 *   node scripts/apply-pending-sql.mjs 025_social_notifications_friends_push.sql
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

try {
  const envPath = resolve(root, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const val = m[2].trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {
  // ignore
}

const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.EXPO_PUBLIC_SUPABASE_URL || '')
    .replace(/^https?:\/\//, '')
    .replace(/\.supabase\.co\/?$/, '')
    .trim();

const token = process.env.SUPABASE_ACCESS_TOKEN || '';
const fileName =
  process.argv[2] || '025_social_notifications_friends_push.sql';

async function main() {
  if (!projectRef) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL / SUPABASE_PROJECT_REF');
    process.exit(1);
  }
  if (!token) {
    console.error(`
Cannot apply SQL automatically: no SUPABASE_ACCESS_TOKEN.

1) Create a token: https://supabase.com/dashboard/account/tokens
2) Put it in .env as SUPABASE_ACCESS_TOKEN=sbp_...
3) Run: node scripts/apply-pending-sql.mjs ${fileName}
`);
    process.exit(2);
  }

  const path = resolve(root, 'supabase/migrations', fileName);
  if (!existsSync(path)) {
    console.error('Missing file:', path);
    process.exit(1);
  }

  let sql = readFileSync(path, 'utf8');
  if (sql.charCodeAt(0) === 0xfeff) sql = sql.slice(1);
  sql = sql.replace(/^\uFEFF/, '');

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    console.error('SQL apply failed:', res.status, text);
    process.exit(1);
  }
  console.log(`Applied ${fileName} successfully.`);
  console.log(text.slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
