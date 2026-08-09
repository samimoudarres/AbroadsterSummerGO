-- Abroadster one-shot fix: passport + avatars + school community sync
-- Safe to re-run. Paste ALL of this into Supabase SQL Editor and click Run.
-- Do NOT paste other migration files with this.

-- ── Profile columns (if missing) ─────────────────────────────────────────────
alter table public.profiles
  add column if not exists bio text,
  add column if not exists semester text,
  add column if not exists cities_visited integer not null default 0,
  add column if not exists countries_visited integer not null default 0,
  add column if not exists phone_number text,
  add column if not exists date_of_birth date,
  add column if not exists student_email text,
  add column if not exists is_verified_student boolean not null default false,
  add column if not exists login_email text;

-- ── Passport tables ──────────────────────────────────────────────────────────
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

-- ── Passport functions (this is what was missing) ────────────────────────────
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

  perform public.passport_apply_trip_unlock(
    p_user_id, null, trim(p.host_city), coalesce(trim(p.host_country), ''), null, null
  );

  update public.passport_city_ranks
  set source = 'host', trip_id = null
  where user_id = p_user_id
    and lower(city_name) = lower(trim(p.host_city))
    and source = 'trip'
    and trip_id is null;

  perform public.passport_refresh_profile_counts(p_user_id);
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

grant execute on function public.passport_country_key(text) to authenticated;
grant execute on function public.passport_refresh_profile_counts(uuid) to authenticated;
grant execute on function public.passport_apply_trip_unlock(uuid, uuid, text, text, double precision, double precision) to authenticated;
grant execute on function public.passport_ensure_host_city(uuid) to authenticated;
grant execute on function public.get_passport(uuid) to authenticated;
grant execute on function public.reorder_passport_cities(uuid[]) to authenticated;
grant execute on function public.add_passport_city(text, text, double precision, double precision) to authenticated;

-- ── Avatars storage bucket ───────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── Sync home/abroad communities to match profile schools ────────────────────
create or replace function public.sync_profile_communities(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := coalesce(p_user_id, auth.uid());
  p public.profiles%rowtype;
  abroad_id uuid;
  home_id uuid;
  abroad_name text;
  home_name text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if auth.uid() is not null and uid <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  select * into p from public.profiles where id = uid;
  if not found then return; end if;

  abroad_name := coalesce(nullif(trim(p.study_abroad_program), ''), 'Study Abroad');
  home_name := coalesce(nullif(trim(p.home_university), ''), 'Home University');

  abroad_id := public.ensure_community(
    abroad_name,
    'abroad',
    coalesce(nullif(trim(p.abroad_accent), ''), '#9B51E0')
  );
  home_id := public.ensure_community(
    home_name,
    'home',
    coalesce(nullif(trim(p.home_accent), ''), '#BF5700')
  );

  update public.communities
  set accent = coalesce(nullif(trim(p.abroad_accent), ''), accent)
  where id = abroad_id;
  update public.communities
  set accent = coalesce(nullif(trim(p.home_accent), ''), accent)
  where id = home_id;

  insert into public.community_members(community_id, user_id)
  values (abroad_id, uid), (home_id, uid)
  on conflict do nothing;

  delete from public.community_members cm
  using public.communities c
  where cm.community_id = c.id
    and cm.user_id = uid
    and c.kind in ('home', 'abroad')
    and cm.community_id not in (abroad_id, home_id);
end;
$$;

grant execute on function public.sync_profile_communities(uuid) to authenticated;

create or replace function public.handle_profile_schools_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.home_university is distinct from old.home_university
     or new.study_abroad_program is distinct from old.study_abroad_program
     or new.home_accent is distinct from old.home_accent
     or new.abroad_accent is distinct from old.abroad_accent then
    perform public.sync_profile_communities(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_schools_updated on public.profiles;
create trigger on_profile_schools_updated
  after update on public.profiles
  for each row execute function public.handle_profile_schools_updated();

create or replace function public.handle_profile_host_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(new.host_city), '') <> ''
     and (
       new.host_city is distinct from old.host_city
       or new.host_country is distinct from old.host_country
     ) then
    perform public.passport_ensure_host_city(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_host_updated on public.profiles;
create trigger on_profile_host_updated
  after update on public.profiles
  for each row execute function public.handle_profile_host_updated();
