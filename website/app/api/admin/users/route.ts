import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { fetchUsersActivityList } from '@/lib/admin/userActivity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const users = await fetchUsersActivityList();
    return NextResponse.json({ ok: true, users });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : err &&
            typeof err === 'object' &&
            'message' in err &&
            typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : 'Failed to load users';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
