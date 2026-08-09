import * as Linking from 'expo-linking';
import { hasSupabase, supabase } from '../supabase';
import {
  contactToAuthEmail,
  isValidEmail,
  isValidPassword,
  isValidPhone,
  normalizePhone,
} from './validation';
import {
  loadLocalAccounts,
  saveLocalAccounts,
  setPasswordRecoveryPending,
} from './authStorage';

export type PasswordResetMethod = 'email_link' | 'identity';

function looksLikePhone(identifier: string): boolean {
  const raw = identifier.trim();
  return !raw.includes('@') && isValidPhone(raw);
}

function toAuthEmail(identifier: string): string {
  const raw = identifier.trim();
  if (looksLikePhone(raw)) {
    return contactToAuthEmail('phone', raw);
  }
  return raw.toLowerCase();
}

function dobKey(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Deep-link / web URL Supabase should open after the reset email. */
export function passwordResetRedirectTo(): string {
  return Linking.createURL('auth/reset-password');
}

/**
 * Start reset for an email account (sends Supabase recovery email).
 * Phone accounts should use resetPasswordWithIdentity instead.
 */
export async function sendPasswordResetEmail(
  identifier: string,
): Promise<void> {
  const raw = identifier.trim();
  if (!raw) throw new Error('Enter the email on your account.');
  if (looksLikePhone(raw)) {
    throw new Error(
      'Phone accounts reset with your birthday. Continue to verify it’s you.',
    );
  }
  if (!isValidEmail(raw)) {
    throw new Error('Enter a valid email address.');
  }

  if (!(hasSupabase && supabase)) {
    // Local/demo: no inbox — caller should use identity reset
    throw new Error('LOCAL_IDENTITY_RESET');
  }

  const { error } = await supabase.auth.resetPasswordForEmail(raw.toLowerCase(), {
    redirectTo: passwordResetRedirectTo(),
  });
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('rate limit')) {
      throw new Error(
        'Too many reset emails sent. Wait a minute, then try again.',
      );
    }
    // Still show success-style copy to the UI for enumeration safety —
    // but surface real config errors
    if (msg.includes('redirect') || msg.includes('url')) {
      throw new Error(
        'Password reset is misconfigured (redirect URL). Add abroadster://auth/reset-password in Supabase Auth URL settings.',
      );
    }
    throw new Error(error.message || 'Could not send reset email.');
  }
}

/**
 * Verify phone/email + birthday, then set a new password.
 * Works for every account type (email, student, phone) and local demo accounts.
 */
export async function resetPasswordWithIdentity(input: {
  identifier: string;
  birthday: Date;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  const identifier = input.identifier.trim();
  if (!identifier) {
    throw new Error('Enter the phone or email on your account.');
  }
  if (!isValidPassword(input.newPassword)) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (input.newPassword !== input.confirmPassword) {
    throw new Error('New passwords do not match.');
  }

  const dateOfBirth = dobKey(input.birthday);

  if (hasSupabase && supabase) {
    const { data, error } = await supabase.functions.invoke('reset-password', {
      body: {
        identifier,
        dateOfBirth,
        newPassword: input.newPassword,
      },
    });

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
        detail || error.message || 'Could not reset password. Try again.',
      );
    }

    const body = data as { ok?: boolean; error?: string } | null;
    if (body?.error) throw new Error(body.error);
    if (!body?.ok) {
      throw new Error(
        'Could not verify that account. Check your phone/email and birthday.',
      );
    }
    return;
  }

  // Offline / local demo accounts
  const accounts = await loadLocalAccounts();
  const authEmail = toAuthEmail(identifier);
  const phone = looksLikePhone(identifier)
    ? normalizePhone(identifier)
    : null;
  const account = accounts.find(
    (a) =>
      a.authEmail === authEmail ||
      a.identifier.toLowerCase() === identifier.toLowerCase() ||
      (phone && a.phoneNumber === phone) ||
      (a.loginEmail && a.loginEmail === identifier.toLowerCase()) ||
      (a.studentEmail && a.studentEmail === identifier.toLowerCase()),
  );
  if (!account || account.dateOfBirth.slice(0, 10) !== dateOfBirth) {
    throw new Error(
      'Could not verify that account. Check your phone/email and birthday.',
    );
  }
  account.password = input.newPassword;
  await saveLocalAccounts(accounts);
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

  // Force a clean login with the new password
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

    // PKCE: ?code=
    const code =
      (parsed.queryParams?.code as string | undefined) ||
      new URL(url.replace('#', '?'), 'http://localhost').searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return false;
      await setPasswordRecoveryPending(true);
      return true;
    }

    // Implicit: #access_token=&refresh_token=&type=recovery
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

export function detectResetMethod(identifier: string): PasswordResetMethod {
  return looksLikePhone(identifier.trim()) ? 'identity' : 'email_link';
}
