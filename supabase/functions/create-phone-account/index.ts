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

  const phoneDigits = normalizePhone(String(payload.phone ?? ''));
  const password = String(payload.password ?? '');
  const metadata =
    payload.metadata && typeof payload.metadata === 'object'
      ? (payload.metadata as Record<string, unknown>)
      : {};

  if (!isValidPhone(phoneDigits)) {
    return json(400, { error: 'Enter a valid phone number.' });
  }
  if (password.length < 6) {
    return json(400, { error: 'Password must be at least 6 characters.' });
  }

  const authEmail = `${phoneDigits}@${PHONE_AUTH_DOMAIN}`;
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      ...metadata,
      phone_number: phoneDigits,
      contact_kind: 'phone',
    },
  });

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (
      msg.includes('already') ||
      msg.includes('registered') ||
      msg.includes('exists')
    ) {
      return json(409, {
        error: 'An account with this login already exists. Try logging in.',
        authEmail,
      });
    }
    return json(400, { error: error.message || 'Could not create account.' });
  }

  return json(200, {
    userId: data.user?.id ?? null,
    authEmail,
  });
});
