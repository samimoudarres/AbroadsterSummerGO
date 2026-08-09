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

function sameDob(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  return String(a).slice(0, 10) === String(b).slice(0, 10);
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
  const dateOfBirth = String(payload.dateOfBirth ?? payload.date_of_birth ?? '')
    .trim()
    .slice(0, 10);
  const newPassword = String(payload.newPassword ?? payload.new_password ?? '');

  if (!identifier) {
    return json(400, { error: 'Enter the phone or email on your account.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return json(400, { error: 'Enter your date of birth.' });
  }
  if (newPassword.length < 6) {
    return json(400, { error: 'Password must be at least 6 characters.' });
  }

  const looksPhone =
    !identifier.includes('@') && isValidPhone(normalizePhone(identifier));
  const phoneDigits = looksPhone ? normalizePhone(identifier) : null;
  const authEmail = phoneDigits
    ? `${phoneDigits}@${PHONE_AUTH_DOMAIN}`
    : identifier.toLowerCase();

  if (!phoneDigits && !isValidEmail(authEmail)) {
    return json(400, { error: 'Enter a valid phone number or email.' });
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const fail = () =>
    json(400, {
      error:
        'Could not verify that account. Check your phone/email and birthday.',
    });

  let userId: string | null = null;
  let profileDob: string | null = null;

  // Preferred: SQL lookup (auth.users + profiles) — requires migration 036
  try {
    const { data: rows, error: lookupErr } = await admin.rpc(
      'lookup_user_for_password_reset',
      {
        p_email: phoneDigits ? authEmail : authEmail,
        p_phone: phoneDigits,
      },
    );
    if (!lookupErr && Array.isArray(rows) && rows[0]?.user_id) {
      userId = rows[0].user_id as string;
      profileDob = (rows[0].date_of_birth as string) || null;
    }
  } catch {
    // migration not applied — fall through
  }

  // Fallback: profiles table only
  if (!userId && phoneDigits) {
    const { data: byPhone } = await admin
      .from('profiles')
      .select('id, date_of_birth')
      .eq('phone_number', phoneDigits)
      .maybeSingle();
    if (byPhone?.id) {
      userId = byPhone.id as string;
      profileDob = (byPhone.date_of_birth as string) || null;
    }
  }
  if (!userId && !phoneDigits) {
    const { data: byEmail } = await admin
      .from('profiles')
      .select('id, date_of_birth')
      .or(`login_email.eq."${authEmail}",student_email.eq."${authEmail}"`)
      .maybeSingle();
    if (byEmail?.id) {
      userId = byEmail.id as string;
      profileDob = (byEmail.date_of_birth as string) || null;
    }
  }

  if (!userId) return fail();

  if (!profileDob) {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    profileDob =
      String(authUser.user?.user_metadata?.date_of_birth ?? '').slice(0, 10) ||
      null;
  }

  if (!sameDob(profileDob, dateOfBirth)) return fail();

  const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (updateErr) {
    return json(500, {
      error: updateErr.message || 'Could not update password. Try again.',
    });
  }

  return json(200, { ok: true });
});
