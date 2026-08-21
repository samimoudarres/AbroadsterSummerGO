-- Privacy controls for advisor / student safety commitments:
-- 1) Upcoming trips visible only to members + mutual friends
-- 2) Non-members only see city + dates (no leaving time / description / invite token)
-- 3) Album photos can be members-only (photos_private)
-- 4) Location privacy setting on profiles (exact | city | hidden)
-- 5) Join requests require mutual friendship with a trip member
-- 6) Stronger account deletion (storage scrub + message body wipe)

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists location_privacy text not null default 'exact'
    check (location_privacy in ('exact', 'city', 'hidden'));

comment on column public.profiles.location_privacy is
  'exact = publish When-In-Use GPS; city = generic host-city pin only; hidden = no map pin.';

alter table public.trip_albums
  add column if not exists photos_private boolean not null default false;

comment on column public.trip_albums.photos_private is
  'When true, album photos are only readable by accepted trip members.';

-- ---------------------------------------------------------------------------
-- Mutual friends helper (both directions exist)
-- ---------------------------------------------------------------------------
create or replace function public.are_mutual_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null
    and b is not null
    and a <> b
    and exists (
      select 1 from public.friendships f
      where f.user_id = a and f.friend_id = b
    )
    and exists (
      select 1 from public.friendships f
      where f.user_id = b and f.friend_id = a
    );
$$;

create or replace function public.is_mutual_friend_of_any_member(p_viewer uuid, p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and public.are_mutual_friends(p_viewer, tm.user_id)
  );
$$;

create or replace function public.is_trip_member(p_user uuid, p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id and tm.user_id = p_user
  );
$$;

create or replace function public.trip_is_past(p_trip public.trips)
returns boolean
language sql
stable
as $$
  select coalesce(p_trip.date_end, p_trip.date_start) is not null
    and coalesce(p_trip.date_end, p_trip.date_start) < current_date;
$$;

-- ---------------------------------------------------------------------------
-- Album photo RLS: public unless photos_private
-- ---------------------------------------------------------------------------
drop policy if exists "album_photos read" on public.album_photos;
create policy "album_photos read" on public.album_photos
  for select using (
    exists (
      select 1
      from public.trip_albums a
      where a.id = album_id
        and (
          not coalesce(a.photos_private, false)
          or public.is_trip_member(auth.uid(), a.trip_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Toggle album photo privacy (members; typically host)
-- ---------------------------------------------------------------------------
create or replace function public.set_album_photos_private(
  p_trip_id uuid,
  p_private boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not public.is_trip_member(me, p_trip_id) then
    raise exception 'Only trip members can change album privacy';
  end if;

  perform public.ensure_trip_album(p_trip_id);

  update public.trip_albums
  set photos_private = coalesce(p_private, false)
  where trip_id = p_trip_id;
end;
$$;

grant execute on function public.set_album_photos_private(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- list_trips_feed: friends-only upcoming + redact logistics for non-members
-- ---------------------------------------------------------------------------
create or replace function public.list_trips_feed(p_mine_only boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  result jsonb := '[]'::jsonb;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(
    jsonb_agg(row_data order by created_at desc),
    '[]'::jsonb
  )
  into result
  from (
    select
      t.created_at,
      jsonb_build_object(
        'id', t.id,
        'owner_id', t.owner_id,
        'status', t.status,
        'open_to_join', t.open_to_join,
        'destination_city', t.destination_city,
        'destination_country', t.destination_country,
        'date_label', t.date_label,
        'date_start', t.date_start,
        'date_end', t.date_end,
        'leaving_time', case
          when public.is_trip_member(me, t.id) then t.leaving_time
          else null
        end,
        'description', case
          when public.is_trip_member(me, t.id) then t.description
          else null
        end,
        'max_members', t.max_members,
        'invite_token', case
          when public.is_trip_member(me, t.id) then t.invite_token
          else null
        end,
        'latitude', case
          when public.is_trip_member(me, t.id) then t.latitude
          else null
        end,
        'longitude', case
          when public.is_trip_member(me, t.id) then t.longitude
          else null
        end,
        'member_ids', coalesce((
          select jsonb_agg(tm.user_id)
          from public.trip_members tm
          where tm.trip_id = t.id
        ), '[]'::jsonb),
        'my_join_status', (
          select r.status
          from public.trip_join_requests r
          where r.trip_id = t.id and r.requester_id = me
          limit 1
        ),
        'album_id', al.id,
        'photos_private', coalesce(al.photos_private, false),
        'is_following_album', exists (
          select 1 from public.album_followers af
          where af.album_id = al.id and af.user_id = me
        ),
        'album_preview_urls', case
          when al.id is null then '[]'::jsonb
          when coalesce(al.photos_private, false)
               and not public.is_trip_member(me, t.id)
            then '[]'::jsonb
          else coalesce((
            select jsonb_agg(p.image_url order by p.created_at desc)
            from (
              select ap.image_url, ap.created_at
              from public.album_photos ap
              where ap.album_id = al.id
              order by ap.created_at desc
              limit 3
            ) p
          ), '[]'::jsonb)
        end,
        'channel_id', case
          when public.is_trip_member(me, t.id) then (
            select c.id
            from public.channels c
            where c.trip_id = t.id and c.slug = 'trip'
            limit 1
          )
          else null
        end,
        'pending_invitee_ids', case
          when public.is_trip_member(me, t.id) then coalesce((
            select jsonb_agg(i.invitee_id)
            from public.trip_invites i
            where i.trip_id = t.id and i.status = 'pending'
          ), '[]'::jsonb)
          else '[]'::jsonb
        end
      ) as row_data
    from public.trips t
    left join public.trip_albums al on al.trip_id = t.id
    where (
      -- Mine-only mode: membership only
      (
        p_mine_only
        and public.is_trip_member(me, t.id)
      )
      or (
        not p_mine_only
        and (
          public.is_trip_member(me, t.id)
          or public.trip_is_past(t)
          or public.is_mutual_friend_of_any_member(me, t.id)
        )
      )
    )
  ) feed;

  return result;
end;
$$;

grant execute on function public.list_trips_feed(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Join requests: mutual friends with a member (invite link path stays separate)
-- ---------------------------------------------------------------------------
create or replace function public.request_trip_join(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  req_id uuid;
  requester uuid := auth.uid();
  member record;
  requester_name text;
  t public.trips%rowtype;
  member_count int;
begin
  if requester is null then raise exception 'Not authenticated'; end if;

  select * into t from public.trips where id = p_trip_id;
  if t.id is null then raise exception 'Trip not found'; end if;
  if not t.open_to_join then raise exception 'This trip is private'; end if;

  if public.trip_is_past(t) then
    raise exception 'This trip has already ended';
  end if;

  if not public.is_mutual_friend_of_any_member(requester, p_trip_id) then
    raise exception 'You can only request to join upcoming trips with friends';
  end if;

  member_count := public.trip_member_count(p_trip_id);
  if t.max_members is not null and member_count >= t.max_members then
    raise exception 'Trip is full';
  end if;

  if exists (
    select 1 from public.trip_members where trip_id = p_trip_id and user_id = requester
  ) then
    raise exception 'Already a member';
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
      jsonb_build_object(
        'trip_id', p_trip_id,
        'request_id', req_id,
        'requester_id', requester
      )
    );
  end loop;

  return req_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile albums: hide upcoming from non-friends; hide private photo covers
-- ---------------------------------------------------------------------------
drop function if exists public.list_author_albums(uuid, int);

create or replace function public.list_author_albums(p_user_id uuid, p_limit int default 40)
returns table (
  album_id uuid,
  trip_id uuid,
  destination_city text,
  destination_country text,
  date_start date,
  date_end date,
  date_label text,
  owner_id uuid,
  member_ids uuid[],
  cover_urls text[],
  is_following boolean,
  photos_private boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  return query
  select
    a.id as album_id,
    t.id as trip_id,
    t.destination_city,
    t.destination_country,
    t.date_start,
    t.date_end,
    t.date_label,
    t.owner_id,
    coalesce(
      (select array_agg(m.user_id) from public.trip_members m where m.trip_id = t.id),
      '{}'::uuid[]
    ) as member_ids,
    case
      when coalesce(a.photos_private, false)
           and not public.is_trip_member(me, t.id)
        then '{}'::text[]
      else coalesce(
        (
          select array_agg(p.image_url order by p.created_at desc)
          from (
            select ap.image_url, ap.created_at
            from public.album_photos ap
            where ap.album_id = a.id
            order by ap.created_at desc
            limit 3
          ) p
        ),
        '{}'::text[]
      )
    end as cover_urls,
    exists (
      select 1 from public.album_followers af
      where af.album_id = a.id and af.user_id = me
    ) as is_following,
    coalesce(a.photos_private, false) as photos_private
  from public.trip_albums a
  join public.trips t on t.id = a.trip_id
  join public.trip_members tm on tm.trip_id = t.id and tm.user_id = p_user_id
  where
    -- Past trips: visible on profile
    public.trip_is_past(t)
    -- Or viewer is on the trip
    or public.is_trip_member(me, t.id)
    -- Or mutual friends with the profile owner (upcoming albums)
    or public.are_mutual_friends(me, p_user_id)
    -- Or viewing own profile
    or me = p_user_id
  order by coalesce(t.date_start, t.created_at) desc nulls last
  limit greatest(1, least(coalesce(p_limit, 40), 80));
end;
$$;

grant execute on function public.list_author_albums(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Clear live GPS when privacy is not exact
-- ---------------------------------------------------------------------------
create or replace function public.set_my_location_privacy(p_privacy text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  next_privacy text := lower(trim(coalesce(p_privacy, 'exact')));
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if next_privacy not in ('exact', 'city', 'hidden') then
    raise exception 'Invalid location privacy';
  end if;

  update public.profiles
  set
    location_privacy = next_privacy,
    live_latitude = case when next_privacy = 'exact' then live_latitude else null end,
    live_longitude = case when next_privacy = 'exact' then live_longitude else null end,
    live_location_label = case when next_privacy = 'exact' then live_location_label else null end,
    live_location_at = case when next_privacy = 'exact' then live_location_at else null end
  where id = me;

  return next_privacy;
end;
$$;

grant execute on function public.set_my_location_privacy(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Stronger account deletion
-- ---------------------------------------------------------------------------
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  obj record;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Scrub message bodies attributed to this user (rows may remain anonymized)
  update public.messages
  set body = null,
      image_url = null,
      metadata = '{}'::jsonb
  where sender_id = uid;

  -- Best-effort storage cleanup (avatars + album uploads under user folder)
  begin
    for obj in
      select name from storage.objects
      where bucket_id in ('avatars', 'album-photos', 'album_photos')
        and (name like uid::text || '/%' or name like '%/' || uid::text || '/%')
    loop
      delete from storage.objects
      where bucket_id in ('avatars', 'album-photos', 'album_photos')
        and name = obj.name;
    end loop;
  exception
    when others then
      -- Storage scrub is best-effort; continue deleting account
      null;
  end;

  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
