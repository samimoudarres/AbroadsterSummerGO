-- Official Abroadster account polish, auto-friend on NEW profiles only,
-- invite share URL update (no notification backfill), explorer score accuracy.

-- ---------------------------------------------------------------------------
-- 1) Official Abroadster profile (name only, no school/program, 197 cities)
-- ---------------------------------------------------------------------------
update public.profiles
set
  first_name = 'Abroadster',
  last_name = '',
  full_name = 'Abroadster',
  home_university = '',
  study_abroad_program = '',
  home_accent = coalesce(nullif(home_accent, ''), '#C2D8D7'),
  abroad_accent = coalesce(nullif(abroad_accent, ''), '#C2D8D7'),
  host_city = null,
  host_country = null,
  host_latitude = null,
  host_longitude = null,
  cities_visited = 197,
  explorer_score_miles = 0,
  is_verified_student = false
where id = 'fa989cf9-6770-48d3-a715-dd095c6dee38';

-- ---------------------------------------------------------------------------
-- 2) Auto-friend Abroadster for every NEW profile (no backfill, no notif blast)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_abroadster_friend(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := coalesce(p_user_id, auth.uid());
  official uuid := 'fa989cf9-6770-48d3-a715-dd095c6dee38';
begin
  if uid is null then return; end if;
  if uid = official then return; end if;
  if not exists (select 1 from public.profiles where id = official) then
    return;
  end if;
  insert into public.friendships (user_id, friend_id)
  values (uid, official)
  on conflict do nothing;
end;
$$;

grant execute on function public.ensure_abroadster_friend(uuid) to authenticated;

create or replace function public.trg_auto_friend_abroadster()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_abroadster_friend(new.id);
  return new;
end;
$$;

drop trigger if exists trg_auto_friend_abroadster on public.profiles;
create trigger trg_auto_friend_abroadster
  after insert on public.profiles
  for each row
  execute function public.trg_auto_friend_abroadster();

-- ---------------------------------------------------------------------------
-- 3) Invite seed: update App Store URL only (trigger for NEW profiles).
--    Do NOT backfill notifications to existing users.
-- ---------------------------------------------------------------------------
create or replace function public.seed_invite_friends_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, kind, title, body, data)
  select
    new.id,
    'invite_friends',
    'Invite your friends',
    'Create your first trip and bring your people onto Abroadster.',
    jsonb_build_object(
      'action', 'invite_friends',
      'appStoreUrl',
      'https://apps.apple.com/us/app/abroadster-student-network/id6800081262'
    )
  where not exists (
    select 1
    from public.notifications n
    where n.user_id = new.id
      and n.kind = 'invite_friends'
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Explorer score: expand school lookups; trip miles from abroad program
-- ---------------------------------------------------------------------------
create or replace function public.explorer_lookup_point(p_label text)
returns table (latitude double precision, longitude double precision)
language plpgsql
stable
as $$
declare
  q text := lower(trim(coalesce(p_label, '')));
begin
  if q = '' then return; end if;

  -- Abroad / host cities
  if q in ('london', 'london, uk', 'london, united kingdom')
     or q like 'london%' then
    latitude := 51.5074; longitude := -0.1278; return next; return;
  end if;
  if q like 'paris%' then latitude := 48.8566; longitude := 2.3522; return next; return; end if;
  if q like 'rome%' then latitude := 41.9028; longitude := 12.4964; return next; return; end if;
  if q like 'barcelona%' then latitude := 41.3874; longitude := 2.1686; return next; return; end if;
  if q like 'budapest%' then latitude := 47.4979; longitude := 19.0402; return next; return; end if;
  -- Florence city (not Florence-Darlington Technical College)
  if q = 'florence' or q = 'florence, italy' or q like 'florence, it%' then
    latitude := 43.7696; longitude := 11.2558; return next; return;
  end if;
  if q like 'madrid%' then latitude := 40.4168; longitude := -3.7038; return next; return; end if;
  if q like 'berlin%' then latitude := 52.52; longitude := 13.405; return next; return; end if;
  if q like 'amsterdam%' then latitude := 52.3676; longitude := 4.9041; return next; return; end if;
  if q like 'athens%' then latitude := 37.9838; longitude := 23.7275; return next; return; end if;
  if q like 'lisbon%' then latitude := 38.7223; longitude := -9.1393; return next; return; end if;
  if q like 'prague%' then latitude := 50.0755; longitude := 14.4378; return next; return; end if;
  if q like 'vienna%' then latitude := 48.2082; longitude := 16.3738; return next; return; end if;
  if q like 'nice%' then latitude := 43.7102; longitude := 7.262; return next; return; end if;
  if q like 'santorini%' then latitude := 36.3932; longitude := 25.4615; return next; return; end if;
  if q like 'copenhagen%' then latitude := 55.6761; longitude := 12.5683; return next; return; end if;
  if q like 'dublin%' then latitude := 53.3498; longitude := -6.2603; return next; return; end if;
  if q like 'ibiza%' or q like 'eivissa%' then
    latitude := 38.9067; longitude := 1.4206; return next; return;
  end if;
  if q like 'como%' then latitude := 45.8081; longitude := 9.0852; return next; return; end if;

  -- Programs
  if q like '%nyu%london%' or q = 'nyu in london' or q = 'nyu london' then
    latitude := 51.5155; longitude := -0.141; return next; return;
  end if;
  if q like '%nyu%paris%' then latitude := 48.8495; longitude := 2.343; return next; return; end if;
  if q like '%nyu%florence%' then latitude := 43.7696; longitude := 11.2558; return next; return; end if;
  if q like '%ciee%paris%' then latitude := 48.8738; longitude := 2.295; return next; return; end if;
  if q like '%ciee%barcelona%' then latitude := 41.3874; longitude := 2.1686; return next; return; end if;
  if q like '%ciee%dublin%' then latitude := 53.3498; longitude := -6.2603; return next; return; end if;
  if q like '%ies%paris%' then latitude := 48.846; longitude := 2.37; return next; return; end if;
  if q like '%syracuse%florence%' then latitude := 43.7731; longitude := 11.256; return next; return; end if;
  if q like '%cea%barcelona%' then latitude := 41.3874; longitude := 2.1686; return next; return; end if;
  if q like '%dis%copenhagen%' then latitude := 55.6761; longitude := 12.5683; return next; return; end if;

  -- US campuses (expanded)
  if q like '%duke%' then latitude := 36.0014; longitude := -78.9382; return next; return; end if;
  if q like '%indiana%' then latitude := 39.1682; longitude := -86.523; return next; return; end if;
  if q like '%syracuse%' then latitude := 43.0392; longitude := -76.1351; return next; return; end if;
  if q like '%ut austin%' or q like '%university of texas%' or q = 'ut austin' then
    latitude := 30.2849; longitude := -97.7341; return next; return;
  end if;
  if q = 'ucla' or q like '%university of california, los angeles%' then
    latitude := 34.0689; longitude := -118.4452; return next; return;
  end if;
  if q like '%michigan%' then latitude := 42.278; longitude := -83.7382; return next; return; end if;
  if q like '%boston university%' then latitude := 42.3505; longitude := -71.1054; return next; return; end if;
  if q like '%cu boulder%' or q like '%colorado boulder%' then
    latitude := 40.0076; longitude := -105.2659; return next; return;
  end if;
  if q = 'nyu' or q like 'new york university%' then
    latitude := 40.7295; longitude := -73.9965; return next; return;
  end if;
  if q like '%richmond%' then latitude := 37.5735; longitude := -77.539; return next; return; end if;
  if q like '%cornell%' then latitude := 42.4534; longitude := -76.4735; return next; return; end if;
  if q like '%northwestern%' then latitude := 42.0565; longitude := -87.6753; return next; return; end if;
  if q like '%penn state%' or q like '%pennsylvania state%' then
    latitude := 40.7982; longitude := -77.8599; return next; return;
  end if;
  if q like '%georgia tech%' then latitude := 33.7756; longitude := -84.3963; return next; return; end if;
  if q like '%usc%' or q like '%southern california%' then
    latitude := 34.0224; longitude := -118.2851; return next; return;
  end if;
  if q like '%utica%' then latitude := 43.1009; longitude := -75.2327; return next; return; end if;

  -- study_programs table
  begin
    select sp.latitude, sp.longitude into latitude, longitude
    from public.study_programs sp
    where sp.is_active
      and (
        lower(sp.name) = q
        or lower(sp.short_name) = q
        or lower(sp.name) like '%' || q || '%'
        or q like '%' || lower(sp.short_name) || '%'
      )
      and sp.latitude is not null
      and sp.longitude is not null
    order by case when lower(sp.name) = q then 0 else 1 end
    limit 1;
    if latitude is not null then return next; return; end if;
  exception when others then
    null;
  end;

  -- school_institutions if present
  begin
    select si.latitude, si.longitude into latitude, longitude
    from public.school_institutions si
    where (
      lower(si.name) = q
      or lower(si.name) like '%' || q || '%'
      or q like '%' || lower(si.name) || '%'
    )
      and si.latitude is not null
      and si.longitude is not null
    order by case when lower(si.name) = q then 0 else 1 end
    limit 1;
    if latitude is not null then return next; return; end if;
  exception when others then
    null;
  end;
end;
$$;

create or replace function public.recompute_explorer_score(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  home_lat double precision;
  home_lng double precision;
  abroad_lat double precision;
  abroad_lng double precision;
  origin_lat double precision;
  origin_lng double precision;
  total int := 0;
  leg double precision;
  dest record;
begin
  select * into p from public.profiles where id = p_user_id;
  if not found then return 0; end if;

  select e.latitude, e.longitude into home_lat, home_lng
  from public.explorer_lookup_point(p.home_university) e
  limit 1;

  select e.latitude, e.longitude into abroad_lat, abroad_lng
  from public.explorer_lookup_point(p.study_abroad_program) e
  limit 1;

  -- Baseline: home school → abroad program (straight-line miles)
  if home_lat is not null and abroad_lat is not null then
    total := total + round(public.distance_miles(home_lat, home_lng, abroad_lat, abroad_lng))::int;
  end if;

  -- Trip legs: from abroad program (fallback host city) → each unique trip destination
  origin_lat := abroad_lat;
  origin_lng := abroad_lng;

  if origin_lat is null then
    select e.latitude, e.longitude into origin_lat, origin_lng
    from public.explorer_lookup_point(
      trim(coalesce(p.host_city, '') || case
        when coalesce(p.host_country, '') <> '' then ', ' || p.host_country
        else ''
      end)
    ) e
    limit 1;
  end if;

  if p.host_latitude is not null and p.host_longitude is not null and origin_lat is null then
    origin_lat := p.host_latitude;
    origin_lng := p.host_longitude;
  end if;

  if origin_lat is not null then
    for dest in
      select distinct on (lower(trim(t.destination_city)), lower(trim(coalesce(t.destination_country, ''))))
        t.destination_city,
        t.destination_country,
        t.latitude,
        t.longitude
      from public.trips t
      join public.trip_members tm on tm.trip_id = t.id
      where tm.user_id = p_user_id
        and t.status = 'upcoming'
      order by lower(trim(t.destination_city)), lower(trim(coalesce(t.destination_country, ''))), t.created_at desc nulls last
    loop
      if dest.latitude is not null and dest.longitude is not null then
        leg := public.distance_miles(origin_lat, origin_lng, dest.latitude, dest.longitude);
      else
        select public.distance_miles(origin_lat, origin_lng, e.latitude, e.longitude)
        into leg
        from public.explorer_lookup_point(
          trim(dest.destination_city || case
            when coalesce(dest.destination_country, '') <> '' then ', ' || dest.destination_country
            else ''
          end)
        ) e
        limit 1;
      end if;
      if leg is not null then
        total := total + round(leg)::int;
      end if;
    end loop;
  end if;

  update public.profiles
  set explorer_score_miles = greatest(0, total)
  where id = p_user_id;

  return greatest(0, total);
end;
$$;

grant execute on function public.recompute_explorer_score(uuid) to authenticated;

-- Recompute for all users so scores pick up improved lookups (no notifications).
do $$
declare
  r record;
begin
  for r in select id from public.profiles loop
    perform public.recompute_explorer_score(r.id);
  end loop;
end;
$$;
