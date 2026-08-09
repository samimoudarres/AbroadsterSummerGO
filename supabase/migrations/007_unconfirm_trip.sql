-- Unlock trip + allow host to update trip status/open_to_join.
-- Safe to re-run. Paste into Supabase SQL editor.

create or replace function public.unconfirm_trip(p_trip_id uuid)
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
  if t.owner_id <> me then raise exception 'Only the host can unconfirm this trip'; end if;

  update public.trips
  set status = 'planning'
  where id = p_trip_id;
end;
$$;

drop policy if exists "trips update own" on public.trips;
create policy "trips update own" on public.trips
  for update using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
