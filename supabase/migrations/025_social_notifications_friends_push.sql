-- Social launch: one-way friends, invite_id fix, feed visibility,
-- DM notifications, push token storage + Expo push dispatch.

-- ---------------------------------------------------------------------------
-- Push tokens
-- ---------------------------------------------------------------------------
create table if not exists public.user_push_tokens (
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

create index if not exists user_push_tokens_user_idx
  on public.user_push_tokens (user_id);

alter table public.user_push_tokens enable row level security;

drop policy if exists "push tokens own" on public.user_push_tokens;
create policy "push tokens own" on public.user_push_tokens
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_token is null or length(trim(p_token)) < 8 then
    raise exception 'Invalid push token';
  end if;

  insert into public.user_push_tokens(user_id, token, platform, updated_at)
  values (me, trim(p_token), nullif(trim(coalesce(p_platform, '')), ''), now())
  on conflict (user_id, token) do update
    set platform = excluded.platform,
        updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  delete from public.user_push_tokens
  where user_id = me and token = trim(p_token);
end;
$$;

-- Best-effort Expo push via pg_net (available on hosted Supabase).
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net unavailable — remote push dispatch will no-op until enabled';
end $$;

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
    -- Never fail the notification insert if push dispatch fails
    null;
  end;

  return NEW;
end;
$$;

drop trigger if exists notifications_dispatch_push on public.notifications;
create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row
  execute function public.dispatch_notification_push();

-- ---------------------------------------------------------------------------
-- One-way friends (A adds B → only A→B row; B is notified)
-- ---------------------------------------------------------------------------
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

create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  delete from public.friendships
  where user_id = me and friend_id = p_friend_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Feed: see posts from people YOU friended (directed), plus own + communities
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
        'display_mode', coalesce(p.display_mode, 'carousel'),
        'collage_layout_id', p.collage_layout_id,
        'audience', coalesce(p.audience, 'all'),
        'tagged_trip_id', p.tagged_trip_id,
        'stamp_count', coalesce(sc.cnt, 0),
        'i_stamped', exists (
          select 1 from public.post_stamps s where s.post_id = p.id and s.user_id = me
        ),
        'photo_urls', coalesce((
          select jsonb_agg(pp.image_url order by pp.sort_order)
          from public.post_photos pp where pp.post_id = p.id
        ), '[]'::jsonb),
        'photo_crops', coalesce((
          select jsonb_agg(coalesce(pp.crop_json, '{}'::jsonb) order by pp.sort_order)
          from public.post_photos pp where pp.post_id = p.id
        ), '[]'::jsonb),
        'tagged_user_ids', coalesce((
          select jsonb_agg(pt.user_id) from public.post_tags pt where pt.post_id = p.id
        ), '[]'::jsonb),
        'audience_community_ids', coalesce((
          select jsonb_agg(pac.community_id)
          from public.post_audience_communities pac where pac.post_id = p.id
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
        + coalesce(sc.cnt, 0) * 5
        + greatest(0, 200 - extract(epoch from (now() - p.created_at)) / 3600.0)
      ) as score
    from public.posts p
    join public.profiles a on a.id = p.author_id
    left join lateral (
      select count(*)::int as cnt from public.post_stamps s where s.post_id = p.id
    ) sc on true
    where
      p.author_id = me
      or (
        -- Directed friendship: I added the author → I see their all/friends posts
        exists (
          select 1 from public.friendships f
          where f.user_id = me and f.friend_id = p.author_id
        )
        and coalesce(p.audience, 'all') in ('all', 'friends')
      )
      or (
        p.audience = 'communities'
        and exists (
          select 1
          from public.post_audience_communities pac
          join public.community_members cm on cm.community_id = pac.community_id
          where pac.post_id = p.id and cm.user_id = me
        )
      )
    order by score desc, p.created_at desc
    limit greatest(1, coalesce(p_limit, 30))
    offset greatest(0, coalesce(p_offset, 0))
  ) ranked;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- DM message → notification for other participant(s)
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_dm_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_id uuid;
  sender_name text;
  preview text;
begin
  if NEW.dm_thread_id is null then
    return NEW;
  end if;
  if NEW.kind = 'system' then
    return NEW;
  end if;

  select full_name into sender_name from public.profiles where id = NEW.sender_id;
  preview := coalesce(nullif(trim(NEW.body), ''), 'Sent a message');
  if length(preview) > 120 then
    preview := left(preview, 117) || '...';
  end if;

  for other_id in
    select user_id from public.dm_participants
    where thread_id = NEW.dm_thread_id and user_id <> NEW.sender_id
  loop
    insert into public.notifications(user_id, kind, title, body, data)
    values (
      other_id,
      'dm_message',
      coalesce(sender_name, 'New message'),
      preview,
      jsonb_build_object(
        'from_user_id', NEW.sender_id,
        'thread_id', NEW.dm_thread_id,
        'message_id', NEW.id
      )
    );
  end loop;

  return NEW;
end;
$$;

drop trigger if exists messages_notify_dm on public.messages;
create trigger messages_notify_dm
  after insert on public.messages
  for each row
  execute function public.notify_on_dm_message();

-- ---------------------------------------------------------------------------
-- Fix create_trip invite notifications to include invite_id
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
    for friend in
      select friend_id from public.friendships where user_id = me
    loop
      if friend.friend_id = me then continue; end if;
      if p_invitee_ids is not null and friend.friend_id = any (p_invitee_ids) then
        continue;
      end if;
      insert into public.notifications(user_id, kind, title, body, data)
      values (
        friend.friend_id,
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

-- Accept/decline invite (decline notifies inviter; accept keeps capacity check)
create or replace function public.respond_trip_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  inv public.trip_invites%rowtype;
  t public.trips%rowtype;
  member_count int;
  my_name text;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select * into inv from public.trip_invites where id = p_invite_id;
  if inv.id is null then raise exception 'Invite not found'; end if;
  if inv.invitee_id <> me then raise exception 'Not your invite'; end if;
  if inv.status <> 'pending' then raise exception 'Invite already handled'; end if;

  select * into t from public.trips where id = inv.trip_id;
  select full_name into my_name from public.profiles where id = me;

  if not coalesce(p_accept, false) then
    update public.trip_invites set status = 'declined' where id = p_invite_id;
    insert into public.notifications(user_id, kind, title, body, data)
    values (
      inv.inviter_id,
      'trip_invite_declined',
      'Invite declined',
      coalesce(my_name, 'Someone') || ' declined your '
        || coalesce(t.destination_city, 'trip') || ' invite',
      jsonb_build_object(
        'trip_id', inv.trip_id,
        'invite_id', inv.id,
        'invitee_id', me
      )
    );
    return;
  end if;

  member_count := public.trip_member_count(inv.trip_id);
  if t.max_members is not null and member_count >= t.max_members then
    raise exception 'Trip is full';
  end if;

  update public.trip_invites set status = 'accepted' where id = p_invite_id;
  insert into public.trip_members(trip_id, user_id, role)
  values (inv.trip_id, me, 'member')
  on conflict do nothing;

  perform public.ensure_trip_channel(inv.trip_id);

  insert into public.notifications(user_id, kind, title, body, data)
  values (
    inv.inviter_id,
    'trip_invite_accepted',
    'Invite accepted',
    coalesce(my_name, 'Someone') || ' joined your ' || t.destination_city || ' trip',
    jsonb_build_object('trip_id', inv.trip_id, 'invitee_id', me, 'invite_id', inv.id)
  );
end;
$$;
