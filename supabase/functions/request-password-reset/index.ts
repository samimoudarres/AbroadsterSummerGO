import { createClient } from 'npm:@supabase/supabase-js@2';

const PHONE_AUTH_DOMAIN = 'phone.abroadster.app';
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

function isValidPhone(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 15;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRecoveryEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  const email = value.trim().toLowerCase();
  return (
    isValidEmail(email) &&
    !email.endsWith(`@${PHONE_AUTH_DOMAIN}`) &&
    !email.endsWith('@phone.abroadster.app')
  );
}

async function lookupRecoveryEmail(
  admin: ReturnType<typeof createClient>,
  opts: { email?: string | null; phone?: string | null },
): Promise<string | null> {
  try {
    const { data: rows, error } = await admin.rpc(
      'lookup_recovery_email_for_password_reset',
      {
        p_email: opts.email ?? null,
        p_phone: opts.phone ?? null,
      },
    );
    if (!error && Array.isArray(rows) && rows[0]?.recovery_email) {
      const email = String(rows[0].recovery_email).trim().toLowerCase();
      if (isRecoveryEmail(email)) return email;
    }
  } catch {
    // migration not applied — fall through
  }

  if (opts.phone) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, login_email, student_email')
      .eq('phone_number', opts.phone)
      .maybeSingle();
    if (!profile?.id) return null;

    const login = String(profile.login_email || '').trim().toLowerCase();
    const student = String(profile.student_email || '').trim().toLowerCase();
    if (isRecoveryEmail(login)) return login;
    if (isRecoveryEmail(student)) return student;

    const { data: authUser } = await admin.auth.admin.getUserById(
      profile.id as string,
    );
    const authEmail = authUser.user?.email?.trim().toLowerCase() ?? '';
    if (isRecoveryEmail(authEmail)) return authEmail;
    return null;
  }

  if (opts.email && isRecoveryEmail(opts.email)) {
    return opts.email.trim().toLowerCase();
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) {
    return json(500, { error: 'Server is not configured.' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const identifier = String(payload.identifier ?? '').trim();
  const redirectTo = String(
    payload.redirectTo ?? payload.redirect_to ?? 'abroadster://auth/reset-password',
  ).trim();

  if (!identifier) {
    return json(400, { error: 'Enter the phone or email on your account.' });
  }

  const looksPhone =
    !identifier.includes('@') && isValidPhone(normalizePhone(identifier));
  const phoneDigits = looksPhone ? normalizePhone(identifier) : null;
  const emailInput = looksPhone ? null : identifier.toLowerCase();

  if (!looksPhone && !isValidEmail(emailInput || '')) {
    return json(400, { error: 'Enter a valid phone number or email.' });
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const recoveryEmail = await lookupRecoveryEmail(admin, {
    email: emailInput,
    phone: phoneDigits,
  });

  if (looksPhone && phoneDigits) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('phone_number', phoneDigits)
      .maybeSingle();

    if (profile?.id && !recoveryEmail) {
      return json(400, {
        error:
          'No email on file for this phone number. Contact samimoudarres@hotmail.com for help.',
        code: 'NO_RECOVERY_EMAIL',
      });
    }
  }

  if (!recoveryEmail) {
    // Enumeration-safe: unknown email still looks successful to the client.
    return json(200, { ok: true });
  }

  const { error: sendErr } = await admin.auth.resetPasswordForEmail(
    recoveryEmail,
    { redirectTo },
  );
  if (sendErr) {
    const msg = String(sendErr.message || '').toLowerCase();
    if (msg.includes('rate limit')) {
      return json(429, {
        error: 'Too many reset emails sent. Wait a minute, then try again.',
      });
    }
    if (msg.includes('redirect') || msg.includes('url')) {
      return json(500, {
        error:
          'Password reset is misconfigured (redirect URL). Add abroadster://auth/reset-password in Supabase Auth URL settings.',
      });
    }
    console.error('resetPasswordForEmail failed', sendErr);
  }

  return json(200, { ok: true });
});
