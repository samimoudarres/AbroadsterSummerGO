import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1].trim(), m[2].trim()]),
);

const token = env.SUPABASE_ACCESS_TOKEN;
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ref = url.replace(/^https?:\/\//, '').replace(/\.supabase\.co\/?$/, '');

const sql = `
insert into storage.buckets (id, name, public)
values ('legal', 'legal', true)
on conflict (id) do update set public = true;

drop policy if exists "legal_public_read" on storage.objects;
create policy "legal_public_read" on storage.objects
  for select using (bucket_id = 'legal');

drop policy if exists "legal_public_insert" on storage.objects;
create policy "legal_public_insert" on storage.objects
  for insert with check (bucket_id = 'legal');

drop policy if exists "legal_public_update" on storage.objects;
create policy "legal_public_update" on storage.objects
  for update using (bucket_id = 'legal');
`;

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
console.log('sql', q.status, (await q.text()).slice(0, 300));

for (const f of ['privacy.html', 'terms.html', 'index.html', 'delete-account.html']) {
  const body = readFileSync(resolve(root, 'public/legal', f));
  const up = await fetch(`${url}/storage/v1/object/legal/${f}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'text/html',
      'x-upsert': 'true',
    },
    body,
  });
  console.log('upload', f, up.status, (await up.text()).slice(0, 120));
}

const privacy = `${url}/storage/v1/object/public/legal/privacy.html`;
const terms = `${url}/storage/v1/object/public/legal/terms.html`;
console.log('PRIVACY_URL=' + privacy);
console.log('TERMS_URL=' + terms);

// Persist into .env for local reference
let envText = readFileSync(envPath, 'utf8');
if (!/^EXPO_PUBLIC_LEGAL_BASE_URL=/m.test(envText)) {
  envText += `\nEXPO_PUBLIC_LEGAL_BASE_URL=${url}/storage/v1/object/public/legal\n`;
} else {
  envText = envText.replace(
    /^EXPO_PUBLIC_LEGAL_BASE_URL=.*$/m,
    `EXPO_PUBLIC_LEGAL_BASE_URL=${url}/storage/v1/object/public/legal`,
  );
}
if (!existsSync(envPath)) throw new Error('missing .env');
// write via append style carefully
const lines = envText.split(/\r?\n/);
const out = [];
let saw = false;
for (const line of lines) {
  if (line.startsWith('EXPO_PUBLIC_LEGAL_BASE_URL=')) {
    out.push(
      `EXPO_PUBLIC_LEGAL_BASE_URL=${url}/storage/v1/object/public/legal`,
    );
    saw = true;
  } else out.push(line);
}
if (!saw)
  out.push(
    `EXPO_PUBLIC_LEGAL_BASE_URL=${url}/storage/v1/object/public/legal`,
  );
import('fs').then((fs) =>
  fs.writeFileSync(envPath, out.join('\n'), 'utf8'),
);
