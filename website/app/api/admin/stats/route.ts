import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { fetchDashboardStats } from '@/lib/admin/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await fetchDashboardStats();
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to load dashboard stats';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
