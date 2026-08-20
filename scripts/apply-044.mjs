import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1].trim(), m[2].trim()]),
);

const token = env.SUPABASE_ACCESS_TOKEN;
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const ref = url.replace(/^https?:\/\//, '').replace(/\.supabase\.co\/?$/, '');
const sql = readFileSync(
  resolve(root, 'supabase/migrations/044_join_via_invite_and_member_respond.sql'),
  'utf8',
);

const q = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  },
);
console.log('status', q.status);
console.log((await q.text()).slice(0, 1200));
