-- Fix Security Advisor: RLS Disabled in Public on notification dedup tables.
-- These tables are internal bookkeeping only (cron / security definer triggers).
-- The Expo client never queries them. Enable RLS and revoke API roles.

alter table public.trip_countdown_sent enable row level security;
alter table public.trip_invite_reminder_sent enable row level security;
alter table public.friend_nearby_sent enable row level security;

-- No client policies = deny all for anon / authenticated via the Data API.
-- Cron / trigger writers are security definer and continue to work.
revoke all on table public.trip_countdown_sent from anon, authenticated;
revoke all on table public.trip_invite_reminder_sent from anon, authenticated;
revoke all on table public.friend_nearby_sent from anon, authenticated;

-- Keep service_role able to manage rows if needed for ops/cron.
grant all on table public.trip_countdown_sent to service_role;
grant all on table public.trip_invite_reminder_sent to service_role;
grant all on table public.friend_nearby_sent to service_role;

comment on table public.trip_countdown_sent is
  'Internal dedup for trip countdown notifications. No direct client access.';
comment on table public.trip_invite_reminder_sent is
  'Internal dedup for trip invite reminder notifications. No direct client access.';
comment on table public.friend_nearby_sent is
  'Internal dedup for friend-nearby alerts. No direct client access.';
