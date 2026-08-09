-- Notification jobs: trip countdowns, invite reminders, school-channel
-- alerts + mute, host coords + friend nearby arrival alerts.
-- Push still flows through existing notifications_dispatch_push trigger.

-- ---------------------------------------------------------------------------
-- Host location coords (for 50-mile arrival checks)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists host_latitude double precision;
alter table public.profiles
  add column if not exists host_longitude double precision;

-- ---------------------------------------------------------------------------
-- Dedup / mute tables
-- ---------------------------------------------------------------------------
create table if not exists public.trip_countdown_sent (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  days_before int not null check (days_before in (1, 3, 5)),
  sent_at timestamptz not null default now(),
  primary key (trip_id, user_id, days_before)
);

create table if not exists public.trip_invite_reminder_sent (
  invite_id uuid not null references public.trip_invites(id) on delete cascade,
  sent_on date not null default (timezone('utc', now()))::date,
  primary key (invite_id, sent_on)
);

create table if not exists public.channel_mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

create index if not exists channel_mutes_channel_idx
  on public.channel_mutes (channel_id);

alter table public.channel_mutes enable row level security;

drop policy if exists "channel mutes own" on public.channel_mutes;
create policy "channel mutes own" on public.channel_mutes
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.friend_nearby_sent (
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  traveler_id uuid not null references public.profiles(id) on delete cascade,
  host_city text not null,
  sent_at timestamptz not null default now(),
  primary key (recipient_id, traveler_id, host_city)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.distance_miles(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else (
      3958.8 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lon2 - lon1) / 2), 2)
      ))
    )
  end;
$$;

create or replace function public.resolve_city_coords(p_city text)
returns table (latitude double precision, longitude double precision)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_city is null or length(trim(p_city)) = 0 then
    return;
  end if;
  return query
    select p.latitude, p.longitude
    from public.study_programs p
    where lower(p.city) = lower(trim(p_city))
       or lower(p.city) like '%' || lower(trim(p_city)) || '%'
       or lower(trim(p_city)) like '%' || lower(p.city) || '%'
    order by case when lower(p.city) = lower(trim(p_city)) then 0 else 1 end
    limit 1;
end;
$$;

create or replace function public.resolve_program_coords(p_program_name text)
returns table (latitude double precision, longitude double precision, city text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_program_name is null or length(trim(p_program_name)) = 0 then
    return;
  end if;
  return query
    select p.latitude, p.longitude, p.city
    from public.study_programs p
    where lower(p.name) = lower(trim(p_program_name))
       or lower(p.short_name) = lower(trim(p_program_name))
       or lower(p.name) like '%' || lower(trim(p_program_name)) || '%'
       or lower(trim(p_program_name)) like '%' || lower(p.name) || '%'
       or lower(p.short_name) like '%' || lower(trim(p_program_name)) || '%'
    order by
      case
        when lower(p.name) = lower(trim(p_program_name)) then 0
        when lower(p.short_name) = lower(trim(p_program_name)) then 1
        else 2
      end
    limit 1;
end;
$$;

create or replace function public.format_name_list(p_names text[])
returns text
language plpgsql
immutable
as $$
declare
  n int;
  cleaned text[];
begin
  cleaned := array(
    select trim(x) from unnest(coalesce(p_names, '{}'::text[])) as x
    where length(trim(x)) > 0
  );
  n := coalesce(array_length(cleaned, 1), 0);
  if n = 0 then return ''; end if;
  if n = 1 then return cleaned[1]; end if;
  if n = 2 then return cleaned[1] || ' and ' || cleaned[2]; end if;
  return array_to_string(cleaned[1:n-1], ', ') || ', and ' || cleaned[n];
end;
$$;

-- Fill host lat/lng from city / program when missing
create or replace function public.fill_host_coords_from_city()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  coords record;
  city_changed boolean;
begin
  if NEW.host_city is null or length(trim(NEW.host_city)) = 0 then
    NEW.host_latitude := null;
    NEW.host_longitude := null;
    return NEW;
  end if;

  city_changed := TG_OP = 'INSERT'
    or NEW.host_city is distinct from OLD.host_city;

  if not city_changed
     and NEW.host_latitude is not null
     and NEW.host_longitude is not null then
    return NEW;
  end if;

  if city_changed then
    if TG_OP = 'UPDATE'
       and NEW.host_latitude is not null
       and NEW.host_longitude is not null
       and (
         NEW.host_latitude is distinct from OLD.host_latitude
         or NEW.host_longitude is distinct from OLD.host_longitude
       ) then
      return NEW;
    end if;

    select * into coords from public.resolve_city_coords(NEW.host_city);
    if coords.latitude is not null then
      NEW.host_latitude := coords.latitude;
      NEW.host_longitude := coords.longitude;
    end if;
  elsif NEW.host_latitude is null or NEW.host_longitude is null then
    select * into coords from public.resolve_city_coords(NEW.host_city);
    if coords.latitude is not null then
      NEW.host_latitude := coords.latitude;
      NEW.host_longitude := coords.longitude;
    end if;
  end if;

  return NEW;
end;
$$;


drop trigger if exists profiles_fill_host_coords on public.profiles;
create trigger profiles_fill_host_coords
  before insert or update of host_city, host_latitude, host_longitude, study_abroad_program
  on public.profiles
  for each row
  execute function public.fill_host_coords_from_city();

-- ---------------------------------------------------------------------------
-- Channel mute RPCs
-- ---------------------------------------------------------------------------
create or replace function public.mute_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_channel_id is null then raise exception 'Missing channel'; end if;
  insert into public.channel_mutes(user_id, channel_id)
  values (me, p_channel_id)
  on conflict do nothing;
end;
$$;

create or replace function public.unmute_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  delete from public.channel_mutes
  where user_id = me and channel_id = p_channel_id;
end;
$$;

create or replace function public.is_channel_muted(p_channel_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return false; end if;
  return exists (
    select 1 from public.channel_mutes
    where user_id = me and channel_id = p_channel_id
  );
end;
$$;

grant execute on function public.mute_channel(uuid) to authenticated;
grant execute on function public.unmute_channel(uuid) to authenticated;
grant execute on function public.is_channel_muted(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- School channel message → notifications (GroupMe-style)
-- ---------------------------------------------------------------------------
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

  -- Trip group chats use trip_id; skip those — only home/abroad school communities
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
  end loop;

  return NEW;
end;
$$;

drop trigger if exists messages_notify_channel on public.messages;
create trigger messages_notify_channel
  after insert on public.messages
  for each row
  execute function public.notify_on_channel_message();

-- ---------------------------------------------------------------------------
-- Friend nearby when host city changes near their study-abroad program
-- ---------------------------------------------------------------------------
create or replace function public.notify_friends_on_host_arrival()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prog record;
  host_lat double precision;
  host_lng double precision;
  miles double precision;
  friend_row record;
  traveler_first text;
  city_label text;
begin
  if NEW.host_city is null or length(trim(NEW.host_city)) = 0 then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and NEW.host_city is not distinct from OLD.host_city then
    return NEW;
  end if;

  select * into prog from public.resolve_program_coords(NEW.study_abroad_program);
  if prog.latitude is null then
    return NEW;
  end if;

  host_lat := NEW.host_latitude;
  host_lng := NEW.host_longitude;
  if host_lat is null or host_lng is null then
    select c.latitude, c.longitude into host_lat, host_lng
    from public.resolve_city_coords(NEW.host_city) c;
  end if;
  if host_lat is null or host_lng is null then
    return NEW;
  end if;

  miles := public.distance_miles(host_lat, host_lng, prog.latitude, prog.longitude);
  if miles is null or miles > 50 then
    return NEW;
  end if;

  traveler_first := coalesce(nullif(trim(NEW.first_name), ''), split_part(NEW.full_name, ' ', 1), 'A friend');
  city_label := trim(NEW.host_city);

  for friend_row in
    select f.user_id as recipient_id
    from public.friendships f
    where f.friend_id = NEW.id
  loop
    if exists (
      select 1 from public.friend_nearby_sent s
      where s.recipient_id = friend_row.recipient_id
        and s.traveler_id = NEW.id
        and lower(s.host_city) = lower(city_label)
    ) then
      continue;
    end if;

    insert into public.friend_nearby_sent(recipient_id, traveler_id, host_city)
    values (friend_row.recipient_id, NEW.id, city_label)
    on conflict do nothing;

    insert into public.notifications(user_id, kind, title, body, data)
    values (
      friend_row.recipient_id,
      'friend_nearby',
      traveler_first || ' just traveled to ' || city_label,
      'Show them the must-see spots',
      jsonb_build_object(
        'from_user_id', NEW.id,
        'host_city', city_label,
        'host_country', NEW.host_country
      )
    );
  end loop;

  return NEW;
end;
$$;

drop trigger if exists profiles_notify_host_arrival on public.profiles;
create trigger profiles_notify_host_arrival
  after update of host_city, host_latitude, host_longitude
  on public.profiles
  for each row
  execute function public.notify_friends_on_host_arrival();

-- ---------------------------------------------------------------------------
-- Trip countdown 5 / 3 / 1 days
-- ---------------------------------------------------------------------------
create or replace function public.run_trip_countdown_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  days_left int;
  member_id uuid;
  other_names text[];
  names_text text;
  city text;
  inserted int;
begin
  for t in
    select *
    from public.trips
    where date_start is not null
      and status in ('upcoming', 'planning')
  loop
    days_left := (t.date_start::date - (timezone('utc', now()))::date);
    if days_left not in (1, 3, 5) then
      continue;
    end if;

    city := coalesce(nullif(trim(t.destination_city), ''), 'your destination');

    for member_id in
      select tm.user_id from public.trip_members tm where tm.trip_id = t.id
    loop
      insert into public.trip_countdown_sent(trip_id, user_id, days_before)
      values (t.id, member_id, days_left)
      on conflict do nothing;
      get diagnostics inserted = row_count;
      if inserted = 0 then
        continue;
      end if;

      select coalesce(array_agg(p.first_name order by p.first_name), '{}'::text[])
      into other_names
      from public.trip_members tm
      join public.profiles p on p.id = tm.user_id
      where tm.trip_id = t.id and tm.user_id <> member_id;

      names_text := public.format_name_list(other_names);

      insert into public.notifications(user_id, kind, title, body, data)
      values (
        member_id,
        'trip_countdown',
        'Your trip to ' || city || ' is ' || days_left || ' day'
          || case when days_left = 1 then '' else 's' end || ' away!',
        case
          when length(names_text) > 0 then
            'Ensure ' || names_text || ' are on the same page.'
          else
            'Make sure everyone is on the same page.'
        end,
        jsonb_build_object(
          'trip_id', t.id,
          'days_before', days_left,
          'destination_city', city
        )
      );
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily pending invite reminders
-- ---------------------------------------------------------------------------
create or replace function public.run_trip_invite_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  t public.trips%rowtype;
  inviter_name text;
  city text;
  today date := (timezone('utc', now()))::date;
  inserted int;
begin
  for inv in
    select * from public.trip_invites where status = 'pending'
  loop
    insert into public.trip_invite_reminder_sent(invite_id, sent_on)
    values (inv.id, today)
    on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted = 0 then
      continue;
    end if;

    select * into t from public.trips where id = inv.trip_id;
    if t.id is null then continue; end if;

    select full_name into inviter_name from public.profiles where id = inv.inviter_id;
    city := coalesce(nullif(trim(t.destination_city), ''), 'a trip');

    insert into public.notifications(user_id, kind, title, body, data)
    values (
      inv.invitee_id,
      'trip_invite_reminder',
      'Reminder: trip invite',
      coalesce(inviter_name, 'Someone') || ' invited you to ' || city
        || ' — accept or decline in the app.',
      jsonb_build_object(
        'trip_id', inv.trip_id,
        'invite_id', inv.id,
        'inviter_id', inv.inviter_id
      )
    );
  end loop;
end;
$$;

grant execute on function public.run_trip_countdown_notifications() to postgres;
grant execute on function public.run_trip_invite_reminders() to postgres;

-- ---------------------------------------------------------------------------
-- pg_cron schedules (best-effort on hosted Supabase)
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
exception when others then
  raise notice 'pg_cron unavailable — schedule countdown/reminder jobs in Dashboard → Integrations → Cron';
end $$;

do $$
begin
  perform cron.unschedule('trip-countdowns');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('trip-invite-reminders');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.schedule(
    'trip-countdowns',
    '0 14 * * *',
    $cron$ select public.run_trip_countdown_notifications(); $cron$
  );
exception when others then
  raise notice 'Could not schedule trip-countdowns: %', SQLERRM;
end $$;

do $$
begin
  perform cron.schedule(
    'trip-invite-reminders',
    '0 15 * * *',
    $cron$ select public.run_trip_invite_reminders(); $cron$
  );
exception when others then
  raise notice 'Could not schedule trip-invite-reminders: %', SQLERRM;
end $$;
