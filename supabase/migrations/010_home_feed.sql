-- Home feed: posts, photos, stamps, share-to-chat, notification helpers
-- Run in Supabase SQL editor after prior migrations.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null default '',
  location_label text not null,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  check (char_length(trim(location_label)) > 0)
);

create table if not exists public.post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_photos_post_idx on public.post_photos (post_id, sort_order);

create table if not exists public.post_stamps (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists posts_created_idx on public.posts (created_at desc);

alter table public.posts enable row level security;
alter table public.post_photos enable row level security;
alter table public.post_stamps enable row level security;

drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts for select using (true);

drop policy if exists "posts insert own" on public.posts;
create policy "posts insert own" on public.posts
  for insert with check (auth.uid() = author_id);

drop policy if exists "posts update own" on public.posts;
create policy "posts update own" on public.posts
  for update using (auth.uid() = author_id);

drop policy if exists "posts delete own" on public.posts;
create policy "posts delete own" on public.posts
  for delete using (auth.uid() = author_id);

drop policy if exists "post_photos read" on public.post_photos;
create policy "post_photos read" on public.post_photos for select using (true);

drop policy if exists "post_photos insert author" on public.post_photos;
create policy "post_photos insert author" on public.post_photos
  for insert with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

drop policy if exists "post_photos delete author" on public.post_photos;
create policy "post_photos delete author" on public.post_photos
  for delete using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

drop policy if exists "post_stamps read" on public.post_stamps;
create policy "post_stamps read" on public.post_stamps for select using (true);

drop policy if exists "post_stamps insert own" on public.post_stamps;
create policy "post_stamps insert own" on public.post_stamps
  for insert with check (auth.uid() = user_id);

drop policy if exists "post_stamps delete own" on public.post_stamps;
create policy "post_stamps delete own" on public.post_stamps
  for delete using (auth.uid() = user_id);

-- Messages: allow kind=post + post_id
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check
  check (kind in ('text', 'image', 'trip', 'poll', 'system', 'post'));

alter table public.messages
  add column if not exists post_id uuid references public.posts(id) on delete set null;

-- ---------------------------------------------------------------------------
-- toggle_post_stamp
-- ---------------------------------------------------------------------------
create or replace function public.toggle_post_stamp(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  stamped boolean;
  cnt int;
  author uuid;
  my_name text;
  loc text;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select author_id, location_label into author, loc from public.posts where id = p_post_id;
  if author is null then raise exception 'Post not found'; end if;

  if exists (select 1 from public.post_stamps where post_id = p_post_id and user_id = me) then
    delete from public.post_stamps where post_id = p_post_id and user_id = me;
    stamped := false;
  else
    insert into public.post_stamps(post_id, user_id) values (p_post_id, me);
    stamped := true;
    if author <> me then
      select full_name into my_name from public.profiles where id = me;
      insert into public.notifications(user_id, kind, title, body, data)
      values (
        author,
        'post_stamped',
        'New stamp',
        coalesce(my_name, 'Someone') || ' stamped your post' ||
          case when loc is not null then ' from ' || loc else '' end,
        jsonb_build_object('post_id', p_post_id, 'from_user_id', me)
      );
    end if;
  end if;

  select count(*)::int into cnt from public.post_stamps where post_id = p_post_id;
  return jsonb_build_object('stamped', stamped, 'stamp_count', cnt);
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_notifications_read
-- ---------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_ids is null then
    update public.notifications
    set read_at = now()
    where user_id = me and read_at is null;
  else
    update public.notifications
    set read_at = now()
    where user_id = me and id = any (p_ids);
  end if;
end;
$$;

create or replace function public.unread_notification_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.notifications
  where user_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- list_home_feed (scored)
-- ---------------------------------------------------------------------------
create or replace function public.list_home_feed(p_limit int default 30, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_home text;
  my_abroad text;
  result jsonb;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select home_university, study_abroad_program into my_home, my_abroad
  from public.profiles where id = me;

  select coalesce(jsonb_agg(row_data order by score desc, created_at desc), '[]'::jsonb)
  into result
  from (
    select
      jsonb_build_object(
        'id', p.id,
        'author_id', p.author_id,
        'caption', p.caption,
        'location_label', p.location_label,
        'latitude', p.latitude,
        'longitude', p.longitude,
        'created_at', p.created_at,
        'stamp_count', coalesce(sc.cnt, 0),
        'i_stamped', exists (
          select 1 from public.post_stamps s where s.post_id = p.id and s.user_id = me
        ),
        'photo_urls', coalesce((
          select jsonb_agg(pp.image_url order by pp.sort_order)
          from public.post_photos pp where pp.post_id = p.id
        ), '[]'::jsonb),
        'stamper_preview_ids', coalesce((
          select jsonb_agg(x.user_id)
          from (
            select s.user_id from public.post_stamps s
            where s.post_id = p.id
            order by s.created_at desc
            limit 3
          ) x
        ), '[]'::jsonb)
      ) as row_data,
      p.created_at,
      (
        case when exists (
          select 1 from public.friendships f
          where f.user_id = me and f.friend_id = p.author_id
        ) then 1000 else 0 end
        + case when a.study_abroad_program = my_abroad then 400 else 0 end
        + case when a.home_university = my_home then 200 else 0 end
        + case when exists (
          select 1 from public.friendships f1
          join public.friendships f2 on f1.friend_id = f2.friend_id
          where f1.user_id = me and f2.user_id = p.author_id
            and f1.friend_id <> me and f1.friend_id <> p.author_id
        ) then 150 else 0 end
        + coalesce(sc.cnt, 0) * 5
        + greatest(0, 200 - extract(epoch from (now() - p.created_at)) / 3600.0)
      ) as score
    from public.posts p
    join public.profiles a on a.id = p.author_id
    left join lateral (
      select count(*)::int as cnt from public.post_stamps s where s.post_id = p.id
    ) sc on true
    order by score desc, p.created_at desc
    limit greatest(1, coalesce(p_limit, 30))
    offset greatest(0, coalesce(p_offset, 0))
  ) ranked;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_feed_albums
-- ---------------------------------------------------------------------------
create or replace function public.list_feed_albums(p_limit int default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_home text;
  my_abroad text;
  result jsonb;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select home_university, study_abroad_program into my_home, my_abroad
  from public.profiles where id = me;

  select coalesce(jsonb_agg(row_data order by score desc), '[]'::jsonb)
  into result
  from (
    select
      jsonb_build_object(
        'album_id', al.id,
        'trip_id', t.id,
        'destination_city', t.destination_city,
        'destination_country', t.destination_country,
        'date_start', t.date_start,
        'date_end', t.date_end,
        'date_label', t.date_label,
        'owner_id', t.owner_id,
        'member_ids', coalesce((
          select jsonb_agg(tm.user_id)
          from public.trip_members tm where tm.trip_id = t.id
        ), '[]'::jsonb),
        'cover_urls', coalesce((
          select jsonb_agg(x.image_url)
          from (
            select ap.image_url from public.album_photos ap
            where ap.album_id = al.id
            order by ap.created_at desc
            limit 3
          ) x
        ), '[]'::jsonb),
        'is_following', exists (
          select 1 from public.album_followers af
          where af.album_id = al.id and af.user_id = me
        )
      ) as row_data,
      (
        case when exists (
          select 1 from public.album_followers af
          where af.album_id = al.id and af.user_id = me
        ) then 800 else 0 end
        + case when exists (
          select 1 from public.friendships f
          where f.user_id = me and f.friend_id = t.owner_id
        ) then 500 else 0 end
        + case when exists (
          select 1 from public.trip_members tm
          join public.friendships f on f.friend_id = tm.user_id
          where tm.trip_id = t.id and f.user_id = me
        ) then 400 else 0 end
        + case when exists (
          select 1 from public.profiles op
          where op.id = t.owner_id and op.study_abroad_program = my_abroad
        ) then 200 else 0 end
        + case when exists (
          select 1 from public.profiles op
          where op.id = t.owner_id and op.home_university = my_home
        ) then 100 else 0 end
      ) as score
    from public.trip_albums al
    join public.trips t on t.id = al.trip_id
    where t.status = 'upcoming'
    order by score desc
    limit greatest(1, coalesce(p_limit, 12))
  ) ranked;

  return result;
end;
$$;
