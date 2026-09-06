-- Support / contact tickets: stored server-side only (service role).
-- Website form inserts via Next.js API; never expose owner email to visitors.

create table if not exists public.contact_tickets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  source text not null default 'website',
  ip text,
  user_agent text,
  status text not null default 'open'
    check (status in ('open', 'replied', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists contact_tickets_created_at_idx
  on public.contact_tickets (created_at desc);

create index if not exists contact_tickets_status_idx
  on public.contact_tickets (status);

alter table public.contact_tickets enable row level security;

-- No direct client access — inserts go through the website service role.
revoke all on table public.contact_tickets from anon, authenticated;
grant all on table public.contact_tickets to service_role;

comment on table public.contact_tickets is
  'Support/contact form submissions from the marketing site. Owner notified by email.';
