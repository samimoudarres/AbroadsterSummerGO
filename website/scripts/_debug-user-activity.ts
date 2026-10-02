import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env.local') });
config({ path: resolve(__dirname, '../.env') });

if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
}

async function main() {
  const { getSupabaseAdmin } = await import('../lib/admin/supabaseAdmin');
  const admin = getSupabaseAdmin();
  const r = await admin
    .from('user_activity_events')
    .select('id', { head: true, count: 'exact' })
    .limit(1);
  console.log('exists check', {
    errorCode: r.error?.code,
    errorMsg: r.error?.message,
    count: r.count,
  });

  const { fetchUsersActivityList, fetchUserActivityDetail } = await import(
    '../lib/admin/userActivity'
  );

  try {
    const users = await fetchUsersActivityList();
    console.log('list ok', users.length, users.slice(0, 2));
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.error('list fail', err?.code, err?.message);
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log(
    'profiles',
    profiles?.map((p) => p.full_name),
  );
  const id = profiles?.[0]?.id;
  if (!id) return;
  try {
    const detail = await fetchUserActivityDetail(id);
    console.log('detail ok', detail.profile.name, detail.totals);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.error('detail fail', err?.code, err?.message, e);
  }
}

void main();
