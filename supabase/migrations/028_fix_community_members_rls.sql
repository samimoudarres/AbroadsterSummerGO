-- Fix infinite recursion in community_members RLS (breaks channel message
-- insert/select via messages policies that join community_members).
-- Root cause: "community_members read peers" queried community_members
-- from within a policy on the same table.

create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_members m
    where m.community_id = p_community_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_member(p_trip_id uuid)
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
      and tm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_community_member(uuid) from public;
grant execute on function public.is_community_member(uuid) to authenticated;
revoke all on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;

-- Peers: use SECURITY DEFINER helper (no self-query under RLS)
drop policy if exists "community_members read peers" on public.community_members;
create policy "community_members read peers" on public.community_members
  for select using (public.is_community_member(community_id));

-- Communities / channels: same helper (avoids recursive policy evaluation)
drop policy if exists "communities read members" on public.communities;
create policy "communities read members" on public.communities
  for select using (public.is_community_member(id));

drop policy if exists "channels read members" on public.channels;
create policy "channels read members" on public.channels
  for select using (
    (community_id is not null and public.is_community_member(community_id))
    or (trip_id is not null and public.is_trip_member(trip_id))
  );

-- Messages read policy: use helpers instead of joining community_members under RLS
drop policy if exists "messages read channel members" on public.messages;
create policy "messages read channel members" on public.messages
  for select using (
    (
      channel_id is not null
      and exists (
        select 1
        from public.channels c
        where c.id = channel_id
          and (
            (c.community_id is not null and public.is_community_member(c.community_id))
            or (c.trip_id is not null and public.is_trip_member(c.trip_id))
          )
      )
    )
    or (
      dm_thread_id is not null
      and exists (
        select 1
        from public.dm_participants p
        where p.thread_id = dm_thread_id
          and p.user_id = auth.uid()
      )
    )
  );

-- Never let notification fanout abort a message insert
create or replace function public.notify_on_channel_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.channels%rowtype;
  comm public.communities%rowtype;
  sender_name text;
  preview text;
  member_id uuid;
begin
  begin
    if NEW.channel_id is null then
      return NEW;
    end if;
    if NEW.dm_thread_id is not null then
      return NEW;
    end if;
    if NEW.kind = 'system' then
      return NEW;
    end if;

    select * into ch from public.channels where id = NEW.channel_id;
    if ch.id is null then return NEW; end if;
    if ch.trip_id is not null then
      return NEW;
    end if;
    if ch.community_id is null then
      return NEW;
    end if;

    select * into comm from public.communities where id = ch.community_id;
    if comm.id is null or comm.kind not in ('home', 'abroad') then
      return NEW;
    end if;

    select full_name into sender_name from public.profiles where id = NEW.sender_id;
    preview := coalesce(nullif(trim(NEW.body), ''), 'Sent a message');
    if length(preview) > 120 then
      preview := left(preview, 117) || '...';
    end if;

    for member_id in
      select cm.user_id
      from public.community_members cm
      where cm.community_id = ch.community_id
        and cm.user_id <> NEW.sender_id
        and not exists (
          select 1 from public.channel_mutes m
          where m.user_id = cm.user_id and m.channel_id = NEW.channel_id
        )
    loop
      begin
        insert into public.notifications(user_id, kind, title, body, data)
        values (
          member_id,
          'channel_message',
          coalesce(sender_name, 'New message'),
          preview,
          jsonb_build_object(
            'from_user_id', NEW.sender_id,
            'channel_id', NEW.channel_id,
            'community_id', ch.community_id,
            'message_id', NEW.id,
            'community_name', comm.name,
            'channel_slug', ch.slug
          )
        );
      exception when others then
        null;
      end;
    end loop;
  exception when others then
    null;
  end;

  return NEW;
end;
$$;

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
      begin
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
      exception when others then
        null;
      end;
    end loop;
  exception when others then
    null;
  end;

  return NEW;
end;
$$;

-- Fail-open prefs gate (never throw on bad jsonb)
create or replace function public.notification_pref_allows(
  p_user_id uuid,
  p_kind text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prefs jsonb;
  pref_key text;
  raw text;
begin
  begin
    select notification_prefs into prefs
    from public.user_settings
    where user_id = p_user_id;

    prefs := coalesce(prefs, '{}'::jsonb);

    pref_key := case
      when p_kind = 'post_stamped' then 'stamps'
      when p_kind = 'dm_message' then 'dms'
      when p_kind = 'channel_message' then 'channels'
      when p_kind in ('friend_added', 'friend_nearby') then 'friends'
      when p_kind in (
        'trip_invite', 'trip_invite_reminder', 'trip_join_request',
        'trip_invite_accepted', 'trip_invite_declined', 'trip_invite_cancelled',
        'trip_join_accepted', 'trip_join_declined'
      ) then 'trip_invites'
      when p_kind in ('trip_created', 'trip_confirmed', 'trip_countdown') then 'trips'
      when p_kind in ('album_followed', 'album_photos_uploaded') then 'albums'
      when p_kind = 'post_tagged' then 'tagged'
      else null
    end;

    if pref_key is null then
      return true;
    end if;

    if not (prefs ? pref_key) then
      return true;
    end if;

    raw := lower(trim(coalesce(prefs ->> pref_key, '')));
    if raw in ('false', '0', 'no', 'off') then
      return false;
    end if;
    if raw in ('true', '1', 'yes', 'on') then
      return true;
    end if;
    -- Unknown value → allow (fail open)
    return true;
  exception when others then
    return true;
  end;
end;
$$;
