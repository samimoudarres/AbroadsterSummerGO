-- Host can accept / decline open-to-join requests.
-- Safe to re-run.

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
  requester_name text;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select * into req from public.trip_join_requests where id = p_request_id;
  if req.id is null then raise exception 'Join request not found'; end if;
  if req.status <> 'pending' then raise exception 'Request already handled'; end if;

  select * into t from public.trips where id = req.trip_id;
  if t.id is null then raise exception 'Trip not found'; end if;
  if t.owner_id <> me then raise exception 'Only the host can respond'; end if;

  select full_name into my_name from public.profiles where id = me;
  select full_name into requester_name from public.profiles where id = req.requester_id;

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
        'owner_id', me
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
      'owner_id', me
    )
  );
end;
$$;

grant execute on function public.respond_trip_join_request(uuid, boolean) to authenticated;
