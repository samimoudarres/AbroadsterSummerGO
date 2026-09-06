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
        // fall through to FormSubmit
      } else {
        return { ok: true, via: 'resend' };
      }
    } catch (err) {
      console.error('Resend notify unexpected', err);
    }
  }

  // Server-side only fallback (visitor never sees the inbox address)
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name: opts.name,
        email: opts.email,
        message: opts.message,
        source: opts.source,
        ticket_id: opts.ticketId ?? '',
        _subject: subject,
        _replyto: opts.email,
        _template: 'table',
        _captcha: 'false',
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: string | boolean;
      message?: string;
    };
    if (!res.ok) {
      console.error('FormSubmit notify failed', res.status, json);
      return {
        ok: false,
        via: 'formsubmit',
        detail: json.message || `HTTP ${res.status}`,
      };
    }
    return { ok: true, via: 'formsubmit', detail: String(json.message || '') };
  } catch (err) {
    console.error('FormSubmit notify unexpected', err);
    return {
      ok: false,
      via: 'formsubmit',
      detail: err instanceof Error ? err.message : 'unknown',
    };
  }
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
