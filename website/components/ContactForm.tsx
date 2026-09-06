'use client';

import { FormEvent, useState } from 'react';

type Status = 'idle' | 'loading' | 'ok' | 'err';

export function ContactForm({ source = 'website' }: { source?: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') || ''),
          email: String(data.get('email') || ''),
          message: String(data.get('message') || ''),
          company: String(data.get('company') || ''),
          source,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Something went wrong. Please try again.');
      }

      setStatus('ok');
      setMessage('Got it. We’ll get back to you soon.');
      form.reset();
    } catch (err) {
      setStatus('err');
      setMessage(
        err instanceof Error
          ? err.message
          : 'Couldn’t send right now. Please try again in a minute.',
      );
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {status === 'ok' && <div className="form-note ok">{message}</div>}
      {status === 'err' && <div className="form-note err">{message}</div>}

      <div className="hp" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required maxLength={120} placeholder="Alex" />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={200}
          placeholder="you@school.edu"
        />
      </div>
      <div className="field">
        <label htmlFor="message">Message</label>
        <textarea
          id="message"
          name="message"
          required
          maxLength={4000}
          placeholder="Partnerships, press, schools, bugs, or just saying hi."
        />
      </div>
      <button className="btn btn-teal" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
