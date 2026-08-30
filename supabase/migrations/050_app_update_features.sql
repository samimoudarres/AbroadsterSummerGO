-- App update: mutual friends helper, passport cities on trip create/join, backfill sync

-- ---------------------------------------------------------------------------
-- Mutual friend ids (both users added each other)
-- ---------------------------------------------------------------------------
create or replace function public.list_mutual_friend_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(f1.friend_id), '{}'::uuid[])
  from public.friendships f1
  join public.friendships f2
    on f2.user_id = f1.friend_id
   and f2.friend_id = f1.user_id
  where f1.user_id = auth.uid();
$$;

grant execute on function public.list_mutual_friend_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill passport city ranks from all trips the user is on
-- ---------------------------------------------------------------------------
create or replace function public.passport_sync_my_trip_cities()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  applied int := 0;
  row record;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  for row in
    select t.id as trip_id,
           t.destination_city,
           t.destination_country,
           t.latitude,
           t.longitude
    from public.trip_members tm
    join public.trips t on t.id = tm.trip_id
    where tm.user_id = me
      and coalesce(trim(t.destination_city), '') <> ''
  loop
    perform public.passport_apply_trip_unlock(
      me,
      row.trip_id,
      row.destination_city,
      row.destination_country,
      row.latitude,
      row.longitude
    );
    applied := applied + 1;
  end loop;

  return applied;
end;
$$;

grant execute on function public.passport_sync_my_trip_cities() to authenticated;

-- ---------------------------------------------------------------------------
-- create_trip: unlock passport city for creator immediately
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
  album_id uuid;
  channel_id uuid;
  invitee uuid;
  invite_id uuid;
  friend record;
  my_name text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_destination_city), '') = '' then
    raise exception 'Destination city required';
  end if;

  select full_name into my_name from public.profiles where id = me;

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

  perform public.passport_apply_trip_unlock(
    me, tid, trim(p_destination_city),
    coalesce(nullif(trim(p_destination_country), ''), ''),
    p_latitude, p_longitude
  );

  if p_invitee_ids is not null then
    foreach invitee in array p_invitee_ids
    loop
      if invitee is null or invitee = me then
        continue;
      end if;
      insert into public.trip_invites(trip_id, inviter_id, invitee_id, status)
      values (tid, me, invitee, 'pending')
      on conflict (trip_id, invitee_id) do update
        set status = 'pending', inviter_id = me
      returning id into invite_id;

      insert into public.notifications(user_id, kind, title, body, data)
      values (
        invitee,
        'trip_invite',
        'Trip invite',
        coalesce(my_name, 'Someone') || ' invited you to ' || trim(p_destination_city),
        jsonb_build_object(
          'trip_id', tid,
          'invite_id', invite_id,
          'invitee_id', invitee,
          'inviter_id', me
        )
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
-- respond_trip_invite (accept): unlock passport for new member
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
    update public.trip_invites
    set status = 'declined', responded_at = now()
    where id = p_invite_id;
    return;
  end if;

  member_count := public.trip_member_count(inv.trip_id);
  if t.max_members is not null and member_count >= t.max_members then
    raise exception 'Trip is full';
  end if;

  update public.trip_invites
  set status = 'accepted', responded_at = now()
  where id = p_invite_id;

  insert into public.trip_members(trip_id, user_id, role)
  values (inv.trip_id, me, 'member')
  on conflict do nothing;

  perform public.ensure_trip_channel(inv.trip_id);

  perform public.passport_apply_trip_unlock(
    me, inv.trip_id, t.destination_city, t.destination_country,
    t.latitude, t.longitude
  );

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
-- respond_trip_join_request (accept): unlock passport for requester
-- ---------------------------------------------------------------------------
create or replace function public.respond_trip_join_request(
  p_request_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  req public.trip_join_requests%rowtype;
  t public.trips%rowtype;
  member_count int;
  my_name text;
  is_member boolean;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select * into req from public.trip_join_requests where id = p_request_id;
  if req.id is null then raise exception 'Join request not found'; end if;
  if req.status <> 'pending' then raise exception 'Request already handled'; end if;

  select * into t from public.trips where id = req.trip_id;
  if t.id is null then raise exception 'Trip not found'; end if;

  select exists(
    select 1 from public.trip_members tm
    where tm.trip_id = req.trip_id and tm.user_id = me
  ) into is_member;
  if not is_member and t.owner_id <> me then
    raise exception 'Only trip members can respond';
  end if;

  select full_name into my_name from public.profiles where id = me;

  if not coalesce(p_accept, false) then
    update public.trip_join_requests
    set status = 'declined'
    where id = p_request_id;

    insert into public.notifications(user_id, kind, title, body, data)
    values (
      req.requester_id,
      'trip_join_declined',
      'Join request declined',
      coalesce(my_name, 'Someone') || ' declined your request to join ' ||
        coalesce(t.destination_city, 'their trip'),
      jsonb_build_object(
        'trip_id', req.trip_id,
        'request_id', p_request_id,
        'responder_id', me
      )
    );
    return;
  end if;

  member_count := public.trip_member_count(req.trip_id);
  if t.max_members is not null and member_count >= t.max_members then
    raise exception 'Trip is full';
  end if;

  update public.trip_join_requests
  set status = 'accepted'
  where id = p_request_id;

  insert into public.trip_members(trip_id, user_id, role)
  values (req.trip_id, req.requester_id, 'member')
  on conflict do nothing;

  perform public.ensure_trip_channel(req.trip_id);

  perform public.passport_apply_trip_unlock(
    req.requester_id, req.trip_id, t.destination_city, t.destination_country,
    t.latitude, t.longitude
  );

  insert into public.notifications(user_id, kind, title, body, data)
  values (
    req.requester_id,
    'trip_join_accepted',
    'You’re in!',
    coalesce(my_name, 'Someone') || ' accepted you on the ' ||
      coalesce(t.destination_city, '') || ' trip',
    jsonb_build_object(
      'trip_id', req.trip_id,
      'request_id', p_request_id,
      'responder_id', me
    )
  );
end;
$$;

-- join_trip_via_invite_token: unlock passport for joiner
create or replace function public.join_trip_via_invite_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t public.trips%rowtype;
  member_count int;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Invalid invite';
  end if;

  select * into t from public.trips where invite_token = trim(p_token) limit 1;
  if t.id is null then raise exception 'Invite not found'; end if;

  if exists(
    select 1 from public.trip_members tm
    where tm.trip_id = t.id and tm.user_id = me
  ) then
    return t.id;
  end if;

  member_count := public.trip_member_count(t.id);
  if t.max_members is not null and member_count >= t.max_members then
    raise exception 'Trip is full';
  end if;

  insert into public.trip_members(trip_id, user_id, role)
  values (t.id, me, 'member')
  on conflict do nothing;

  update public.trip_invites
  set status = 'accepted', responded_at = now()
  where trip_id = t.id and invitee_id = me and status = 'pending';

  update public.trip_join_requests
  set status = 'accepted'
  where trip_id = t.id and requester_id = me and status = 'pending';

  perform public.ensure_trip_channel(t.id);

  perform public.passport_apply_trip_unlock(
    me, t.id, t.destination_city, t.destination_country,
    t.latitude, t.longitude
  );

  return t.id;
end;
$$;
