-- Search, suggested accounts (newest first), notification inbox vs push,
-- friends-only trip_created, profile albums for one-way friends.
-- Does NOT send any notifications to users.

-- ---------------------------------------------------------------------------
-- search_users: find every profile by name (tokenized, high limit)
-- ---------------------------------------------------------------------------
create or replace function public.search_users(p_query text, p_limit int default 80)
returns setof public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  q text := lower(trim(coalesce(p_query, '')));
  lim int := greatest(1, least(coalesce(p_limit, 80), 120));
  tokens text[];
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if length(q) < 1 then
    return;
  end if;

  tokens := array(
    select t
    from unnest(regexp_split_to_array(q, '[[:space:]]+')) as t
    where length(t) > 0
  );
  if coalesce(array_length(tokens, 1), 0) < 1 then
    return;
  end if;

  return query
  select p.*
  from public.profiles p
  where p.id <> me
    and p.id not in (
      select blocked_id from public.user_blocks where blocker_id = me
      union
      select blocker_id from public.user_blocks where blocked_id = me
    )
    and (
      -- Full query against name fields
      lower(coalesce(p.full_name, '')) like '%' || q || '%'
      or lower(coalesce(p.first_name, '')) like '%' || q || '%'
      or lower(coalesce(p.last_name, '')) like '%' || q || '%'
      or lower(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')))
           like '%' || q || '%'
      -- Every token must match somewhere in the name (order-independent)
      or (
        select bool_and(
          lower(coalesce(p.full_name, '')) like '%' || tok || '%'
          or lower(coalesce(p.first_name, '')) like '%' || tok || '%'
          or lower(coalesce(p.last_name, '')) like '%' || tok || '%'
        )
        from unnest(tokens) as tok
      )
    )
  order by
    case
      when lower(coalesce(p.full_name, '')) = q then 0
      when lower(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))) = q then 0
      when lower(coalesce(p.full_name, '')) like q || '%' then 1
      when lower(coalesce(p.first_name, '')) = q then 2
      else 3
    end,
    p.full_name asc nulls last
  limit lim;
end;
$$;

grant execute on function public.search_users(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- suggest_accounts: newest non-friend first, then existing scoring
-- ---------------------------------------------------------------------------
drop function if exists public.suggest_accounts(int);

create or replace function public.suggest_accounts(p_limit int default 40)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  full_name text,
  avatar_url text,
  home_university text,
  study_abroad_program text,
  host_city text,
  host_country text,
  score int,
  shared_friends int,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_home text;
  my_abroad text;
  my_host text;
  newest_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_limit is null or p_limit < 1 then p_limit := 40; end if;
  if p_limit > 100 then p_limit := 100; end if;

  select pr.home_university, pr.study_abroad_program, pr.host_city
    into my_home, my_abroad, my_host
  from public.profiles pr
  where pr.id = me;

  -- Most recently created non-friend (not blocked)
  select p.id into newest_id
  from public.profiles p
  where p.id <> me
    and p.id not in (select f.friend_id from public.friendships f where f.user_id = me)
    and p.id not in (
      select blocked_id from public.user_blocks where blocker_id = me
      union
      select blocker_id from public.user_blocks where blocked_id = me
    )
  order by p.created_at desc nulls last
  limit 1;

  return query
  with my_friends as (
    select f.friend_id as id from public.friendships f where f.user_id = me
  ),
  my_cities as (
    select lower(trim(c.city_name)) as city
    from public.passport_city_ranks c
    where c.user_id = me and c.city_name is not null
  ),
  my_communities as (
    select cm.community_id
    from public.community_members cm
    where cm.user_id = me
  ),
  candidates as (
    select
      p.id as cand_id,
      p.first_name as cand_first,
      p.last_name as cand_last,
      p.full_name as cand_full,
      p.avatar_url as cand_avatar,
      p.home_university as cand_home,
      p.study_abroad_program as cand_abroad,
      p.host_city as cand_host_city,
      p.host_country as cand_host_country,
      p.created_at as cand_created,
      (
        case when newest_id is not null and p.id = newest_id then 100000 else 0 end
        +
        case when my_home is not null and length(trim(my_home)) > 0
          and length(trim(coalesce(p.home_university, ''))) > 0
          and (
            lower(trim(p.home_university)) = lower(trim(my_home))
            or lower(trim(p.home_university)) like '%' || lower(trim(my_home)) || '%'
            or lower(trim(my_home)) like '%' || lower(trim(p.home_university)) || '%'
          ) then 100 else 0 end
        +
        case when my_abroad is not null and length(trim(my_abroad)) > 0
          and length(trim(coalesce(p.study_abroad_program, ''))) > 0
          and (
            lower(trim(p.study_abroad_program)) = lower(trim(my_abroad))
            or lower(trim(p.study_abroad_program)) like '%' || lower(trim(my_abroad)) || '%'
            or lower(trim(my_abroad)) like '%' || lower(trim(p.study_abroad_program)) || '%'
          ) then 95 else 0 end
        +
        coalesce((
          select count(*)::int * 30
          from public.friendships f
          where f.user_id = p.id
            and f.friend_id in (select mf.id from my_friends mf)
        ), 0)
        +
        coalesce((
          select count(*)::int * 40
          from public.friendships f
          join public.profiles fp on fp.id = f.friend_id
          where f.user_id = p.id
            and f.friend_id in (select mf.id from my_friends mf)
            and my_home is not null and length(trim(my_home)) > 0
            and length(trim(coalesce(fp.home_university, ''))) > 0
            and (
              lower(trim(fp.home_university)) = lower(trim(my_home))
              or lower(trim(fp.home_university)) like '%' || lower(trim(my_home)) || '%'
              or lower(trim(my_home)) like '%' || lower(trim(fp.home_university)) || '%'
            )
        ), 0)
        +
        coalesce((
          select count(*)::int * 40
          from public.friendships f
          join public.profiles fp on fp.id = f.friend_id
          where f.user_id = p.id
            and f.friend_id in (select mf.id from my_friends mf)
            and my_abroad is not null and length(trim(my_abroad)) > 0
            and length(trim(coalesce(fp.study_abroad_program, ''))) > 0
            and (
              lower(trim(fp.study_abroad_program)) = lower(trim(my_abroad))
              or lower(trim(fp.study_abroad_program)) like '%' || lower(trim(my_abroad)) || '%'
              or lower(trim(my_abroad)) like '%' || lower(trim(fp.study_abroad_program)) || '%'
            )
        ), 0)
        +
        case when exists (
          select 1
          from public.community_members cm
          where cm.user_id = p.id
            and cm.community_id in (select mc.community_id from my_communities mc)
        ) then 55 else 0 end
        +
        case when my_host is not null and length(trim(my_host)) > 0
          and lower(trim(coalesce(p.host_city, ''))) = lower(trim(my_host))
          then 35 else 0 end
        +
        coalesce((
          select count(*)::int * 12
          from public.passport_city_ranks c
          where c.user_id = p.id
            and lower(trim(c.city_name)) in (select mc.city from my_cities mc)
        ), 0)
        + 1
      )::int as cand_score,
      coalesce((
        select count(*)::int
        from public.friendships f
        where f.user_id = p.id
          and f.friend_id in (select mf.id from my_friends mf)
      ), 0) as cand_shared
    from public.profiles p
    where p.id <> me
      and p.id not in (select mf.id from my_friends mf)
      and p.id not in (
        select blocked_id from public.user_blocks where blocker_id = me
        union
        select blocker_id from public.user_blocks where blocked_id = me
      )
  )
  select
    c.cand_id,
    c.cand_first,
    c.cand_last,
    c.cand_full,
    c.cand_avatar,
    c.cand_home,
    c.cand_abroad,
    c.cand_host_city,
    c.cand_host_country,
    c.cand_score,
    c.cand_shared,
    case
      when newest_id is not null and c.cand_id = newest_id then 'New on Abroadster'
      when my_abroad is not null and length(trim(my_abroad)) > 0
        and length(trim(coalesce(c.cand_abroad, ''))) > 0
        and (
          lower(trim(c.cand_abroad)) = lower(trim(my_abroad))
          or lower(trim(c.cand_abroad)) like '%' || lower(trim(my_abroad)) || '%'
          or lower(trim(my_abroad)) like '%' || lower(trim(c.cand_abroad)) || '%'
        ) then 'Same study abroad program'
      when my_home is not null and length(trim(my_home)) > 0
        and length(trim(coalesce(c.cand_home, ''))) > 0
        and (
          lower(trim(c.cand_home)) = lower(trim(my_home))
          or lower(trim(c.cand_home)) like '%' || lower(trim(my_home)) || '%'
          or lower(trim(my_home)) like '%' || lower(trim(c.cand_home)) || '%'
        ) then 'Same home school'
      when c.cand_shared > 0 then
        c.cand_shared::text || ' mutual friend' ||
        case when c.cand_shared = 1 then '' else 's' end
      when exists (
        select 1 from public.community_members cm
        where cm.user_id = c.cand_id
          and cm.community_id in (select mc.community_id from my_communities mc)
      ) then 'From your school communities'
      else 'Suggested for you'
    end
  from candidates c
  order by
    case when newest_id is not null and c.cand_id = newest_id then 0 else 1 end,
    c.cand_score desc,
    c.cand_full asc nulls last
  limit p_limit;
end;
$$;

grant execute on function public.suggest_accounts(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Notification prefs: gate PUSH only — always keep inbox history (Instagram-like)
-- ---------------------------------------------------------------------------
create or replace function public.filter_notification_by_prefs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Always store the notification in the center. Preferences only affect push.
  return NEW;
end;
$$;

create or replace function public.dispatch_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  tok record;
  messages jsonb := '[]'::jsonb;
begin
  -- Respect user notification preferences for remote push only
  if not public.notification_pref_allows(NEW.user_id, NEW.kind) then
    return NEW;
  end if;

  for tok in
    select token from public.user_push_tokens where user_id = NEW.user_id
  loop
    messages := messages || jsonb_build_array(
      jsonb_build_object(
        'to', tok.token,
        'title', NEW.title,
        'body', coalesce(NEW.body, ''),
        'sound', 'default',
        'data', coalesce(NEW.data, '{}'::jsonb) || jsonb_build_object(
          'notification_id', NEW.id,
          'kind', NEW.kind
        )
      )
    );
  end loop;

  if jsonb_array_length(messages) = 0 then
    return NEW;
  end if;

  payload := messages;

  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json'
      ),
      body := payload
    );
  exception when others then
    null;
  end;

  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_trip: trip_created only to people who friended the creator
-- (you only get trip alerts from accounts YOU added as friends)
-- ---------------------------------------------------------------------------
create or replace function public.create_trip(
  p_destination_city text,
  p_destination_country text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_date_start date default null,
  p_date_end date default null,
  p_date_label text default null,
  p_description text default null,
  p_open_to_join boolean default true,
  p_max_members int default null,
  p_invitee_ids uuid[] default '{}',
  p_notify_friends boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  tid uuid;
  token text;
  album_id uuid;
  channel_id uuid;
  invitee uuid;
  invite_id uuid;
  friend record;
  my_name text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_destination_city), '') = '' then
    raise exception 'Destination city required';
  end if;

  select full_name into my_name from public.profiles where id = me;

  insert into public.trips (
    owner_id, status, open_to_join,
    destination_city, destination_country,
    date_label, date_start, date_end,
    latitude, longitude, description, max_members
  ) values (
    me, 'planning', coalesce(p_open_to_join, true),
    trim(p_destination_city), coalesce(nullif(trim(p_destination_country), ''), ''),
    p_date_label, p_date_start, p_date_end,
    p_latitude, p_longitude, nullif(trim(coalesce(p_description, '')), ''),
    p_max_members
  )
  returning id, invite_token into tid, token;

  insert into public.trip_members(trip_id, user_id, role)
  values (tid, me, 'owner');

  album_id := public.ensure_trip_album(tid);
  channel_id := public.ensure_trip_channel(tid);

  perform public.passport_apply_trip_unlock(
    me, tid, trim(p_destination_city),
    coalesce(nullif(trim(p_destination_country), ''), ''),
    p_latitude, p_longitude
  );

  if p_invitee_ids is not null then
    foreach invitee in array p_invitee_ids
    loop
      if invitee is null or invitee = me then
        continue;
      end if;
      insert into public.trip_invites(trip_id, inviter_id, invitee_id, status)
      values (tid, me, invitee, 'pending')
      on conflict (trip_id, invitee_id) do update
        set status = 'pending', inviter_id = me
      returning id into invite_id;

      insert into public.notifications(user_id, kind, title, body, data)
      values (
        invitee,
        'trip_invite',
        'Trip invite',
        coalesce(my_name, 'Someone') || ' invited you to ' || trim(p_destination_city),
        jsonb_build_object(
          'trip_id', tid,
          'invite_id', invite_id,
          'invitee_id', invitee,
          'inviter_id', me
        )
      );
    end loop;
  end if;

  if coalesce(p_notify_friends, false) then
    -- People who added ME as a friend (their "friends" list includes me)
    for friend in
      select f.user_id as recipient_id
      from public.friendships f
      where f.friend_id = me
    loop
      if friend.recipient_id = me then continue; end if;
      if p_invitee_ids is not null and friend.recipient_id = any (p_invitee_ids) then
        continue;
      end if;
      insert into public.notifications(user_id, kind, title, body, data)
      values (
        friend.recipient_id,
        'trip_created',
        'New trip',
        coalesce(my_name, 'A friend') || ' is planning a trip to ' || trim(p_destination_city),
        jsonb_build_object('trip_id', tid, 'owner_id', me)
      );
    end loop;
  end if;

  return jsonb_build_object(
    'trip_id', tid,
    'invite_token', token,
    'channel_id', channel_id,
    'album_id', album_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile albums: show upcoming to one-way friends (not only mutual)
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
    -- Or either-direction friendship (one-way friends model)
    or exists (
      select 1 from public.friendships f
      where (f.user_id = me and f.friend_id = p_user_id)
         or (f.user_id = p_user_id and f.friend_id = me)
    )
    -- Or viewing own profile
    or me = p_user_id
  order by coalesce(t.date_start, t.created_at) desc nulls last
  limit greatest(1, least(coalesce(p_limit, 40), 80));
end;
$$;

grant execute on function public.list_author_albums(uuid, int) to authenticated;

-- Ensure add_friend always writes friend_added into the inbox
create or replace function public.add_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if me = p_friend_id then raise exception 'Cannot friend yourself'; end if;

  select full_name into my_name from public.profiles where id = me;

  insert into public.friendships(user_id, friend_id)
  values (me, p_friend_id)
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
