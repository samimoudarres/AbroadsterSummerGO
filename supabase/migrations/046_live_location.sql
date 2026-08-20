-- Live device location (When-In-Use) separate from study-abroad host city.
alter table public.profiles
  add column if not exists live_latitude double precision,
  add column if not exists live_longitude double precision,
  add column if not exists live_location_label text,
  add column if not exists live_location_at timestamptz;

comment on column public.profiles.live_latitude is
  'Last When-In-Use GPS latitude published by the user; null if not sharing.';
comment on column public.profiles.live_location_label is
  'Reverse-geocoded city/country for the live pin (e.g. "Boston, United States").';
