import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '@/lib/admin/supabaseAdmin';
import { SITE } from '@/lib/site';

export const runtime = 'nodejs';

type Body = {
  name?: string;
  email?: string;
  message?: string;
  company?: string;
  source?: string;
};

const rate = new Map<string, { count: number; reset: number }>();

function clientIp(req: Request) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function limited(ip: string) {
  const now = Date.now();
  const entry = rate.get(ip);
  if (!entry || entry.reset < now) {
    rate.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 8;
}

function ownerInbox() {
  return (
    process.env.CONTACT_TO?.trim() ||
    SITE.supportEmail ||
    'samimoudarres@hotmail.com'
  );
}

async function notifyOwner(opts: {
  ticketId: string | null;
  name: string;
  email: string;
  message: string;
  source: string;
}): Promise<{ ok: boolean; via?: string; detail?: string }> {
  const to = ownerInbox();
  const subject = `New Abroadster support ticket from ${opts.name}`;
  const text = [
    'A new support ticket was submitted on the Abroadster website.',
    '',
    `Ticket ID: ${opts.ticketId ?? '(unknown)'}`,
    `From: ${opts.name} <${opts.email}>`,
    `Source: ${opts.source}`,
    '',
    opts.message,
    '',
    'Reply to this email to respond to the sender.',
    'View tickets in Supabase → Table Editor → contact_tickets.',
  ].join('\n');

  // 1) Resend (preferred) — free tier; sign up with CONTACT_TO so onboarding@resend.dev can deliver
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) {
    try {
      const resend = new Resend(apiKey);
      const from =
        process.env.CONTACT_FROM?.trim() ||
        'Abroadster <onboarding@resend.dev>';
      const { error } = await resend.emails.send({
        from,
        to: [to],
        replyTo: opts.email,
        subject,
        text,
      });
      if (error) {
        console.error('Resend notify failed', error);
      } else {
        return { ok: true, via: 'resend' };
      }
    } catch (err) {
      console.error('Resend notify unexpected', err);
    }
  }

  // 2) Web3Forms — works from Vercel; access key aliases CONTACT_TO (no inbox in client)
  const web3Key = process.env.WEB3FORMS_ACCESS_KEY?.trim();
  if (web3Key) {
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          access_key: web3Key,
          subject,
          name: opts.name,
          email: opts.email,
          message: text,
          from_name: 'Abroadster Support',
          replyto: opts.email,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };
      if (res.ok && json.success) {
        return { ok: true, via: 'web3forms' };
      }
      console.error('Web3Forms notify failed', res.status, json);
    } catch (err) {
      console.error('Web3Forms notify unexpected', err);
    }
  }

  console.error(
    'Owner notify skipped: set RESEND_API_KEY or WEB3FORMS_ACCESS_KEY on Vercel',
  );
  return {
    ok: false,
    detail: 'No email provider configured (RESEND_API_KEY or WEB3FORMS_ACCESS_KEY)',
  };
}

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (limited(ip)) {
      return NextResponse.json(
        { ok: false, error: 'Too many messages. Try again in a minute.' },
        { status: 429 },
      );
    }

    const body = (await req.json()) as Body;
    const name = String(body.name || '').trim().slice(0, 120);
    const email = String(body.email || '').trim().slice(0, 200);
    const message = String(body.message || '').trim().slice(0, 4000);
    const company = String(body.company || '').trim();
    const source =
      String(body.source || 'website').trim().slice(0, 40) || 'website';
    const userAgent = (req.headers.get('user-agent') || '').slice(0, 400);

    // Honeypot — pretend success so bots leave
    if (company) {
      return NextResponse.json({ ok: true });
    }

    if (!name || !email || !message) {
      return NextResponse.json(
        { ok: false, error: 'Please fill in name, email, and message.' },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: 'That email doesn’t look right.' },
        { status: 400 },
      );
    }

    let ticketId: string | null = null;
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('contact_tickets')
        .insert({
          name,
          email,
          message,
          source,
          ip: ip === 'unknown' ? null : ip,
          user_agent: userAgent || null,
          status: 'open',
        })
        .select('id')
        .single();

      if (error) throw error;
      ticketId = data?.id ?? null;
    } catch (err) {
      console.error('contact_tickets insert failed', err);
      return NextResponse.json(
        {
          ok: false,
          error:
            'Couldn’t save your message right now. Please try again in a minute.',
        },
        { status: 503 },
      );
    }

    const notify = await notifyOwner({
      ticketId,
      name,
      email,
      message,
      source,
    });
    if (!notify.ok) {
      console.error('Owner notify failed after ticket save', notify);
    }

    // Ticket is stored either way — user always gets success
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Unexpected error. Please try again in a minute.' },
      { status: 500 },
    );
  }
}
