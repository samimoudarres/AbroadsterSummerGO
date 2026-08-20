import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { SITE } from '@/lib/site';

export const runtime = 'nodejs';

type Body = {
  name?: string;
  email?: string;
  message?: string;
  company?: string;
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

function mailtoLink(name: string, email: string, message: string) {
  const subject = encodeURIComponent(`Abroadster contact from ${name}`);
  const body = encodeURIComponent(
    `${message}\n\n-\nFrom: ${name} <${email}>`
  );
  return `mailto:${SITE.supportEmail}?subject=${subject}&body=${body}`;
}

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (limited(ip)) {
      return NextResponse.json(
        { ok: false, error: 'Too many messages. Try again in a minute.' },
        { status: 429 }
      );
    }

    const body = (await req.json()) as Body;
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const message = String(body.message || '').trim();
    const company = String(body.company || '').trim();

    if (company) {
      return NextResponse.json({ ok: true });
    }

    if (!name || !email || !message) {
      return NextResponse.json(
        { ok: false, error: 'Please fill in name, email, and message.' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: 'That email doesn’t look right.' },
        { status: 400 }
      );
    }

    const to = process.env.CONTACT_TO || SITE.supportEmail;
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        error: 'Email service is still warming up.',
        mailto: mailtoLink(name, email, message),
      });
    }

    const resend = new Resend(apiKey);
    const from =
      process.env.CONTACT_FROM || 'Abroadster <onboarding@resend.dev>';

    const { error } = await resend.emails.send({
      from,
      to: [to],
      replyTo: email,
      subject: `Abroadster contact from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Couldn’t send just now.',
          mailto: mailtoLink(name, email, message),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Unexpected error. Please email us directly.' },
      { status: 500 }
    );
  }
}
