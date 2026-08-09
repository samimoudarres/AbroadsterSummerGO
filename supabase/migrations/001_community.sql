-- Abroadster Community Chat schema
-- Run in Supabase SQL editor after creating a project.

create extension if not exists "pgcrypto";

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  full_name text not null,
  avatar_url text,
  home_university text not null,
  study_abroad_program text not null,
  home_accent text not null default '#9D9D9D',
  abroad_accent text not null default '#9B51E0',
  host_city text,
  host_country text,
  created_at timestamptz not null default now()
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('abroad', 'home')),
  accent text not null default '#9B51E0',
  logo_url text,
  created_at timestamptz not null default now(),
  unique (name, kind)
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  slug text not null check (slug in ('general', 'introductions', 'trips', 'roommates')),
  name text not null,
  created_at timestamptz not null default now(),
  unique (community_id, slug)
);

create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dm_participants (
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (thread_id, user_id)
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('upcoming', 'planning')),
  open_to_join boolean not null default true,
  destination_city text not null,
  destination_country text not null,
  date_label text,
  date_start date,
  date_end date,
  leaving_time text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  primary key (trip_id, user_id)
);

create table if not exists public.trip_join_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (trip_id, requester_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels(id) on delete cascade,
  dm_thread_id uuid references public.dm_threads(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('text', 'image', 'trip', 'poll', 'system')),
  body text,
  reply_to_id uuid references public.messages(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  poll_id uuid,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (channel_id is not null and dm_thread_id is null)
    or (channel_id is null and dm_thread_id is not null)
  )
);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.friendships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (from_user_id, to_user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

alter table public.messages
  drop constraint if exists messages_poll_id_fkey;
alter table public.messages
  add constraint messages_poll_id_fkey
  foreign key (poll_id) references public.polls(id) on delete set null;

-- Ensure communities + default channels for a school name
create or replace function public.ensure_community(
  p_name text,
  p_kind text,
  p_accent text default '#9B51E0'
) returns uuid
language plpgsql
security definer
as $$
declare
  cid uuid;
begin
  select id into cid from public.communities where name = p_name and kind = p_kind;
  if cid is null then
    insert into public.communities(name, kind, accent)
    values (p_name, p_kind, p_accent)
    returning id into cid;

    insert into public.channels(community_id, slug, name) values
      (cid, 'general', 'General'),
      (cid, 'introductions', 'Introductions'),
      (cid, 'trips', 'Trips'),
      (cid, 'roommates', 'Roommates');
  end if;
  return cid;
end;
$$;

-- On profile insert: join abroad + home communities and post system join messages
create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
as $$
declare
  abroad_id uuid;
  home_id uuid;
  ch uuid;
begin
  abroad_id := public.ensure_community(new.study_abroad_program, 'abroad', new.abroad_accent);
  home_id := public.ensure_community(new.home_university, 'home', new.home_accent);

  insert into public.community_members(community_id, user_id)
  values (abroad_id, new.id), (home_id, new.id)
  on conflict do nothing;

  for ch in
    select c.id from public.channels c
    where c.community_id in (abroad_id, home_id) and c.slug = 'general'
  loop
    insert into public.messages(channel_id, sender_id, kind, body)
    values (ch, new.id, 'system', new.first_name || ' has joined this chat');
  end loop;

  return new;
end;
$$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_profile();

-- Request to join trip: pending + notify every current member
create or replace function public.request_trip_join(p_trip_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  req_id uuid;
  requester uuid := auth.uid();
  member record;
  requester_name text;
begin
  if requester is null then
    raise exception 'Not authenticated';
  end if;

  select full_name into requester_name from public.profiles where id = requester;

  insert into public.trip_join_requests(trip_id, requester_id, status)
  values (p_trip_id, requester, 'pending')
  on conflict (trip_id, requester_id)
  do update set status = 'pending'
  returning id into req_id;

  for member in
    select user_id from public.trip_members where trip_id = p_trip_id
  loop
    insert into public.notifications(user_id, kind, title, body, data)
    values (
      member.user_id,
      'trip_join_request',
      'Trip join request',
      coalesce(requester_name, 'Someone') || ' requested to join your trip',
      jsonb_build_object('trip_id', p_trip_id, 'request_id', req_id, 'requester_id', requester)
    );
  end loop;

  return req_id;
end;
$$;

-- Friend add: create friendship both ways + notify
create or replace function public.add_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  me uuid := auth.uid();
  my_name text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if me = p_friend_id then raise exception 'Cannot friend yourself'; end if;

  select full_name into my_name from public.profiles where id = me;

  insert into public.friendships(user_id, friend_id) values (me, p_friend_id)
  on conflict do nothing;
  insert into public.friendships(user_id, friend_id) values (p_friend_id, me)
  on conflict do nothing;

  insert into public.notifications(user_id, kind, title, body, data)
  values (
    p_friend_id,
    'friend_added',
    'New friend',
    coalesce(my_name, 'Someone') || ' added you as a friend',
    jsonb_build_object('from_user_id', me)
  );
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.dm_threads enable row level security;
alter table public.dm_participants enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_join_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

create policy "profiles read" on public.profiles for select using (true);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);

create policy "community_members read own" on public.community_members
  for select using (user_id = auth.uid());

create policy "communities read members" on public.communities for select using (
  exists (
    select 1 from public.community_members m
    where m.community_id = id and m.user_id = auth.uid()
  )
);

create policy "channels read members" on public.channels for select using (
  exists (
    select 1 from public.community_members m
    where m.community_id = community_id and m.user_id = auth.uid()
  )
);

create policy "messages read channel members" on public.messages for select using (
  (channel_id is not null and exists (
    select 1 from public.channels c
    join public.community_members m on m.community_id = c.community_id
    where c.id = channel_id and m.user_id = auth.uid()
  ))
  or (dm_thread_id is not null and exists (
    select 1 from public.dm_participants p
    where p.thread_id = dm_thread_id and p.user_id = auth.uid()
  ))
);

create policy "messages insert" on public.messages for insert with check (
  sender_id = auth.uid() or kind = 'system'
);

create policy "reactions all members" on public.message_reactions for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "notifications own" on public.notifications for select using (auth.uid() = user_id);
create policy "friendships read" on public.friendships for select using (auth.uid() = user_id or auth.uid() = friend_id);

-- Realtime
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.trip_join_requests;
alter publication supabase_realtime add table public.notifications;

-- Storage bucket (create via dashboard if this fails)
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;
