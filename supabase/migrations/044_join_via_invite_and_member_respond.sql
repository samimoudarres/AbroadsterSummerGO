-- Allow any trip member (not only host) to accept/decline join requests.

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

grant execute on function public.respond_trip_join_request(uuid, boolean) to authenticated;

-- Join a trip directly via shared invite token (network-effect deep link).
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

  -- Clear any pending invite / join request for this user
  update public.trip_invites
  set status = 'accepted', responded_at = now()
  where trip_id = t.id and invitee_id = me and status = 'pending';

  update public.trip_join_requests
  set status = 'accepted'
  where trip_id = t.id and requester_id = me and status = 'pending';

  perform public.ensure_trip_channel(t.id);
  return t.id;
end;
$$;

grant execute on function public.join_trip_via_invite_token(text) to authenticated;
