/**
 * Apply migration 060 via Supabase Management API or direct Postgres.
 *
 * Usage:
 *   node scripts/apply-060.mjs
 *
 * Needs ONE of:
 *   SUPABASE_ACCESS_TOKEN=sbp_...   (https://supabase.com/dashboard/account/tokens)
 *   DATABASE_URL=postgresql://...   (Project Settings → Database → URI)
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const fileName = '060_search_suggest_notifs_albums.sql';

function loadEnv() {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.EXPO_PUBLIC_SUPABASE_URL || '')
    .replace(/^https?:\/\//, '')
    .replace(/\.supabase\.co\/?$/, '')
    .trim();

const sqlPath = resolve(root, 'supabase/migrations', fileName);
let sql = readFileSync(sqlPath, 'utf8');
if (sql.charCodeAt(0) === 0xfeff) sql = sql.slice(1);

async function viaManagement() {
  const token = process.env.SUPABASE_ACCESS_TOKEN || '';
  if (!token || !projectRef) return false;
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
    console.error('Management API failed:', res.status, text.slice(0, 500));
    return false;
  }
  console.log('Applied via Management API');
  return true;
}

async function viaDatabaseUrl() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
  if (!url) return false;
  const { default: pg } = await import('pg').catch(() => ({ default: null }));
  if (!pg) {
    console.error('Install pg: npm i pg');
    return false;
  }
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('Applied via DATABASE_URL');
  return true;
}

const ok = (await viaManagement()) || (await viaDatabaseUrl());
if (!ok) {
  console.error(`
Could not apply ${fileName}.

Do ONE of these:
1) Create a token at https://supabase.com/dashboard/account/tokens
   Put it in .env as SUPABASE_ACCESS_TOKEN=sbp_...
   Then: node scripts/apply-060.mjs

2) Copy Project Settings → Database connection string into .env as DATABASE_URL=...
   Then: npm i pg && node scripts/apply-060.mjs

3) Paste the SQL file into the Supabase SQL Editor and Run:
   supabase/migrations/${fileName}
`);
  process.exit(2);
}
