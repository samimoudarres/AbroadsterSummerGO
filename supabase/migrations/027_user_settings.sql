-- User settings (notification prefs + onboarding), suggest_accounts RPC,
-- notification preference gate, default avatar color #C2D8D7.

-- ---------------------------------------------------------------------------
-- Default avatar background for new users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fname text;
  lname text;
  fulln text;
  home_uni text;
  abroad_prog text;
  avatar text;
begin
  fname := coalesce(
    nullif(new.raw_user_meta_data->>'first_name', ''),
    split_part(coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), ' ', 1),
    'Abroadster'
  );
  lname := coalesce(
    nullif(new.raw_user_meta_data->>'last_name', ''),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name', ''), '^\S+\s*', ''), ''),
    ''
  );
  fulln := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    trim(fname || ' ' || lname),
    fname
  );
  home_uni := coalesce(nullif(new.raw_user_meta_data->>'home_university', ''), 'UT Austin');
  abroad_prog := coalesce(nullif(new.raw_user_meta_data->>'study_abroad_program', ''), 'NYU Paris');
  avatar := coalesce(
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    'https://ui-avatars.com/api/?name=' || replace(fulln, ' ', '+') || '&background=C2D8D7&color=222222&size=256&bold=true'
  );

  insert into public.profiles (
    id, first_name, last_name, full_name, avatar_url,
    home_university, study_abroad_program, home_accent, abroad_accent
  ) values (
    new.id, fname, lname, fulln, avatar,
    home_uni, abroad_prog, '#BF5700', '#9B51E0'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notification_prefs jsonb not null default '{}'::jsonb,
  onboarding jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings own" on public.user_settings;
create policy "user_settings own" on public.user_settings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.get_my_settings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.user_settings%rowtype;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  insert into public.user_settings(user_id)
  values (me)
  on conflict (user_id) do nothing;
  select * into row from public.user_settings where user_id = me;
  return jsonb_build_object(
    'notification_prefs', coalesce(row.notification_prefs, '{}'::jsonb),
    'onboarding', coalesce(row.onboarding, '{}'::jsonb),
    'updated_at', row.updated_at
  );
end;
$$;

create or replace function public.upsert_my_settings(
  p_notification_prefs jsonb default null,
  p_onboarding jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.user_settings%rowtype;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  insert into public.user_settings(user_id)
  values (me)
  on conflict (user_id) do nothing;

  update public.user_settings
  set
    notification_prefs = case
      when p_notification_prefs is null then notification_prefs
      else coalesce(notification_prefs, '{}'::jsonb) || p_notification_prefs
    end,
    onboarding = case
      when p_onboarding is null then onboarding
      else coalesce(onboarding, '{}'::jsonb) || p_onboarding
    end,
    updated_at = now()
  where user_id = me;

  select * into row from public.user_settings where user_id = me;
  return jsonb_build_object(
    'notification_prefs', coalesce(row.notification_prefs, '{}'::jsonb),
    'onboarding', coalesce(row.onboarding, '{}'::jsonb),
    'updated_at', row.updated_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Skip notification insert when recipient opted out (keeps in-app + push aligned)
-- Prefs default ON when key missing. Empty {} = all enabled.
-- ---------------------------------------------------------------------------
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
  allowed boolean;
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

  if prefs ? pref_key then
    allowed := (prefs ->> pref_key)::boolean;
    return coalesce(allowed, true);
  end if;
  return true;
end;
$$;

create or replace function public.filter_notification_by_prefs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.notification_pref_allows(NEW.user_id, NEW.kind) then
    return null; -- skip insert
  end if;
  return NEW;
end;
$$;

drop trigger if exists notifications_filter_prefs on public.notifications;
create trigger notifications_filter_prefs
  before insert on public.notifications
  for each row
  execute function public.filter_notification_by_prefs();

-- ---------------------------------------------------------------------------
-- suggest_accounts
-- ---------------------------------------------------------------------------
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
  shared_friends int
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
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_limit is null or p_limit < 1 then p_limit := 40; end if;
  if p_limit > 100 then p_limit := 100; end if;

  select home_university, study_abroad_program, host_city
    into my_home, my_abroad, my_host
  from public.profiles where id = me;

  return query
  with my_friends as (
    select friend_id as id from public.friendships where user_id = me
  ),
  my_cities as (
    select lower(trim(city_name)) as city
    from public.passport_city_ranks
    where user_id = me and city_name is not null
  ),
  candidates as (
    select
      p.id,
      p.first_name,
      p.last_name,
      p.full_name,
      p.avatar_url,
      p.home_university,
      p.study_abroad_program,
      p.host_city,
      p.host_country,
      (
        case when my_home is not null and length(trim(my_home)) > 0
          and (
            lower(trim(coalesce(p.home_university, ''))) = lower(trim(my_home))
            or lower(trim(coalesce(p.home_university, ''))) like '%' || lower(trim(my_home)) || '%'
            or lower(trim(my_home)) like '%' || lower(trim(coalesce(p.home_university, ''))) || '%'
          ) then 100 else 0 end
        +
        case when my_abroad is not null and length(trim(my_abroad)) > 0
          and (
            lower(trim(coalesce(p.study_abroad_program, ''))) = lower(trim(my_abroad))
            or lower(trim(coalesce(p.study_abroad_program, ''))) like '%' || lower(trim(my_abroad)) || '%'
            or lower(trim(my_abroad)) like '%' || lower(trim(coalesce(p.study_abroad_program, ''))) || '%'
          ) then 90 else 0 end
        +
        case when my_host is not null and length(trim(my_host)) > 0
          and lower(trim(coalesce(p.host_city, ''))) = lower(trim(my_host))
          then 40 else 0 end
        +
        coalesce((
          select count(*)::int * 25
          from public.friendships f
          where f.user_id = p.id
            and f.friend_id in (select id from my_friends)
        ), 0)
        +
        coalesce((
          select count(*)::int * 15
          from public.passport_city_ranks c
          where c.user_id = p.id
            and lower(trim(c.city_name)) in (select city from my_cities)
        ), 0)
      )::int as score,
      coalesce((
        select count(*)::int
        from public.friendships f
        where f.user_id = p.id
          and f.friend_id in (select id from my_friends)
      ), 0) as shared_friends
    from public.profiles p
    where p.id <> me
      and p.id not in (select id from my_friends)
  )
  select
    c.id as user_id,
    c.first_name,
    c.last_name,
    c.full_name,
    c.avatar_url,
    c.home_university,
    c.study_abroad_program,
    c.host_city,
    c.host_country,
    c.score,
    c.shared_friends
  from candidates c
  where c.score > 0
  order by c.score desc, c.full_name asc
  limit p_limit;
end;
$$;

grant execute on function public.get_my_settings() to authenticated;
grant execute on function public.upsert_my_settings(jsonb, jsonb) to authenticated;
grant execute on function public.suggest_accounts(int) to authenticated;
