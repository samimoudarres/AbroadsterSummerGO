import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { fetchHourlyActivityStats } from '@/lib/admin/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const date = new URL(request.url).searchParams.get('date') ?? undefined;
    const hourly = await fetchHourlyActivityStats(date);
    return NextResponse.json({ ok: true, hourly });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to load hourly stats';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
