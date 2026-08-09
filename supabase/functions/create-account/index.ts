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

  const contactKind = String(payload.contactKind ?? payload.contact_kind ?? '')
    .trim()
    .toLowerCase();
  const password = String(payload.password ?? '');
  const metadata =
    payload.metadata && typeof payload.metadata === 'object'
      ? (payload.metadata as Record<string, unknown>)
      : {};

  if (!['phone', 'email', 'student'].includes(contactKind)) {
    return json(400, { error: 'Invalid contact kind.' });
  }
  if (password.length < 6) {
    return json(400, { error: 'Password must be at least 6 characters.' });
  }

  let authEmail = '';
  let phoneDigits: string | null = null;
  let loginEmail: string | null = null;

  if (contactKind === 'phone') {
    phoneDigits = normalizePhone(
      String(payload.phone ?? payload.contactValue ?? ''),
    );
    if (!isValidPhone(phoneDigits)) {
      return json(400, { error: 'Enter a valid phone number.' });
    }
    authEmail = `${phoneDigits}@${PHONE_AUTH_DOMAIN}`;
  } else {
    loginEmail = String(payload.email ?? payload.contactValue ?? '')
      .trim()
      .toLowerCase();
    if (!isValidEmail(loginEmail)) {
      return json(400, { error: 'Enter a valid email address.' });
    }
    if (loginEmail.endsWith(`@${PHONE_AUTH_DOMAIN}`)) {
      return json(400, { error: 'Enter a valid email address.' });
    }
    if (contactKind === 'student' && !loginEmail.endsWith('.edu')) {
      return json(400, {
        error: 'Student email must end in .edu to get verified student status.',
      });
    }
    authEmail = loginEmail;
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userMetadata = {
    ...metadata,
    contact_kind: contactKind,
    phone_number: phoneDigits,
    login_email: loginEmail,
    student_email: contactKind === 'student' ? loginEmail : null,
    is_verified_student: contactKind === 'student',
  };

  // Admin create confirms email without sending mail — avoids free-tier
  // rate_limit_email_sent (2/hour) that blocks supabase.auth.signUp.
  const { data, error } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });

  if (!error && data.user?.id) {
    return json(200, {
      userId: data.user.id,
      authEmail,
      resumed: false,
    });
  }

  const msg = String(error?.message || '').toLowerCase();
  const already =
    msg.includes('already') ||
    msg.includes('registered') ||
    msg.includes('exists');

  if (!already) {
    return json(400, {
      error: error?.message || 'Could not create account.',
    });
  }

  // Auth user already exists (often from a prior attempt that failed after
  // create). Client must sign in with the same password to resume and finish
  // profile persistence.
  return json(200, {
    userId: null,
    authEmail,
    resumed: true,
    exists: true,
  });
});
