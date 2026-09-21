-- 054: Hard-fix community_members / messages RLS recursion (kills AirMail send).
-- Root cause: policies that SELECT community_members from within community_members
-- (or from messages/channels policies) re-enter RLS forever.
-- Fix: SECURITY DEFINER helpers that bypass RLS, then rewrite policies to use them.

-- row_security=off is required: helpers are called FROM RLS policies. Without it,
-- querying community_members/dm_participants re-enters those policies forever.
create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.community_members m
    where m.community_id = p_community_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
  );
$$;

create or replace function public.is_dm_participant(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dm_participants
    where thread_id = p_thread_id
      and user_id = auth.uid()
  );
$$;

alter function public.is_community_member(uuid) owner to postgres;
alter function public.is_trip_member(uuid) owner to postgres;
alter function public.is_dm_participant(uuid) owner to postgres;

revoke all on function public.is_community_member(uuid) from public;
grant execute on function public.is_community_member(uuid) to authenticated;
revoke all on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;
revoke all on function public.is_dm_participant(uuid) from public;
grant execute on function public.is_dm_participant(uuid) to authenticated;

-- community_members: own row OR same community via helper (no self-select under RLS)
drop policy if exists "community_members read own" on public.community_members;
drop policy if exists "community_members read peers" on public.community_members;
drop policy if exists "community_members select" on public.community_members;
create policy "community_members read own" on public.community_members
  for select using (user_id = auth.uid());
create policy "community_members read peers" on public.community_members
  for select using (public.is_community_member(community_id));

drop policy if exists "communities read members" on public.communities;
create policy "communities read members" on public.communities
  for select using (public.is_community_member(id));

drop policy if exists "channels read members" on public.channels;
create policy "channels read members" on public.channels
  for select using (
    (community_id is not null and public.is_community_member(community_id))
    or (trip_id is not null and public.is_trip_member(trip_id))
  );

drop policy if exists "messages read channel members" on public.messages;
create policy "messages read channel members" on public.messages
  for select using (
    sender_id = auth.uid()
    or (
      channel_id is not null
      and exists (
        select 1
        from public.channels c
        where c.id = channel_id
          and (
            (c.community_id is not null and public.is_community_member(c.community_id))
            or (c.trip_id is not null and public.is_trip_member(c.trip_id))
          )
      )
    )
    or (
      dm_thread_id is not null
      and public.is_dm_participant(dm_thread_id)
    )
  );

-- Keep insert simple (sender must be self); read policy above must not recurse
drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages
  for insert with check (
    sender_id = auth.uid()
    or kind = 'system'
  );

-- dm_participants: avoid self-referential SELECT policy
drop policy if exists "dm_participants select own threads" on public.dm_participants;
drop policy if exists "dm_participants select members" on public.dm_participants;
create policy "dm_participants select members" on public.dm_participants
  for select using (public.is_dm_participant(thread_id));

drop policy if exists "dm_participants insert self" on public.dm_participants;
create policy "dm_participants insert self" on public.dm_participants
  for insert with check (
    user_id = auth.uid()
    or public.is_dm_participant(thread_id)
  );

-- ---------------------------------------------------------------------------
-- Belt-and-suspenders RPCs so chat works even if a policy regresses.
-- row_security=off → no community_members recursion during insert/select.
-- ---------------------------------------------------------------------------
create or replace function public.send_chat_message(
  p_channel_id uuid,
  p_dm_thread_id uuid,
  p_kind text,
  p_body text,
  p_reply_to_id uuid default null,
  p_trip_id uuid default null,
  p_poll_id uuid default null,
  p_image_url text default null,
  p_post_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.messages
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  me uuid := auth.uid();
  row public.messages;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_channel_id is null and p_dm_thread_id is null then
    raise exception 'Missing target';
  end if;
  if p_dm_thread_id is not null and not public.is_dm_participant(p_dm_thread_id) then
    raise exception 'Not a participant';
  end if;
  if p_channel_id is not null then
    if not exists (
      select 1 from public.channels c
      where c.id = p_channel_id
        and (
          (c.community_id is not null and public.is_community_member(c.community_id))
          or (c.trip_id is not null and public.is_trip_member(c.trip_id))
        )
    ) then
      raise exception 'Not a channel member';
    end if;
  end if;

  insert into public.messages (
    sender_id, kind, body, reply_to_id, trip_id, poll_id,
    image_url, post_id, metadata, channel_id, dm_thread_id
  ) values (
    me,
    coalesce(nullif(p_kind, ''), 'text'),
    p_body,
    p_reply_to_id,
    p_trip_id,
    p_poll_id,
    p_image_url,
    p_post_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_channel_id,
    p_dm_thread_id
  )
  returning * into row;

  return row;
end;
$$;

grant execute on function public.send_chat_message(
  uuid, uuid, text, text, uuid, uuid, uuid, text, uuid, jsonb
) to authenticated;

create or replace function public.list_chat_messages(
  p_channel_id uuid,
  p_dm_thread_id uuid,
  p_limit int default 50,
  p_before timestamptz default null
)
returns setof public.messages
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_dm_thread_id is not null then
    if not public.is_dm_participant(p_dm_thread_id) then
      raise exception 'Not a participant';
    end if;
    return query
      select m.*
      from public.messages m
      where m.dm_thread_id = p_dm_thread_id
        and (p_before is null or m.created_at < p_before)
      order by m.created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 100));
    return;
  end if;
  if p_channel_id is not null then
    if not exists (
      select 1 from public.channels c
      where c.id = p_channel_id
        and (
          (c.community_id is not null and public.is_community_member(c.community_id))
          or (c.trip_id is not null and public.is_trip_member(c.trip_id))
        )
    ) then
      raise exception 'Not a channel member';
    end if;
    return query
      select m.*
      from public.messages m
      where m.channel_id = p_channel_id
        and (p_before is null or m.created_at < p_before)
      order by m.created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 100));
    return;
  end if;
  raise exception 'Missing target';
end;
$$;

grant execute on function public.list_chat_messages(uuid, uuid, int, timestamptz)
  to authenticated;
