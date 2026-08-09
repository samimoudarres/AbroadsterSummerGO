-- Trip albums, photos, followers + follow RPC (for Trips feed + future Home feed)

create table if not exists public.trip_albums (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null unique references public.trips(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.album_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.trip_albums(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists album_photos_album_created_idx
  on public.album_photos (album_id, created_at desc);

create table if not exists public.album_followers (
  album_id uuid not null references public.trip_albums(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (album_id, user_id)
);

alter table public.trip_albums enable row level security;
alter table public.album_photos enable row level security;
alter table public.album_followers enable row level security;

drop policy if exists "trip_albums read" on public.trip_albums;
create policy "trip_albums read" on public.trip_albums for select using (true);

drop policy if exists "album_photos read" on public.album_photos;
create policy "album_photos read" on public.album_photos for select using (true);

drop policy if exists "album_photos insert members" on public.album_photos;
create policy "album_photos insert members" on public.album_photos
  for insert with check (
    auth.uid() = uploader_id
    and exists (
      select 1 from public.trip_albums a
      join public.trip_members m on m.trip_id = a.trip_id
      where a.id = album_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "album_followers read own" on public.album_followers;
create policy "album_followers read own" on public.album_followers
  for select using (auth.uid() = user_id or true);

drop policy if exists "album_followers insert own" on public.album_followers;
create policy "album_followers insert own" on public.album_followers
  for insert with check (auth.uid() = user_id);

drop policy if exists "album_followers delete own" on public.album_followers;
create policy "album_followers delete own" on public.album_followers
  for delete using (auth.uid() = user_id);

-- Auto-create album when a trip becomes upcoming (confirmed)
create or replace function public.ensure_trip_album(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  aid uuid;
begin
  select id into aid from public.trip_albums where trip_id = p_trip_id;
  if aid is null then
    insert into public.trip_albums(trip_id) values (p_trip_id) returning id into aid;
  end if;
  return aid;
end;
$$;

create or replace function public.trips_ensure_album_on_upcoming()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'upcoming' then
    perform public.ensure_trip_album(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_trip_upcoming_album on public.trips;
create trigger on_trip_upcoming_album
  after insert or update of status on public.trips
  for each row execute function public.trips_ensure_album_on_upcoming();

-- Backfill albums for existing upcoming trips
insert into public.trip_albums (trip_id)
select id from public.trips where status = 'upcoming'
on conflict (trip_id) do nothing;

-- Follow album: record follower + notify every trip member (for in-app + client push)
create or replace function public.follow_trip_album(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  aid uuid;
  member record;
  follower_name text;
  dest text;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  aid := public.ensure_trip_album(p_trip_id);

  insert into public.album_followers(album_id, user_id)
  values (aid, me)
  on conflict do nothing;

  select full_name into follower_name from public.profiles where id = me;
  select destination_city || ', ' || destination_country into dest
  from public.trips where id = p_trip_id;

  for member in
    select user_id from public.trip_members where trip_id = p_trip_id and user_id <> me
  loop
    insert into public.notifications(user_id, kind, title, body, data)
    values (
      member.user_id,
      'album_followed',
      'Album follow',
      coalesce(follower_name, 'Someone') || ' followed your ' || coalesce(dest, 'trip') || ' album',
      jsonb_build_object(
        'trip_id', p_trip_id,
        'album_id', aid,
        'follower_id', me
      )
    );
  end loop;

  return aid;
end;
$$;

-- Allow reading friendships for trips feed friend filtering
drop policy if exists "friendships read" on public.friendships;
create policy "friendships read" on public.friendships
  for select using (auth.uid() = user_id or auth.uid() = friend_id);

-- Community members readable so school filters / member lists work for peers
drop policy if exists "community_members read peers" on public.community_members;
create policy "community_members read peers" on public.community_members
  for select using (
    exists (
      select 1 from public.community_members mine
      where mine.user_id = auth.uid()
        and mine.community_id = community_members.community_id
    )
  );

-- Realtime (safe if already added)
do $$
begin
  begin
    alter publication supabase_realtime add table public.album_followers;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.album_photos;
  exception when duplicate_object then null;
  end;
end $$;
