-- Public upcoming trips can stay open to join.
-- confirm_trip no longer forces private; set_trip_open_to_join works for upcoming.

create or replace function public.set_trip_open_to_join(p_trip_id uuid, p_open boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t public.trips%rowtype;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select * into t from public.trips where id = p_trip_id;
  if not found then raise exception 'Trip not found'; end if;
  if t.owner_id <> me then raise exception 'Only the host can change join settings'; end if;

  -- Past trips (by end date) cannot accept new joiners
  if t.date_end is not null and t.date_end < current_date then
    update public.trips set open_to_join = false where id = p_trip_id;
    return;
  end if;

  update public.trips
  set open_to_join = coalesce(p_open, false)
  where id = p_trip_id;
end;
$$;

create or replace function public.confirm_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t public.trips%rowtype;
  my_name text;
  member record;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select * into t from public.trips where id = p_trip_id;
  if not found then raise exception 'Trip not found'; end if;
  if t.owner_id <> me then raise exception 'Only the host can confirm this trip'; end if;

  if t.status = 'upcoming' then
    -- Already locked in — refresh passport/scores; keep open_to_join as-is
    for member in
      select user_id from public.trip_members where trip_id = p_trip_id
    loop
      perform public.passport_apply_trip_unlock(
        member.user_id, p_trip_id, t.destination_city, t.destination_country,
        t.latitude, t.longitude
      );
      perform public.recompute_explorer_score(member.user_id);
    end loop;
    return;
  end if;

  -- Preserve open_to_join so public planning trips stay joinable when locked in
  update public.trips
  set status = 'upcoming'
  where id = p_trip_id;

  -- Only auto-decline pending requests when the trip is private
  if not coalesce(t.open_to_join, false) then
    update public.trip_join_requests
    set status = 'declined'
    where trip_id = p_trip_id and status = 'pending';
  end if;

  perform public.ensure_trip_album(p_trip_id);

  select full_name into my_name from public.profiles where id = me;

  for member in
    select user_id from public.trip_members
    where trip_id = p_trip_id and user_id <> me
  loop
    insert into public.notifications(user_id, kind, title, body, data)
    values (
      member.user_id,
      'trip_confirmed',
      'Trip confirmed',
      coalesce(my_name, 'Someone') || ' locked in ' || coalesce(t.destination_city, 'the trip'),
      jsonb_build_object('trip_id', p_trip_id, 'owner_id', me)
    );
  end loop;

  for member in
    select user_id from public.trip_members where trip_id = p_trip_id
  loop
    perform public.passport_apply_trip_unlock(
      member.user_id, p_trip_id, t.destination_city, t.destination_country,
      t.latitude, t.longitude
    );
    perform public.recompute_explorer_score(member.user_id);
  end loop;
end;
$$;

-- Block join requests on past trips even if open_to_join was left true
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

  if coalesce(t.date_end, t.date_start) is not null
     and coalesce(t.date_end, t.date_start) < current_date then
    raise exception 'This trip has already ended';
  end if;

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
      jsonb_build_object(
        'trip_id', p_trip_id,
        'request_id', req_id,
        'requester_id', requester
      )
    );
  end loop;

  return req_id;
end;
$$;
