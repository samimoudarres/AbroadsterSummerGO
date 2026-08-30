import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'abroadster_admin_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function adminSecret() {
  const secret = process.env.ADMIN_DASHBOARD_SECRET?.trim();
  if (!secret) return null;
  return secret;
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createAdminSessionToken(secret: string) {
  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const payload = `admin:${exp}`;
  return {
    token: `${payload}.${signPayload(payload, secret)}`,
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function verifyAdminSessionToken(token: string, secret: string) {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signPayload(payload, secret);

  if (sig.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

  const [, expStr] = payload.split(':');
  const exp = Number(expStr);
  return Number.isFinite(exp) && exp > Date.now();
}

export async function isAdminAuthenticated() {
  const secret = adminSecret();
  if (!secret) return false;

  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return false;

  return verifyAdminSessionToken(token, secret);
}

export function adminAuthConfigured() {
  return Boolean(adminSecret() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
