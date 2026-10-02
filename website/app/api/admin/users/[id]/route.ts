import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { fetchUserActivityDetail } from '@/lib/admin/userActivity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing user id' }, { status: 400 });
    }
    const detail = await fetchUserActivityDetail(id);
    return NextResponse.json({ ok: true, detail });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : err &&
            typeof err === 'object' &&
            'message' in err &&
            typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : 'Failed to load user activity';
    const status = message === 'User not found' ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
