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
    const source = String(body.source || 'website').trim().slice(0, 40) || 'website';
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

    // Notify owner — never expose this address to the browser
    const to = process.env.CONTACT_TO || SITE.supportEmail;
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        const resend = new Resend(apiKey);
        const from =
          process.env.CONTACT_FROM || 'Abroadster <onboarding@resend.dev>';
        const { error: mailError } = await resend.emails.send({
          from,
          to: [to],
          replyTo: email,
          subject: `New Abroadster support ticket from ${name}`,
          text: [
            'A new support ticket was submitted on the website.',
            '',
            `Ticket ID: ${ticketId ?? '(unknown)'}`,
            `From: ${name} <${email}>`,
            `Source: ${source}`,
            '',
            message,
            '',
            'Reply to this email to respond to the sender.',
          ].join('\n'),
        });
        if (mailError) {
          console.error('contact ticket notify failed', mailError);
          // Ticket is already stored — still succeed for the user
        }
      } catch (err) {
        console.error('contact ticket notify unexpected', err);
      }
    } else {
      console.warn(
        'RESEND_API_KEY missing — ticket saved but no owner email sent',
        ticketId,
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Unexpected error. Please try again in a minute.' },
      { status: 500 },
    );
  }
}
