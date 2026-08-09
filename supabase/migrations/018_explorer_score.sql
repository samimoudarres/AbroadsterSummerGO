-- Explorer Score: cached miles on profiles; recompute on trip lock/unlock.
-- Baseline = home university → abroad program; plus unique upcoming trip destinations from host city.

alter table public.profiles
  add column if not exists explorer_score_miles int not null default 0;

-- Haversine miles between two lat/lng points
create or replace function public.distance_miles(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else (
      3958.8 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lon2 - lon1) / 2), 2)
      ))
    )
  end;
$$;

-- Static campus / city lookup (mirrors app lib/schoolMapTarget + tripCoords)
create or replace function public.explorer_lookup_point(p_label text)
returns table (latitude double precision, longitude double precision)
language plpgsql
immutable
as $$
declare
  q text := lower(trim(coalesce(p_label, '')));
begin
  if q = '' then return; end if;

  -- Abroad / host cities
  if q in ('london', 'london, uk', 'london, united kingdom')
     or q like 'london%' then
    latitude := 51.5074; longitude := -0.1278; return next; return;
  end if;
  if q like 'paris%' then latitude := 48.8566; longitude := 2.3522; return next; return; end if;
  if q like 'rome%' then latitude := 41.9028; longitude := 12.4964; return next; return; end if;
  if q like 'barcelona%' then latitude := 41.3874; longitude := 2.1686; return next; return; end if;
  if q like 'budapest%' then latitude := 47.4979; longitude := 19.0402; return next; return; end if;
  if q like 'florence%' then latitude := 43.7696; longitude := 11.2558; return next; return; end if;
  if q like 'madrid%' then latitude := 40.4168; longitude := -3.7038; return next; return; end if;
  if q like 'berlin%' then latitude := 52.52; longitude := 13.405; return next; return; end if;
  if q like 'amsterdam%' then latitude := 52.3676; longitude := 4.9041; return next; return; end if;
  if q like 'athens%' then latitude := 37.9838; longitude := 23.7275; return next; return; end if;
  if q like 'lisbon%' then latitude := 38.7223; longitude := -9.1393; return next; return; end if;
  if q like 'prague%' then latitude := 50.0755; longitude := 14.4378; return next; return; end if;
  if q like 'vienna%' then latitude := 48.2082; longitude := 16.3738; return next; return; end if;
  if q like 'nice%' then latitude := 43.7102; longitude := 7.262; return next; return; end if;
  if q like 'santorini%' then latitude := 36.3932; longitude := 25.4615; return next; return; end if;

  -- Programs
  if q like '%nyu%london%' or q = 'nyu in london' or q = 'nyu london' then
    latitude := 51.5155; longitude := -0.141; return next; return;
  end if;
  if q like '%nyu%paris%' then latitude := 48.8495; longitude := 2.343; return next; return; end if;
  if q like '%ciee%paris%' then latitude := 48.8738; longitude := 2.295; return next; return; end if;
  if q like '%ies%paris%' then latitude := 48.846; longitude := 2.37; return next; return; end if;
  if q like '%syracuse%florence%' then latitude := 43.7731; longitude := 11.256; return next; return; end if;
  if q like '%cea%barcelona%' then latitude := 41.3874; longitude := 2.1686; return next; return; end if;

  -- US campuses
  if q like '%indiana%' then latitude := 39.1682; longitude := -86.523; return next; return; end if;
  if q like '%syracuse%' then latitude := 43.0392; longitude := -76.1351; return next; return; end if;
  if q like '%ut austin%' or q like '%university of texas%' or q = 'ut austin' then
    latitude := 30.2849; longitude := -97.7341; return next; return;
  end if;
  if q = 'ucla' or q like '%los angeles%' then
    latitude := 34.0689; longitude := -118.4452; return next; return;
  end if;
  if q like '%michigan%' then latitude := 42.278; longitude := -83.7382; return next; return; end if;
  if q like '%boston university%' then latitude := 42.3505; longitude := -71.1054; return next; return; end if;
  if q like '%cu boulder%' or q like '%colorado%' then
    latitude := 40.0076; longitude := -105.2659; return next; return;
  end if;
  if q = 'nyu' or q like 'new york university%' then
    latitude := 40.7295; longitude := -73.9965; return next; return;
  end if;

  -- study_programs table (if seeded)
  begin
    select sp.latitude, sp.longitude into latitude, longitude
    from public.study_programs sp
    where sp.is_active
      and (
        lower(sp.name) = q
        or lower(sp.short_name) = q
        or lower(sp.name) like '%' || q || '%'
        or q like '%' || lower(sp.short_name) || '%'
      )
    order by case when lower(sp.name) = q then 0 else 1 end
    limit 1;
    if found and latitude is not null then return next; return; end if;
  exception when undefined_table then
    null;
  end;

  return;
end;
$$;

create or replace function public.recompute_explorer_score(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  home_lat double precision;
  home_lng double precision;
  abroad_lat double precision;
  abroad_lng double precision;
  host_lat double precision;
  host_lng double precision;
  total int := 0;
  leg double precision;
  dest record;
begin
  select * into p from public.profiles where id = p_user_id;
  if not found then return 0; end if;

  select e.latitude, e.longitude into home_lat, home_lng
  from public.explorer_lookup_point(p.home_university) e
  limit 1;

  select e.latitude, e.longitude into abroad_lat, abroad_lng
  from public.explorer_lookup_point(p.study_abroad_program) e
  limit 1;

  if home_lat is not null and abroad_lat is not null then
    total := total + round(public.distance_miles(home_lat, home_lng, abroad_lat, abroad_lng))::int;
  end if;

  -- Host / home-base city
  select e.latitude, e.longitude into host_lat, host_lng
  from public.explorer_lookup_point(
    trim(coalesce(p.host_city, '') || case
      when coalesce(p.host_country, '') <> '' then ', ' || p.host_country
      else ''
    end)
  ) e
  limit 1;

  if host_lat is null then
    host_lat := abroad_lat;
    host_lng := abroad_lng;
  end if;

  if host_lat is not null then
    for dest in
      select distinct on (lower(trim(t.destination_city)), lower(trim(coalesce(t.destination_country, ''))))
        t.destination_city,
        t.destination_country,
        t.latitude,
        t.longitude
      from public.trips t
      join public.trip_members tm on tm.trip_id = t.id
      where tm.user_id = p_user_id
        and t.status = 'upcoming'
      order by lower(trim(t.destination_city)), lower(trim(coalesce(t.destination_country, ''))), t.created_at desc nulls last
    loop
      if dest.latitude is not null and dest.longitude is not null then
        leg := public.distance_miles(host_lat, host_lng, dest.latitude, dest.longitude);
      else
        select public.distance_miles(host_lat, host_lng, e.latitude, e.longitude)
        into leg
        from public.explorer_lookup_point(
          trim(dest.destination_city || case
            when coalesce(dest.destination_country, '') <> '' then ', ' || dest.destination_country
            else ''
          end)
        ) e
        limit 1;
      end if;
      if leg is not null then
        total := total + round(leg)::int;
      end if;
    end loop;
  end if;

  update public.profiles
  set explorer_score_miles = greatest(0, total)
  where id = p_user_id;

  return greatest(0, total);
end;
$$;

grant execute on function public.recompute_explorer_score(uuid) to authenticated;

-- Patch confirm_trip (preserve passport unlocks from 015) + recompute explorer scores
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

-- Patch unconfirm_trip to recompute scores (stamps stay; miles drop for planning trips)
create or replace function public.unconfirm_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t public.trips%rowtype;
  member record;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select * into t from public.trips where id = p_trip_id;
  if not found then raise exception 'Trip not found'; end if;
  if t.owner_id <> me then raise exception 'Only the host can unconfirm this trip'; end if;

  update public.trips
  set status = 'planning'
  where id = p_trip_id;

  for member in
    select user_id from public.trip_members where trip_id = p_trip_id
  loop
    perform public.recompute_explorer_score(member.user_id);
  end loop;
end;
$$;

-- Backfill existing profiles (best-effort)
do $$
declare
  r record;
begin
  for r in select id from public.profiles loop
    perform public.recompute_explorer_score(r.id);
  end loop;
end;
$$;
