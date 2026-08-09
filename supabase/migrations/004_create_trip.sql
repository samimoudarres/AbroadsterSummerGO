-- Create Trip: description/capacity/invite token, trip invites, trip chat channels, RPCs

-- ---------------------------------------------------------------------------
-- Trip columns
-- ---------------------------------------------------------------------------
alter table public.trips
  add column if not exists description text,
  add column if not exists max_members int,
  add column if not exists invite_token text;

update public.trips
set invite_token = encode(gen_random_bytes(12), 'hex')
where invite_token is null;

alter table public.trips
  alter column invite_token set default encode(gen_random_bytes(12), 'hex');

create unique index if not exists trips_invite_token_uidx
  on public.trips (invite_token);

-- ---------------------------------------------------------------------------
-- Trip invites (owner invites friends; invitee must accept)
-- ---------------------------------------------------------------------------
create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (trip_id, invitee_id)
);

create index if not exists trip_invites_invitee_idx
  on public.trip_invites (invitee_id, status);

alter table public.trip_invites enable row level security;

drop policy if exists "trip_invites read involved" on public.trip_invites;
create policy "trip_invites read involved" on public.trip_invites
  for select using (
    auth.uid() = inviter_id
    or auth.uid() = invitee_id
    or exists (
      select 1 from public.trip_members m
      where m.trip_id = trip_invites.trip_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Trip chat channels: community_id XOR trip_id, slug includes 'trip'
-- ---------------------------------------------------------------------------
alter table public.channels
  alter column community_id drop not null;

alter table public.channels
  add column if not exists trip_id uuid unique references public.trips(id) on delete cascade;

alter table public.channels drop constraint if exists channels_slug_check;
alter table public.channels
  add constraint channels_slug_check
  check (slug in ('general', 'introductions', 'trips', 'roommates', 'trip'));

alter table public.channels drop constraint if exists channels_community_or_trip;
alter table public.channels
  add constraint channels_community_or_trip check (
    (community_id is not null and trip_id is null and slug <> 'trip')
    or (community_id is null and trip_id is not null and slug = 'trip')
  );

-- Members of a trip can read that trip's channel
drop policy if exists "channels read members" on public.channels;
create policy "channels read members" on public.channels for select using (
  (
    community_id is not null
    and exists (
      select 1 from public.community_members m
      where m.community_id = channels.community_id and m.user_id = auth.uid()
    )
  )
  or (
    trip_id is not null
    and exists (
      select 1 from public.trip_members tm
      where tm.trip_id = channels.trip_id and tm.user_id = auth.uid()
    )
  )
);

drop policy if exists "messages read channel members" on public.messages;
create policy "messages read channel members" on public.messages for select using (
  (channel_id is not null and exists (
    select 1 from public.channels c
    where c.id = channel_id
      and (
        (
          c.community_id is not null
          and exists (
            select 1 from public.community_members m
            where m.community_id = c.community_id and m.user_id = auth.uid()
          )
        )
        or (
          c.trip_id is not null
          and exists (
            select 1 from public.trip_members tm
            where tm.trip_id = c.trip_id and tm.user_id = auth.uid()
          )
        )
      )
  ))
  or (dm_thread_id is not null and exists (
    select 1 from public.dm_participants p
    where p.thread_id = dm_thread_id and p.user_id = auth.uid()
  ))
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.trip_member_count(p_trip_id uuid)
returns int
language sql
stable
as $$
  select count(*)::int from public.trip_members where trip_id = p_trip_id;
$$;

create or replace function public.ensure_trip_channel(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  city text;
begin
  select id into cid from public.channels where trip_id = p_trip_id;
  if cid is not null then
    return cid;
  end if;

  select destination_city into city from public.trips where id = p_trip_id;
  insert into public.channels(community_id, trip_id, slug, name)
  values (null, p_trip_id, 'trip', coalesce(city, 'Trip'))
  returning id into cid;
  return cid;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_trip
-- ---------------------------------------------------------------------------
create or replace function public.create_trip(
  p_destination_city text,
  p_destination_country text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_date_start date default null,
  p_date_end date default null,
  p_date_label text default null,
  p_description text default null,
  p_open_to_join boolean default true,
  p_max_members int default null,
  p_invitee_ids uuid[] default '{}',
  p_notify_friends boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  tid uuid;
  token text;
  channel_id uuid;
  album_id uuid;
  invitee uuid;
  my_name text;
  dest text;
  friend record;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_destination_city), '') = '' then
    raise exception 'Destination city required';
  end if;

  select full_name into my_name from public.profiles where id = me;
  dest := trim(p_destination_city) || ', ' || coalesce(nullif(trim(p_destination_country), ''), '');

  insert into public.trips (
    owner_id, status, open_to_join,
    destination_city, destination_country,
    date_label, date_start, date_end,
    latitude, longitude, description, max_members
  ) values (
    me, 'planning', coalesce(p_open_to_join, true),
    trim(p_destination_city), coalesce(nullif(trim(p_destination_country), ''), ''),
    p_date_label, p_date_start, p_date_end,
    p_latitude, p_longitude, nullif(trim(coalesce(p_description, '')), ''),
    p_max_members
  )
  returning id, invite_token into tid, token;

  insert into public.trip_members(trip_id, user_id, role)
  values (tid, me, 'owner');

  album_id := public.ensure_trip_album(tid);
  channel_id := public.ensure_trip_channel(tid);

  if p_invitee_ids is not null then
    foreach invitee in array p_invitee_ids
    loop
      if invitee is null or invitee = me then
        continue;
      end if;
      insert into public.trip_invites(trip_id, inviter_id, invitee_id, status)
      values (tid, me, invitee, 'pending')
      on conflict (trip_id, invitee_id) do update set status = 'pending';

      insert into public.notifications(user_id, kind, title, body, data)
      values (
        invitee,
        'trip_invite',
        'Trip invite',
        coalesce(my_name, 'Someone') || ' invited you to ' || trim(p_destination_city),
        jsonb_build_object('trip_id', tid, 'invitee_id', invitee, 'inviter_id', me)
      );
    end loop;
  end if;

  if coalesce(p_notify_friends, false) then
    for friend in
      select friend_id from public.friendships where user_id = me
    loop
      if friend.friend_id = me then continue; end if;
      if p_invitee_ids is not null and friend.friend_id = any (p_invitee_ids) then
        continue;
      end if;
      insert into public.notifications(user_id, kind, title, body, data)
      values (
        friend.friend_id,
        'trip_created',
        'New trip',
        coalesce(my_name, 'A friend') || ' is planning a trip to ' || trim(p_destination_city),
        jsonb_build_object('trip_id', tid, 'owner_id', me)
      );
    end loop;
  end if;

  return jsonb_build_object(
    'trip_id', tid,
    'invite_token', token,
    'channel_id', channel_id,
    'album_id', album_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- invite_to_trip
-- ---------------------------------------------------------------------------
create or replace function public.invite_to_trip(p_trip_id uuid, p_invitee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  invite_id uuid;
  my_name text;
  city text;
  is_member boolean;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_invitee_id = me then raise exception 'Cannot invite yourself'; end if;

  select exists(
    select 1 from public.trip_members where trip_id = p_trip_id and user_id = me
  ) into is_member;
  if not is_member then raise exception 'Not a trip member'; end if;

  select full_name into my_name from public.profiles where id = me;
  select destination_city into city from public.trips where id = p_trip_id;

  insert into public.trip_invites(trip_id, inviter_id, invitee_id, status)
  values (p_trip_id, me, p_invitee_id, 'pending')
  on conflict (trip_id, invitee_id) do update set status = 'pending', inviter_id = me
  returning id into invite_id;

  insert into public.notifications(user_id, kind, title, body, data)
  values (
    p_invitee_id,
    'trip_invite',
    'Trip invite',
    coalesce(my_name, 'Someone') || ' invited you to ' || coalesce(city, 'a trip'),
    jsonb_build_object('trip_id', p_trip_id, 'invite_id', invite_id, 'inviter_id', me)
  );

  return invite_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- respond_trip_invite
-- ---------------------------------------------------------------------------
create or replace function public.respond_trip_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  inv public.trip_invites%rowtype;
  t public.trips%rowtype;
  member_count int;
  my_name text;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select * into inv from public.trip_invites where id = p_invite_id;
  if inv.id is null then raise exception 'Invite not found'; end if;
  if inv.invitee_id <> me then raise exception 'Not your invite'; end if;
  if inv.status <> 'pending' then raise exception 'Invite already handled'; end if;

  select * into t from public.trips where id = inv.trip_id;
  select full_name into my_name from public.profiles where id = me;

  if not coalesce(p_accept, false) then
    update public.trip_invites set status = 'declined' where id = p_invite_id;
    return;
  end if;

  member_count := public.trip_member_count(inv.trip_id);
  if t.max_members is not null and member_count >= t.max_members then
    raise exception 'Trip is full';
  end if;

  update public.trip_invites set status = 'accepted' where id = p_invite_id;
  insert into public.trip_members(trip_id, user_id, role)
  values (inv.trip_id, me, 'member')
  on conflict do nothing;

  perform public.ensure_trip_channel(inv.trip_id);

  insert into public.notifications(user_id, kind, title, body, data)
  values (
    inv.inviter_id,
    'trip_invite_accepted',
    'Invite accepted',
    coalesce(my_name, 'Someone') || ' joined your ' || t.destination_city || ' trip',
    jsonb_build_object('trip_id', inv.trip_id, 'invitee_id', me)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_trip_member (owner only; cannot remove self if sole owner without transfer)
-- ---------------------------------------------------------------------------
create or replace function public.remove_trip_member(p_trip_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  owner uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select owner_id into owner from public.trips where id = p_trip_id;
  if owner is null then raise exception 'Trip not found'; end if;
  if me <> owner and me <> p_user_id then
    raise exception 'Not allowed';
  end if;
  if p_user_id = owner then
    raise exception 'Owner cannot leave; delete trip instead';
  end if;

  delete from public.trip_members where trip_id = p_trip_id and user_id = p_user_id;
  update public.trip_invites
  set status = 'declined'
  where trip_id = p_trip_id and invitee_id = p_user_id and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- request_trip_join — enforce open_to_join + max_members
-- ---------------------------------------------------------------------------
create or replace function public.request_trip_join(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  req_id uuid;
  requester uuid := auth.uid();
  member record;
  requester_name text;
  t public.trips%rowtype;
  member_count int;
begin
  if requester is null then raise exception 'Not authenticated'; end if;

  select * into t from public.trips where id = p_trip_id;
  if t.id is null then raise exception 'Trip not found'; end if;
  if not t.open_to_join then raise exception 'This trip is private'; end if;

  member_count := public.trip_member_count(p_trip_id);
  if t.max_members is not null and member_count >= t.max_members then
    raise exception 'Trip is full';
  end if;

  if exists (
    select 1 from public.trip_members where trip_id = p_trip_id and user_id = requester
  ) then
    raise exception 'Already a member';
  end if;

  select full_name into requester_name from public.profiles where id = requester;

  insert into public.trip_join_requests(trip_id, requester_id, status)
  values (p_trip_id, requester, 'pending')
  on conflict (trip_id, requester_id)
  do update set status = 'pending'
  returning id into req_id;

  for member in
    select user_id from public.trip_members where trip_id = p_trip_id
  loop
    insert into public.notifications(user_id, kind, title, body, data)
    values (
      member.user_id,
      'trip_join_request',
      'Trip join request',
      coalesce(requester_name, 'Someone') || ' requested to join your trip',
      jsonb_build_object('trip_id', p_trip_id, 'request_id', req_id, 'requester_id', requester)
    );
  end loop;

  return req_id;
end;
$$;

-- Resolve invite token → trip id (for deep links)
create or replace function public.resolve_trip_invite_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.trips where invite_token = p_token limit 1;
$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.trip_invites;
  exception when duplicate_object then null;
  end;
end $$;
