-- User blocks + content reports (Google Play UGC / safety requirements)

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks select own" on public.user_blocks;
create policy "user_blocks select own" on public.user_blocks
  for select using (blocker_id = auth.uid());

drop policy if exists "user_blocks insert own" on public.user_blocks;
create policy "user_blocks insert own" on public.user_blocks
  for insert with check (blocker_id = auth.uid());

drop policy if exists "user_blocks delete own" on public.user_blocks;
create policy "user_blocks delete own" on public.user_blocks
  for delete using (blocker_id = auth.uid());

create or replace function public.block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_blocked_id is null or p_blocked_id = me then
    raise exception 'Invalid user';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (me, p_blocked_id)
  on conflict do nothing;

  -- Drop friendship both ways
  delete from public.friendships
  where (user_id = me and friend_id = p_blocked_id)
     or (user_id = p_blocked_id and friend_id = me);
end;
$$;

create or replace function public.unblock_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from public.user_blocks
  where blocker_id = auth.uid()
    and blocked_id = p_blocked_id;
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Content / user reports
-- ---------------------------------------------------------------------------
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (
    target_type in ('user', 'post', 'message', 'trip', 'album_photo')
  ),
  target_id text,
  reason text not null,
  details text,
  status text not null default 'open' check (
    status in ('open', 'reviewed', 'actioned', 'dismissed')
  ),
  created_at timestamptz not null default now()
);

create index if not exists content_reports_status_idx
  on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;

drop policy if exists "content_reports insert own" on public.content_reports;
create policy "content_reports insert own" on public.content_reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists "content_reports select own" on public.content_reports;
create policy "content_reports select own" on public.content_reports
  for select using (reporter_id = auth.uid());

create or replace function public.report_content(
  p_target_type text,
  p_target_id text,
  p_reported_user_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  rid uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_reason is null or length(trim(p_reason)) < 2 then
    raise exception 'Reason required';
  end if;
  if p_target_type not in ('user', 'post', 'message', 'trip', 'album_photo') then
    raise exception 'Invalid target';
  end if;

  insert into public.content_reports (
    reporter_id, reported_user_id, target_type, target_id, reason, details
  )
  values (
    me,
    p_reported_user_id,
    p_target_type,
    nullif(trim(coalesce(p_target_id, '')), ''),
    trim(p_reason),
    nullif(trim(coalesce(p_details, '')), '')
  )
  returning id into rid;

  return rid;
end;
$$;

grant execute on function public.report_content(text, text, uuid, text, text) to authenticated;
