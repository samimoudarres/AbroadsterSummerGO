-- User activity events for admin engagement insights (app opens + feature usage).
-- Safe to re-run.

alter table public.profiles
  add column if not exists last_active_at timestamptz;

create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null
    check (kind in (
      'app_open',
      'home_feed',
      'notifications_open',
      'create_post',
      'stamp',
      'message_send'
    )),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_activity_events_user_created_idx
  on public.user_activity_events (user_id, created_at desc);

create index if not exists user_activity_events_kind_created_idx
  on public.user_activity_events (kind, created_at desc);

create index if not exists profiles_last_active_at_idx
  on public.profiles (last_active_at desc nulls last);

alter table public.user_activity_events enable row level security;

drop policy if exists "activity insert own" on public.user_activity_events;
create policy "activity insert own" on public.user_activity_events
  for insert
  with check (auth.uid() = user_id);

-- Users cannot read each other's activity (admin uses service role).
drop policy if exists "activity read own" on public.user_activity_events;
create policy "activity read own" on public.user_activity_events
  for select
  using (auth.uid() = user_id);

create or replace function public.record_user_activity(
  p_kind text,
  p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  event_id uuid;
  recent uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  if p_kind is null or p_kind not in (
    'app_open', 'home_feed', 'notifications_open',
    'create_post', 'stamp', 'message_send'
  ) then
    raise exception 'Invalid activity kind';
  end if;

  -- Debounce noisy events: same kind within 20 minutes counts once.
  if p_kind in ('app_open', 'home_feed', 'notifications_open') then
    select id into recent
    from public.user_activity_events
    where user_id = me
      and kind = p_kind
      and created_at > now() - interval '20 minutes'
    order by created_at desc
    limit 1;

    if recent is not null then
      update public.profiles
      set last_active_at = now()
      where id = me;
      return recent;
    end if;
  end if;

  insert into public.user_activity_events (user_id, kind, meta)
  values (me, p_kind, coalesce(p_meta, '{}'::jsonb))
  returning id into event_id;

  update public.profiles
  set last_active_at = now()
  where id = me;

  return event_id;
end;
$$;

grant execute on function public.record_user_activity(text, jsonb) to authenticated;
