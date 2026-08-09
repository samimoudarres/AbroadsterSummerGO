-- Abroadster: run 012 + 013 profile migrations in Supabase SQL Editor
-- Project: ajwnvwvpvasxkwpfdsvo

-- 012_profile_fields.sql
alter table public.profiles
  add column if not exists bio text,
  add column if not exists semester text,
  add column if not exists cities_visited integer not null default 0,
  add column if not exists countries_visited integer not null default 0;

comment on column public.profiles.bio is 'Short profile bio';
comment on column public.profiles.semester is 'Study-abroad semester label, e.g. Fall 2026';
comment on column public.profiles.cities_visited is 'Count of cities visited (shown on profile)';
comment on column public.profiles.countries_visited is 'Count of countries visited (passport)';

-- 013_list_author_albums.sql
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
  is_following boolean
)
language plpgsql
security definer
set search_path = public
as $$
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
    coalesce(
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
    ) as cover_urls,
    exists (
      select 1 from public.album_followers af
      where af.album_id = a.id and af.user_id = auth.uid()
    ) as is_following
  from public.trip_albums a
  join public.trips t on t.id = a.trip_id
  join public.trip_members tm on tm.trip_id = t.id and tm.user_id = p_user_id
  order by coalesce(t.date_start, t.created_at) desc nulls last
  limit greatest(1, least(coalesce(p_limit, 40), 80));
end;
$$;

grant execute on function public.list_author_albums(uuid, int) to authenticated;
