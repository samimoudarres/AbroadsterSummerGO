-- Fix: join_trip_via_invite_token (044) writes responded_at but the column
-- was never added to trip_invites.
alter table public.trip_invites
  add column if not exists responded_at timestamptz;
