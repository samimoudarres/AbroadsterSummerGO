import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('../.env') });
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
}

const { fetchUserActivityDetail, fetchUsersActivityList } = await import(
  '../lib/admin/userActivity.ts'
);

try {
  console.log('env url', (process.env.SUPABASE_URL || '').slice(0, 40));
  console.log(
    'env key',
    Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    ),
  );
  const users = await fetchUsersActivityList();
  console.log('list ok', users.length, users.slice(0, 3).map((u) => u.name));
  const id =
    users.find((u) => /Mei|abdullah|Abroadster|Keira/i.test(u.name))?.id ||
    users[0]?.id;
  console.log('testing', id);
  const detail = await fetchUserActivityDetail(id!);
  console.log(
    'detail ok',
    JSON.stringify(
      {
        name: detail.profile.name,
        totals: detail.totals,
        windows: detail.windows,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error('ERR', e);
}
