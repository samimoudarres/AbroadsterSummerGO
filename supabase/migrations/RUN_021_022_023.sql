-- Host can accept / decline open-to-join requests.
-- Safe to re-run.

create or replace function public.respond_trip_join_request(
  p_request_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  req public.trip_join_requests%rowtype;
  t public.trips%rowtype;
  member_count int;
  my_name text;
  requester_name text;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select * into req from public.trip_join_requests where id = p_request_id;
  if req.id is null then raise exception 'Join request not found'; end if;
  if req.status <> 'pending' then raise exception 'Request already handled'; end if;

  select * into t from public.trips where id = req.trip_id;
  if t.id is null then raise exception 'Trip not found'; end if;
  if t.owner_id <> me then raise exception 'Only the host can respond'; end if;

  select full_name into my_name from public.profiles where id = me;
  select full_name into requester_name from public.profiles where id = req.requester_id;

  if not coalesce(p_accept, false) then
    update public.trip_join_requests
    set status = 'declined'
    where id = p_request_id;

    insert into public.notifications(user_id, kind, title, body, data)
    values (
      req.requester_id,
      'trip_join_declined',
      'Join request declined',
      coalesce(my_name, 'Someone') || ' declined your request to join ' ||
        coalesce(t.destination_city, 'their trip'),
      jsonb_build_object(
        'trip_id', req.trip_id,
        'request_id', p_request_id,
        'owner_id', me
      )
    );
    return;
  end if;

  member_count := public.trip_member_count(req.trip_id);
  if t.max_members is not null and member_count >= t.max_members then
    raise exception 'Trip is full';
  end if;

  update public.trip_join_requests
  set status = 'accepted'
  where id = p_request_id;

  insert into public.trip_members(trip_id, user_id, role)
  values (req.trip_id, req.requester_id, 'member')
  on conflict do nothing;

  perform public.ensure_trip_channel(req.trip_id);

  insert into public.notifications(user_id, kind, title, body, data)
  values (
    req.requester_id,
    'trip_join_accepted',
    'Youâ€™re in!',
    coalesce(my_name, 'Someone') || ' accepted you on the ' ||
      coalesce(t.destination_city, '') || ' trip',
    jsonb_build_object(
      'trip_id', req.trip_id,
      'request_id', p_request_id,
      'owner_id', me
    )
  );
end;
$$;

grant execute on function public.respond_trip_join_request(uuid, boolean) to authenticated;

-- Auto-join home + abroad school chats and return them for the signed-in user.
-- Bypasses RLS (security definer). Safe to re-run.

grant execute on function public.ensure_community(text, text, text) to authenticated;

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

  abroad_name := nullif(trim(coalesce(p.study_abroad_program, '')), '');
  home_name := nullif(trim(coalesce(p.home_university, '')), '');

  -- Nothing to join until the user has set schools on their profile
  if abroad_name is null and home_name is null then
    return;
  end if;

  if abroad_name is not null then
    abroad_id := public.ensure_community(
      abroad_name,
      'abroad',
      coalesce(nullif(trim(p.abroad_accent), ''), '#9B51E0')
    );
    update public.communities
    set accent = coalesce(nullif(trim(p.abroad_accent), ''), accent)
    where id = abroad_id;
    insert into public.community_members(community_id, user_id)
    values (abroad_id, uid)
    on conflict do nothing;
  end if;

  if home_name is not null then
    home_id := public.ensure_community(
      home_name,
      'home',
      coalesce(nullif(trim(p.home_accent), ''), '#BF5700')
    );
    update public.communities
    set accent = coalesce(nullif(trim(p.home_accent), ''), accent)
    where id = home_id;
    insert into public.community_members(community_id, user_id)
    values (home_id, uid)
    on conflict do nothing;
  end if;

  -- Leave other home/abroad school chats so pills match the profile
  delete from public.community_members cm
  using public.communities c
  where cm.community_id = c.id
    and cm.user_id = uid
    and c.kind in ('home', 'abroad')
    and (
      (abroad_id is not null and home_id is not null and cm.community_id not in (abroad_id, home_id))
      or (abroad_id is not null and home_id is null and cm.community_id <> abroad_id)
      or (abroad_id is null and home_id is not null and cm.community_id <> home_id)
    );
end;
$$;

grant execute on function public.sync_profile_communities(uuid) to authenticated;

-- Sync + return school communities (with channel ids) for the current user
create or replace function public.get_my_school_communities()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  result jsonb := '[]'::jsonb;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  perform public.sync_profile_communities(me);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'kind', c.kind,
        'accent', c.accent,
        'logo_url', c.logo_url,
        'channel_ids', coalesce((
          select jsonb_object_agg(ch.slug, ch.id)
          from public.channels ch
          where ch.community_id = c.id
        ), '{}'::jsonb)
      )
      order by case when c.kind = 'abroad' then 0 else 1 end
    ),
    '[]'::jsonb
  )
  into result
  from public.community_members m
  join public.communities c on c.id = m.community_id
  where m.user_id = me
    and c.kind in ('home', 'abroad');

  return result;
end;
$$;

grant execute on function public.get_my_school_communities() to authenticated;

-- On profile insert: join only schools that are actually set (no blank community names)
create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  abroad_id uuid;
  home_id uuid;
  ch uuid;
  abroad_name text := nullif(trim(coalesce(new.study_abroad_program, '')), '');
  home_name text := nullif(trim(coalesce(new.home_university, '')), '');
begin
  if abroad_name is not null then
    abroad_id := public.ensure_community(
      abroad_name,
      'abroad',
      coalesce(nullif(trim(new.abroad_accent), ''), '#9B51E0')
    );
    insert into public.community_members(community_id, user_id)
    values (abroad_id, new.id)
    on conflict do nothing;
  end if;

  if home_name is not null then
    home_id := public.ensure_community(
      home_name,
      'home',
      coalesce(nullif(trim(new.home_accent), ''), '#BF5700')
    );
    insert into public.community_members(community_id, user_id)
    values (home_id, new.id)
    on conflict do nothing;
  end if;

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

-- Batched trips feed (members, album preview, join state, invites, channel).
-- Replaces N+1 hydrateTrip client queries. Safe to re-run.

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
        'leaving_time', t.leaving_time,
        'description', t.description,
        'max_members', t.max_members,
        'invite_token', t.invite_token,
        'latitude', t.latitude,
        'longitude', t.longitude,
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
        'is_following_album', exists (
          select 1 from public.album_followers af
          where af.album_id = al.id and af.user_id = me
        ),
        'album_preview_urls', coalesce((
          select jsonb_agg(p.image_url order by p.created_at desc)
          from (
            select ap.image_url, ap.created_at
            from public.album_photos ap
            where ap.album_id = al.id
            order by ap.created_at desc
            limit 3
          ) p
        ), '[]'::jsonb),
        'channel_id', (
          select c.id
          from public.channels c
          where c.trip_id = t.id and c.slug = 'trip'
          limit 1
        ),
        'pending_invitee_ids', coalesce((
          select jsonb_agg(i.invitee_id)
          from public.trip_invites i
          where i.trip_id = t.id and i.status = 'pending'
        ), '[]'::jsonb)
      ) as row_data
    from public.trips t
    left join public.trip_albums al on al.trip_id = t.id
    where (
      not p_mine_only
      or exists (
        select 1 from public.trip_members tm
        where tm.trip_id = t.id and tm.user_id = me
      )
    )
  ) feed;

  return result;
end;
$$;

grant execute on function public.list_trips_feed(boolean) to authenticated;

-- Enable realtime for chat messages (idempotent)
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;

