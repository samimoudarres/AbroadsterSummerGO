-- Toggle open_to_join on a planning trip (host only).
-- Run after 006/007 in the Supabase SQL editor.

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

  -- Locked / upcoming trips cannot accept join requests
  if t.status = 'upcoming' then
    update public.trips set open_to_join = false where id = p_trip_id;
    return;
  end if;

  update public.trips
  set open_to_join = coalesce(p_open, false)
  where id = p_trip_id;
end;
$$;
