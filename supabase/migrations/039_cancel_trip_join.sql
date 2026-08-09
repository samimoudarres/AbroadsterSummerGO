-- Allow invitees to withdraw a pending join request (tap again to unrequest).

create or replace function public.cancel_trip_join(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_trip_id is null then
    raise exception 'Trip required';
  end if;

  delete from public.trip_join_requests
  where trip_id = p_trip_id
    and requester_id = me
    and status = 'pending';
end;
$$;

grant execute on function public.cancel_trip_join(uuid) to authenticated;

-- Client fallback path (direct delete) when RPC is unavailable
drop policy if exists "trip_join_requests delete own pending" on public.trip_join_requests;
create policy "trip_join_requests delete own pending" on public.trip_join_requests
  for delete using (requester_id = auth.uid() and status = 'pending');
