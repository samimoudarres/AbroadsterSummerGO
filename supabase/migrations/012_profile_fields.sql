-- Profile fields for Instagram-style profile (bio, semester, cities visited)

alter table public.profiles
  add column if not exists bio text,
  add column if not exists semester text,
  add column if not exists cities_visited integer not null default 0,
  add column if not exists countries_visited integer not null default 0;

comment on column public.profiles.bio is 'Short profile bio';
comment on column public.profiles.semester is 'Study-abroad semester label, e.g. Fall 2026';
comment on column public.profiles.cities_visited is 'Count of cities visited (shown on profile)';
comment on column public.profiles.countries_visited is 'Count of countries visited (passport)';
