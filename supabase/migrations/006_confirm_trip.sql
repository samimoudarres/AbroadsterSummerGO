-- Confirm / lock a planning trip → upcoming.
-- Run after 004 + 005 in the Supabase SQL editor.

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
    update public.trips set open_to_join = false where id = p_trip_id;
    return;
  end if;

  update public.trips
  set status = 'upcoming', open_to_join = false
  where id = p_trip_id;

  update public.trip_join_requests
  set status = 'declined'
  where trip_id = p_trip_id and status = 'pending';

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
end;
$$;
