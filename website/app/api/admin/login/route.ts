import { NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  adminAuthConfigured,
  createAdminSessionToken,
} from '@/lib/admin/auth';

export const runtime = 'nodejs';

type Body = { password?: string };

export async function POST(req: Request) {
  const secret = process.env.ADMIN_DASHBOARD_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Admin dashboard is not configured yet. Set ADMIN_DASHBOARD_SECRET.',
      },
      { status: 503 },
    );
  }

  if (!adminAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Supabase admin credentials are missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      },
      { status: 503 },
    );
  }

  const body = (await req.json()) as Body;
  const password = String(body.password || '');

  if (!password || password !== secret) {
    return NextResponse.json(
      { ok: false, error: 'Incorrect password.' },
      { status: 401 },
    );
  }

  const session = createAdminSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: session.maxAge,
  });
  return res;
}
