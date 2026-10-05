-- Friend notification history + DM read tracking (no push blasts).
-- Backfill missing friend_added rows WITHOUT firing Expo push.

-- ---------------------------------------------------------------------------
-- Pause push while we backfill inbox history
-- ---------------------------------------------------------------------------
alter table public.notifications disable trigger notifications_dispatch_push;

insert into public.notifications (user_id, kind, title, body, data, created_at, read_at)
select
  f.friend_id,
  'friend_added',
  'New friend',
  coalesce(nullif(trim(p.full_name), ''), 'Someone') || ' added you as a friend',
  jsonb_build_object('from_user_id', f.user_id),
  coalesce(f.created_at, now()),
  now() -- mark historical backfill as already-read so we don't spam unread badges
from public.friendships f
join public.profiles p on p.id = f.user_id
where f.friend_id is not null
  and f.user_id is not null
  and f.friend_id <> f.user_id
  and not exists (
    select 1
    from public.notifications n
    where n.user_id = f.friend_id
      and n.kind = 'friend_added'
      and (
        (n.data ->> 'from_user_id') = f.user_id::text
        or (n.data ->> 'fromUserId') = f.user_id::text
      )
  );

alter table public.notifications enable trigger notifications_dispatch_push;

-- Keep add_friend inserting friend_added every time someone is added
create or replace function public.add_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if me = p_friend_id then raise exception 'Cannot friend yourself'; end if;

  select full_name into my_name from public.profiles where id = me;

  insert into public.friendships(user_id, friend_id)
  values (me, p_friend_id)
  on conflict do nothing;

  -- Always log to notification center (prefs only gate push via dispatch trigger)
  insert into public.notifications(user_id, kind, title, body, data)
  values (
    p_friend_id,
    'friend_added',
    'New friend',
    coalesce(my_name, 'Someone') || ' added you as a friend',
    jsonb_build_object('from_user_id', me)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- DM read: allow participants to update their own last_read_at
-- ---------------------------------------------------------------------------
drop policy if exists "dm_participants update self" on public.dm_participants;
create policy "dm_participants update self" on public.dm_participants
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.mark_dm_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_thread_id is null then
    return;
  end if;

  update public.dm_participants
  set last_read_at = now()
  where thread_id = p_thread_id
    and user_id = uid;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where user_id = uid
    and kind = 'dm_message'
    and read_at is null
    and (data->>'thread_id') = p_thread_id::text;
end;
$$;

grant execute on function public.mark_dm_thread_read(uuid) to authenticated;
