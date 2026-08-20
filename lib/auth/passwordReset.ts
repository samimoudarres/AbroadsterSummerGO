import * as Linking from 'expo-linking';
import { hasSupabase, supabase } from '../supabase';
import { isValidEmail, isValidPassword, isValidPhone } from './validation';
import { setPasswordRecoveryPending } from './authStorage';
import { LEGAL_URLS } from '../legal/urls';

/** Deep-link / web URL Supabase should open after the reset email. */
export function passwordResetRedirectTo(): string {
  return Linking.createURL('auth/reset-password');
}

function looksLikePhone(identifier: string): boolean {
  const raw = identifier.trim();
  return !raw.includes('@') && isValidPhone(raw);
}

/**
 * Request a password reset link for phone or email.
 * Phone numbers receive the link at the recovery email on their profile.
 */
export async function requestPasswordReset(identifier: string): Promise<void> {
  const raw = identifier.trim();
  if (!raw) {
    throw new Error('Enter the phone or email on your account.');
  }
  if (!looksLikePhone(raw) && !isValidEmail(raw)) {
    throw new Error('Enter a valid phone number or email.');
  }

  if (!(hasSupabase && supabase)) {
    throw new Error('Password reset requires an internet connection.');
  }

  const { data, error } = await supabase.functions.invoke(
    'request-password-reset',
    {
      body: {
        identifier: raw,
        redirectTo: passwordResetRedirectTo(),
      },
    },
  );

  if (error) {
    let detail = '';
    try {
      const ctx = (error as { context?: { json?: () => Promise<unknown> } })
        .context;
      const body = ctx?.json ? await ctx.json() : data;
      detail = String((body as { error?: string })?.error || '').trim();
    } catch {
      // ignore
    }
    throw new Error(
      detail || error.message || 'Could not send reset email. Try again.',
    );
  }

  const body = data as { ok?: boolean; error?: string; code?: string } | null;
  if (body?.code === 'NO_RECOVERY_EMAIL') {
    throw new Error(
      `No email on file. Contact ${LEGAL_URLS.supportEmail} for help.`,
    );
  }
  if (body?.error) throw new Error(body.error);
}

/** @deprecated Birthday reset removed — kept for legacy edge function only. */
export async function sendPasswordResetEmail(
  identifier: string,
): Promise<void> {
  await requestPasswordReset(identifier);
}

/**
 * After opening the email recovery link, set a new password on the recovery session.
 */
export async function completePasswordRecovery(
  newPassword: string,
  confirmPassword: string,
): Promise<void> {
  if (!isValidPassword(newPassword)) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (newPassword !== confirmPassword) {
    throw new Error('New passwords do not match.');
  }
  if (!(hasSupabase && supabase)) {
    throw new Error('Sign in is not configured on this device.');
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error(
      'This reset link expired or was already used. Request a new one.',
    );
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(error.message || 'Could not update password.');
  }

  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // ignore
  }
  await setPasswordRecoveryPending(false);
}

/**
 * Parse an inbound auth URL (email deep link). Returns true if a recovery session was established.
 */
export async function consumePasswordRecoveryUrl(url: string): Promise<boolean> {
  if (!(hasSupabase && supabase) || !url) return false;

  try {
    const parsed = Linking.parse(url);
    const path = `${parsed.path || ''}`.replace(/^\//, '');
    const isResetPath =
      path.includes('auth/reset-password') ||
      path.includes('reset-password') ||
      url.includes('auth/reset-password');

    const code =
      (parsed.queryParams?.code as string | undefined) ||
      new URL(url.replace('#', '?'), 'http://localhost').searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return false;
      await setPasswordRecoveryPending(true);
      return true;
    }

    const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const type = params.get('type');
    if (access_token && refresh_token) {
      if (type && type !== 'recovery' && !isResetPath) {
        // Still accept if we landed on the reset path
      }
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) return false;
      await setPasswordRecoveryPending(true);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
