-- Passport: country unlocks + city ranking.
-- Run after 012 (profile fields) + 006 (confirm_trip).

create table if not exists public.passport_country_unlocks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  country_key text not null,
  country_name text not null,
  unlocked_at timestamptz not null default now(),
  source_trip_id uuid references public.trips(id) on delete set null,
  primary key (user_id, country_key)
);

create index if not exists passport_unlocks_user_idx
  on public.passport_country_unlocks (user_id, unlocked_at desc);

create table if not exists public.passport_city_ranks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  city_name text not null,
  country_name text not null default '',
  sort_order int not null default 0,
  source text not null check (source in ('host', 'trip', 'manual')),
  trip_id uuid references public.trips(id) on delete set null,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  unique (user_id, city_name, country_name)
);

create index if not exists passport_cities_user_idx
  on public.passport_city_ranks (user_id, sort_order);

alter table public.passport_country_unlocks enable row level security;
alter table public.passport_city_ranks enable row level security;

drop policy if exists "passport unlocks read" on public.passport_country_unlocks;
create policy "passport unlocks read" on public.passport_country_unlocks
  for select using (true);

drop policy if exists "passport unlocks write own" on public.passport_country_unlocks;
create policy "passport unlocks write own" on public.passport_country_unlocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "passport cities read" on public.passport_city_ranks;
create policy "passport cities read" on public.passport_city_ranks
  for select using (true);

drop policy if exists "passport cities write own" on public.passport_city_ranks;
create policy "passport cities write own" on public.passport_city_ranks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Normalize common country aliases → stable key (Europe + Morocco subset).
create or replace function public.passport_country_key(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  n text := lower(trim(coalesce(p_name, '')));
begin
  if n = '' then return null; end if;
  if n in ('uk', 'u.k.', 'united kingdom', 'britain', 'england', 'scotland', 'wales',
           'united kingdom of great britain and northern ireland') then
    return 'gb';
  end if;
  if n in ('czechia', 'czech republic') then return 'cz'; end if;
  if n in ('holland', 'the netherlands', 'netherlands') then return 'nl'; end if;
  if n in ('macedonia', 'north macedonia', 'republic of north macedonia') then return 'mk'; end if;
  if n in ('bosnia', 'bosnia-herzegovina', 'bosnia and herzegovina') then return 'ba'; end if;
  if n in ('vatican', 'vatican city', 'holy see') then return 'va'; end if;
  if n = 'albania' then return 'al'; end if;
  if n = 'andorra' then return 'ad'; end if;
  if n = 'austria' then return 'at'; end if;
  if n = 'belarus' then return 'by'; end if;
  if n = 'belgium' then return 'be'; end if;
  if n = 'bulgaria' then return 'bg'; end if;
  if n = 'croatia' then return 'hr'; end if;
  if n = 'cyprus' then return 'cy'; end if;
  if n = 'denmark' then return 'dk'; end if;
  if n = 'estonia' then return 'ee'; end if;
  if n = 'finland' then return 'fi'; end if;
  if n = 'france' then return 'fr'; end if;
  if n = 'germany' then return 'de'; end if;
  if n = 'greece' then return 'gr'; end if;
  if n = 'hungary' then return 'hu'; end if;
  if n = 'iceland' then return 'is'; end if;
  if n = 'ireland' then return 'ie'; end if;
  if n = 'italy' then return 'it'; end if;
  if n = 'kosovo' then return 'xk'; end if;
  if n = 'latvia' then return 'lv'; end if;
  if n = 'liechtenstein' then return 'li'; end if;
  if n = 'lithuania' then return 'lt'; end if;
  if n = 'luxembourg' then return 'lu'; end if;
  if n = 'malta' then return 'mt'; end if;
  if n = 'moldova' then return 'md'; end if;
  if n = 'monaco' then return 'mc'; end if;
  if n = 'montenegro' then return 'me'; end if;
  if n = 'morocco' then return 'ma'; end if;
  if n = 'norway' then return 'no'; end if;
  if n = 'poland' then return 'pl'; end if;
  if n = 'portugal' then return 'pt'; end if;
  if n = 'romania' then return 'ro'; end if;
  if n = 'san marino' then return 'sm'; end if;
  if n = 'serbia' then return 'rs'; end if;
  if n = 'slovakia' then return 'sk'; end if;
  if n = 'slovenia' then return 'si'; end if;
  if n = 'spain' then return 'es'; end if;
  if n = 'sweden' then return 'se'; end if;
  if n = 'switzerland' then return 'ch'; end if;
  if n = 'ukraine' then return 'ua'; end if;
  return null;
end;
$$;

create or replace function public.passport_refresh_profile_counts(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    countries_visited = (
      select count(*)::int from public.passport_country_unlocks where user_id = p_user_id
    ),
    cities_visited = (
      select count(*)::int from public.passport_city_ranks where user_id = p_user_id
    )
  where id = p_user_id;
end;
$$;

create or replace function public.passport_apply_trip_unlock(
  p_user_id uuid,
  p_trip_id uuid,
  p_city text,
  p_country text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ckey text := public.passport_country_key(p_country);
  cname text := trim(coalesce(p_country, ''));
  city text := trim(coalesce(p_city, ''));
begin
  if p_user_id is null or city = '' then return; end if;

  if ckey is not null then
    insert into public.passport_country_unlocks(
      user_id, country_key, country_name, unlocked_at, source_trip_id
    )
    values (p_user_id, ckey, cname, now(), p_trip_id)
    on conflict (user_id, country_key) do nothing;
  end if;

  if not exists (
    select 1 from public.passport_city_ranks
    where user_id = p_user_id
      and lower(city_name) = lower(city)
      and lower(country_name) = lower(cname)
  ) then
    update public.passport_city_ranks
    set sort_order = sort_order + 1
    where user_id = p_user_id;

    insert into public.passport_city_ranks(
      user_id, city_name, country_name, sort_order, source, trip_id, latitude, longitude
    )
    values (p_user_id, city, cname, 0, 'trip', p_trip_id, p_lat, p_lng);
  else
    update public.passport_city_ranks
    set trip_id = coalesce(p_trip_id, trip_id),
        latitude = coalesce(p_lat, latitude),
        longitude = coalesce(p_lng, longitude)
    where user_id = p_user_id
      and lower(city_name) = lower(city)
      and lower(country_name) = lower(cname);
  end if;

  perform public.passport_refresh_profile_counts(p_user_id);
end;
$$;

create or replace function public.passport_ensure_host_city(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
begin
  select * into p from public.profiles where id = p_user_id;
  if not found then return; end if;
  if coalesce(trim(p.host_city), '') = '' then return; end if;

  if not exists (
    select 1 from public.passport_city_ranks
    where user_id = p_user_id
      and lower(city_name) = lower(p.host_city)
      and source = 'host'
  ) and not exists (
    select 1 from public.passport_city_ranks
    where user_id = p_user_id
      and lower(city_name) = lower(p.host_city)
  ) then
    update public.passport_city_ranks
    set sort_order = sort_order + 1
    where user_id = p_user_id;

    insert into public.passport_city_ranks(
      user_id, city_name, country_name, sort_order, source
    )
    values (
      p_user_id,
      trim(p.host_city),
      coalesce(trim(p.host_country), ''),
      0,
      'host'
    );
  end if;

  -- Unlock host country stamp if in catalog
  perform public.passport_apply_trip_unlock(
    p_user_id, null, trim(p.host_city), coalesce(trim(p.host_country), ''), null, null
  );
  -- Fix source back to host if we just inserted as trip
  update public.passport_city_ranks
  set source = 'host', trip_id = null
  where user_id = p_user_id
    and lower(city_name) = lower(trim(p.host_city))
    and source = 'trip'
    and trip_id is null;

  perform public.passport_refresh_profile_counts(p_user_id);
end;
$$;

-- Patch confirm_trip to unlock passport for all members
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
    -- still apply passport in case first confirm missed
    for member in
      select user_id from public.trip_members where trip_id = p_trip_id
    loop
      perform public.passport_apply_trip_unlock(
        member.user_id, p_trip_id, t.destination_city, t.destination_country,
        t.latitude, t.longitude
      );
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
  end loop;
end;
$$;

create or replace function public.get_passport(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  unlocks jsonb;
  cities jsonb;
begin
  perform public.passport_ensure_host_city(p_user_id);

  select coalesce(jsonb_agg(to_jsonb(u) order by u.unlocked_at desc), '[]'::jsonb)
  into unlocks
  from public.passport_country_unlocks u
  where u.user_id = p_user_id;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order asc, c.created_at asc), '[]'::jsonb)
  into cities
  from public.passport_city_ranks c
  where c.user_id = p_user_id;

  return jsonb_build_object('unlocks', unlocks, 'cities', cities);
end;
$$;

create or replace function public.reorder_passport_cities(p_city_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  i int;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_city_ids is null then return; end if;

  for i in 1 .. coalesce(array_length(p_city_ids, 1), 0) loop
    update public.passport_city_ranks
    set sort_order = i - 1
    where id = p_city_ids[i] and user_id = me;
  end loop;

  perform public.passport_refresh_profile_counts(me);
end;
$$;

create or replace function public.add_passport_city(
  p_city text,
  p_country text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  city text := trim(coalesce(p_city, ''));
  cname text := trim(coalesce(p_country, ''));
  ckey text := public.passport_country_key(p_country);
  row public.passport_city_ranks%rowtype;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if city = '' then raise exception 'City required'; end if;

  if exists (
    select 1 from public.passport_city_ranks
    where user_id = me
      and lower(city_name) = lower(city)
      and lower(country_name) = lower(cname)
  ) then
    select * into row from public.passport_city_ranks
    where user_id = me
      and lower(city_name) = lower(city)
      and lower(country_name) = lower(cname);
    return to_jsonb(row);
  end if;

  update public.passport_city_ranks
  set sort_order = sort_order + 1
  where user_id = me;

  insert into public.passport_city_ranks(
    user_id, city_name, country_name, sort_order, source, latitude, longitude
  )
  values (me, city, cname, 0, 'manual', p_lat, p_lng)
  returning * into row;

  if ckey is not null then
    insert into public.passport_country_unlocks(
      user_id, country_key, country_name, unlocked_at, source_trip_id
    )
    values (me, ckey, cname, now(), null)
    on conflict (user_id, country_key) do nothing;
  end if;

  perform public.passport_refresh_profile_counts(me);
  return to_jsonb(row);
end;
$$;
