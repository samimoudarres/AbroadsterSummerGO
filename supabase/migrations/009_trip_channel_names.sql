-- Trip chat channel naming + allow members to read trip destinations.
-- Safe to re-run. Paste into Supabase SQL editor.

drop policy if exists "trips read all" on public.trips;
create policy "trips read all" on public.trips for select using (true);

create or replace function public.ensure_trip_channel(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  city text;
  country text;
  label text;
begin
  select destination_city, destination_country
    into city, country
  from public.trips
  where id = p_trip_id;

  city := nullif(trim(coalesce(city, '')), '');
  country := nullif(trim(coalesce(country, '')), '');

  if city is null then
    label := 'Trip chat';
  else
    label := city;
    if country is not null then
      label := label || ', ' || country;
    end if;
    label := label || ' trip';
  end if;

  select id into cid from public.channels where trip_id = p_trip_id limit 1;
  if cid is not null then
    update public.channels set name = label where id = cid;
    return cid;
  end if;

  insert into public.channels(community_id, trip_id, slug, name)
  values (null, p_trip_id, 'trip', label)
  returning id into cid;
  return cid;
end;
$$;

-- Backfill / rename channels for every trip
do $$
declare
  r record;
begin
  for r in select id from public.trips
  loop
    perform public.ensure_trip_channel(r.id);
  end loop;
end $$;
