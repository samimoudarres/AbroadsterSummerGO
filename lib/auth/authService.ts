import { hasSupabase, supabase } from '../supabase';
import { DEMO_ME_ID, loadDemoState } from '../chat/demoStore';
import { applyOnboardingToDemoMe } from '../chat/demoMeOnboarding';
import { computeExplorerScoreMiles } from '../explorerScore';
import { resolveSchoolVisual } from '../schools/catalog';
import { coordsForHostPersistence } from '../map/resolveProfileCoords';
import { defaultAvatarUrl } from '../images';
import {
  contactToAuthEmail,
  isEduEmail,
  isValidEmail,
  isValidPassword,
  isValidPhone,
  normalizePhone,
  type ContactKind,
} from './validation';
import type { AuthSession, LocalAccount, SignupDraft } from './types';
import {
  getLocalSessionId,
  loadLocalAccounts,
  saveLocalAccounts,
  setLocalSessionId,
  setRememberedLogin,
} from './authStorage';

function onboardingFromDraft(draft: SignupDraft, avatarUri: string | null) {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    avatarUri,
    isVerifiedStudent:
      draft.contactKind === 'student' && isEduEmail(draft.contactValue),
    studentEmail:
      draft.contactKind === 'student'
        ? draft.contactValue.trim().toLowerCase()
        : null,
    phoneNumber:
      draft.contactKind === 'phone'
        ? normalizePhone(draft.contactValue)
        : null,
    dateOfBirth: draft.birthday.toISOString().slice(0, 10),
    homeUniversity: draft.homeUniversity.trim(),
    studyAbroadProgram: draft.studyAbroadProgram.trim(),
    hostCity: draft.hostCity.trim() || null,
    hostCountry: draft.hostCountry.trim() || null,
  };
}

function explorerMilesForDraft(draft: SignupDraft): number {
  return computeExplorerScoreMiles({
    homeUniversity: draft.homeUniversity,
    studyAbroadProgram: draft.studyAbroadProgram,
    hostCity: draft.hostCity,
    hostCountry: draft.hostCountry,
    trips: [],
  });
}

function newLocalId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function authErrorMessage(err: unknown, fallback: string): string {
  const msg = String((err as any)?.message ?? err ?? '').trim();
  if (!msg) return fallback;
  const lower = msg.toLowerCase();
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'An account with this login already exists. Try logging in.';
  }
  if (lower.includes('rate limit') || lower.includes('email rate limit')) {
    return 'Too many signup attempts right now. Please wait a minute and try again.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Incorrect login or password.';
  }
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return 'Incorrect login or password.';
  }
  return msg;
}

type CreateAccountResult = {
  userId: string | null;
  authEmail: string;
  resumed?: boolean;
  exists?: boolean;
};

/**
 * All contact kinds create auth users via Edge Function + service role.
 * Client `auth.signUp` sends confirmation email and hits free-tier
 * `rate_limit_email_sent` (2/hour). Admin create confirms without mailing.
 */
async function createAuthUserViaEdge(
  draft: SignupDraft,
  flags: ReturnType<typeof draftToFlags>,
): Promise<CreateAccountResult> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('create-account', {
    body: {
      contactKind: flags.kind,
      phone: flags.phoneNumber,
      email: flags.loginEmail,
      contactValue: draft.contactValue.trim(),
      password: draft.password,
      metadata: {
        first_name: draft.firstName.trim(),
        last_name: draft.lastName.trim(),
        full_name: `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim(),
        phone_number: flags.phoneNumber,
        date_of_birth: draft.birthday.toISOString().slice(0, 10),
        student_email: flags.studentEmail,
        is_verified_student: flags.isVerifiedStudent,
        home_university: draft.homeUniversity.trim(),
        study_abroad_program: draft.studyAbroadProgram.trim(),
        contact_kind: flags.kind,
        login_email: flags.loginEmail,
      },
    },
  });

  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    let detail = '';
    try {
      const body = ctx?.json ? await ctx.json() : data;
      detail = String((body as any)?.error || '').trim();
    } catch {
      // ignore parse failures
    }
    throw new Error(detail || error.message || 'Could not create your account.');
  }

  const body = data as (CreateAccountResult & { error?: string }) | null;
  if (body?.error) throw new Error(body.error);
  if (!body?.authEmail) {
    throw new Error('Could not create your account. Please try again.');
  }
  return {
    userId: body.userId ?? null,
    authEmail: body.authEmail,
    resumed: Boolean(body.resumed || body.exists),
    exists: Boolean(body.exists),
  };
}

function draftToFlags(draft: SignupDraft) {
  const kind = draft.contactKind;
  const raw = draft.contactValue.trim();
  const isVerifiedStudent = kind === 'student' && isEduEmail(raw);
  return {
    kind,
    raw,
    authEmail: contactToAuthEmail(kind, raw),
    isVerifiedStudent,
    studentEmail: kind === 'student' ? raw.toLowerCase() : null,
    phoneNumber: kind === 'phone' ? normalizePhone(raw) : null,
    loginEmail:
      kind === 'email' || kind === 'student' ? raw.toLowerCase() : null,
  };
}

async function sessionFromLocal(account: LocalAccount): Promise<AuthSession> {
  await setLocalSessionId(account.id);
  await applyOnboardingToDemoMe({
    firstName: account.firstName,
    lastName: account.lastName,
    avatarUri: account.avatarUri,
    isVerifiedStudent: account.isVerifiedStudent,
    studentEmail: account.studentEmail,
    phoneNumber: account.phoneNumber,
    dateOfBirth: account.dateOfBirth,
    homeUniversity: account.homeUniversity || '',
    studyAbroadProgram: account.studyAbroadProgram || '',
    hostCity: account.hostCity || null,
    hostCountry: account.hostCountry || null,
  });
  return {
    userId: DEMO_ME_ID,
    identifier: account.identifier,
    authEmail: account.authEmail,
    firstName: account.firstName,
    lastName: account.lastName,
    isVerifiedStudent: account.isVerifiedStudent,
    source: 'local',
  };
}

async function upsertLiveProfile(
  userId: string,
  draft: SignupDraft,
  flags: ReturnType<typeof draftToFlags>,
  avatarUrl: string | null,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const fullName = `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim();
  const dob = draft.birthday.toISOString().slice(0, 10);
  const home = draft.homeUniversity.trim();
  const abroad = draft.studyAbroadProgram.trim();
  const homeVisual = resolveSchoolVisual({ name: home });
  const abroadVisual = resolveSchoolVisual({ name: abroad });
  const resolvedAvatar =
    avatarUrl || defaultAvatarUrl(fullName || draft.firstName.trim());
  const hostCity = draft.hostCity.trim() || null;
  const hostCountry = draft.hostCountry.trim() || null;
  const hostCoords = coordsForHostPersistence({
    hostCity,
    studyAbroadProgram: abroad,
  });

  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      first_name: draft.firstName.trim(),
      last_name: draft.lastName.trim(),
      full_name: fullName,
      phone_number: flags.phoneNumber,
      date_of_birth: dob,
      student_email: flags.studentEmail,
      is_verified_student: flags.isVerifiedStudent,
      login_email: flags.loginEmail,
      avatar_url: resolvedAvatar,
      home_university: home,
      study_abroad_program: abroad,
      host_city: hostCity,
      host_country: hostCountry,
      host_latitude: hostCoords?.latitude ?? null,
      host_longitude: hostCoords?.longitude ?? null,
      home_accent: homeVisual.accent || '#003087',
      abroad_accent: abroadVisual.accent || '#9B51E0',
      explorer_score_miles: explorerMilesForDraft(draft),
    },
    { onConflict: 'id' },
  );
  if (error) {
    throw new Error(
      error.message || 'Could not save your profile. Please try again.',
    );
  }

  const clientMiles = explorerMilesForDraft(draft);
  // Enrichment only — never fail account creation if optional RPCs/tables lag.
  const { error: scoreErr } = await supabase.rpc('recompute_explorer_score', {
    p_user_id: userId,
  });
  if (scoreErr) {
    console.warn('recompute_explorer_score', scoreErr.message);
  }
  if (clientMiles > 0) {
    const { error: milesErr } = await supabase
      .from('profiles')
      .update({ explorer_score_miles: clientMiles })
      .eq('id', userId);
    if (milesErr) {
      console.warn('explorer_score_miles update', milesErr.message);
    }
  }
  const { error: passportErr } = await supabase.rpc('passport_ensure_host_city', {
    p_user_id: userId,
  });
  if (passportErr) {
    console.warn('passport_ensure_host_city', passportErr.message);
  }
  const { error: syncErr } = await supabase.rpc('sync_profile_communities', {
    p_user_id: userId,
  });
  if (syncErr) {
    console.warn('sync_profile_communities', syncErr.message);
  }
}

async function uploadAvatarIfNeeded(
  userId: string,
  localUri: string | null,
): Promise<string | null> {
  if (!localUri || !supabase) return null;
  const ext = localUri.split('.').pop()?.split('?')[0] || 'jpg';
  const path = `${userId}/avatar.${ext}`;

  const toDataUrl = async (): Promise<string> => {
    const res = await fetch(localUri);
    const blob = await res.blob();
    if (typeof FileReader === 'undefined') {
      throw new Error('Could not process your photo.');
    }
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(blob);
    });
  };

  try {
    const res = await fetch(localUri);
    const blob = await res.blob();
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('bucket') && msg.includes('not found')) {
        return toDataUrl();
      }
      console.warn('avatar upload', error.message);
      return null;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  } catch (e: any) {
    const msg = String(e?.message || e || '').toLowerCase();
    if (msg.includes('bucket') && msg.includes('not found')) {
      try {
        return await toDataUrl();
      } catch {
        return null;
      }
    }
    console.warn('avatar upload', e?.message || e);
    return null;
  }
}

export function validateContact(
  kind: ContactKind,
  value: string,
): string | null {
  const v = value.trim();
  if (!v) return 'Please enter your contact info.';
  if (kind === 'phone' && !isValidPhone(v)) {
    return 'Enter a valid phone number.';
  }
  if (kind === 'email' && !isValidEmail(v)) {
    return 'Enter a valid email address.';
  }
  if (kind === 'student') {
    if (!isValidEmail(v)) return 'Enter a valid school email.';
    if (!isEduEmail(v)) {
      return 'Student email must end in .edu to get verified student status.';
    }
  }
  return null;
}

export async function signUpWithDraft(draft: SignupDraft): Promise<AuthSession> {
  const contactErr = validateContact(draft.contactKind, draft.contactValue);
  if (contactErr) throw new Error(contactErr);
  if (!isValidPassword(draft.password)) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (!draft.agreedToTerms) {
    throw new Error('Please agree to the Terms to continue.');
  }
  if (!draft.homeUniversity.trim() || !draft.studyAbroadProgram.trim()) {
    throw new Error('Select your home school and study abroad program.');
  }

  const flags = draftToFlags(draft);
  const identifier = draft.contactValue.trim();

  if (draft.rememberLogin) {
    await setRememberedLogin({
      identifier,
    });
  } else {
    await setRememberedLogin(null);
  }

  // Production path: Supabase only — never create a shadow local account
  if (hasSupabase && supabase) {
    try {
      const created = await createAuthUserViaEdge(draft, flags);
      const sessionEmail = created.authEmail;

      const signedIn = await supabase.auth.signInWithPassword({
        email: sessionEmail,
        password: draft.password,
      });
      if (signedIn.error) {
        if (created.exists || created.resumed) {
          throw new Error(
            'An account with this login already exists. Try logging in.',
          );
        }
        throw signedIn.error;
      }
      const userId = signedIn.data.user?.id || created.userId;
      if (!userId || !signedIn.data.session) {
        throw new Error(
          'Account created. Please log in with your email or phone and password.',
        );
      }

      const avatarUrl = await uploadAvatarIfNeeded(userId, draft.avatarUri);
      await upsertLiveProfile(userId, draft, flags, avatarUrl);
      await applyOnboardingToDemoMe(
        onboardingFromDraft(draft, avatarUrl || draft.avatarUri),
      );
      await setLocalSessionId(null);
      return {
        userId,
        identifier,
        authEmail: sessionEmail,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        isVerifiedStudent: flags.isVerifiedStudent,
        source: 'supabase',
      };
    } catch (e) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      throw new Error(authErrorMessage(e, 'Could not create your account.'));
    }
  }

  // Offline / no Supabase keys — local demo accounts only
  const accounts = await loadLocalAccounts();
  if (accounts.some((a) => a.authEmail === flags.authEmail)) {
    throw new Error('An account with this login already exists. Try logging in.');
  }

  const account: LocalAccount = {
    id: newLocalId(),
    authEmail: flags.authEmail,
    identifier,
    contactKind: draft.contactKind,
    password: draft.password,
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    dateOfBirth: draft.birthday.toISOString().slice(0, 10),
    isVerifiedStudent: flags.isVerifiedStudent,
    studentEmail: flags.studentEmail,
    phoneNumber: flags.phoneNumber,
    loginEmail: flags.loginEmail,
    avatarUri: draft.avatarUri,
    homeUniversity: draft.homeUniversity.trim(),
    studyAbroadProgram: draft.studyAbroadProgram.trim(),
    hostCity: draft.hostCity.trim(),
    hostCountry: draft.hostCountry.trim(),
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  await saveLocalAccounts(accounts);
  return sessionFromLocal(account);
}

export async function signInWithIdentifier(
  identifier: string,
  password: string,
  remember: boolean,
): Promise<AuthSession> {
  const raw = identifier.trim();
  if (!raw || !password) {
    throw new Error('Enter your email or phone and password.');
  }

  const looksPhone = isValidPhone(raw) && !raw.includes('@');
  const authEmail = looksPhone
    ? contactToAuthEmail('phone', raw)
    : raw.toLowerCase();

  if (remember) {
    await setRememberedLogin({ identifier: raw });
  } else {
    await setRememberedLogin(null);
  }

  // Production path: Supabase only
  if (hasSupabase && supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });
      if (error) throw error;
      if (!data.user || !data.session) {
        throw new Error('Incorrect login or password.');
      }
      const meta = data.user.user_metadata ?? {};
      await setLocalSessionId(null);
      return {
        userId: data.user.id,
        identifier: raw,
        authEmail,
        firstName: (meta.first_name as string) || 'Abroadster',
        lastName: (meta.last_name as string) || '',
        isVerifiedStudent: Boolean(meta.is_verified_student),
        source: 'supabase',
      };
    } catch (e) {
      throw new Error(authErrorMessage(e, 'Incorrect login or password.'));
    }
  }

  // Offline / no Supabase keys
  const accounts = await loadLocalAccounts();
  const account = accounts.find(
    (a) =>
      a.authEmail === authEmail ||
      a.identifier.toLowerCase() === raw.toLowerCase() ||
      (a.phoneNumber && a.phoneNumber === normalizePhone(raw)),
  );
  if (!account || account.password !== password) {
    throw new Error('Incorrect login or password.');
  }
  return sessionFromLocal(account);
}

export async function signOut(): Promise<void> {
  // Always clear local session id first so restore can't bounce back in
  await setLocalSessionId(null);
  if (hasSupabase && supabase) {
    try {
      // Prefer local scope so logout never hangs on network
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore — still force client session clear below
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        await supabase.auth.signOut({ scope: 'global' });
      }
    } catch {
      // ignore
    }
  }
}

/** Permanently delete the signed-in account (App Store account-deletion requirement). */
export async function deleteMyAccount(): Promise<void> {
  if (hasSupabase && supabase) {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) {
      throw new Error(
        error.message ||
          'Could not delete your account. Make sure migration 024 is applied, then try again.',
      );
    }
    await setRememberedLogin(null);
    await setLocalSessionId(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // session may already be invalid after delete
    }
    return;
  }

  const localId = await getLocalSessionId();
  if (!localId) throw new Error('No account to delete.');
  const accounts = await loadLocalAccounts();
  await saveLocalAccounts(accounts.filter((a) => a.id !== localId));
  await setLocalSessionId(null);
  await setRememberedLogin(null);
}

export async function restoreSession(): Promise<AuthSession | null> {
  // Session-first: do not block on full demo hydrate
  if (hasSupabase && supabase) {
    const { getPasswordRecoveryPending } = await import('./authStorage');
    if (await getPasswordRecoveryPending()) {
      // Recovery session may exist in supabase client — keep user on reset UI
      return null;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      const meta = session.user.user_metadata ?? {};
      return {
        userId: session.user.id,
        identifier: session.user.email || '',
        authEmail: session.user.email || '',
        firstName: (meta.first_name as string) || 'Abroadster',
        lastName: (meta.last_name as string) || '',
        isVerifiedStudent: Boolean(meta.is_verified_student),
        source: 'supabase',
      };
    }
    // Supabase configured but no session — ignore leftover local sessions
    await setLocalSessionId(null);
    return null;
  }

  await loadDemoState();
  const localId = await getLocalSessionId();
  if (!localId) return null;
  const accounts = await loadLocalAccounts();
  const account = accounts.find((a) => a.id === localId);
  if (!account) {
    await setLocalSessionId(null);
    return null;
  }
  return sessionFromLocal(account);
}
