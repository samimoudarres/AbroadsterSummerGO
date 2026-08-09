-- Schools + study-abroad catalog (home institutions + map program pins).
-- Institutions are searchable (profile / filters); only study_programs get map pins.

create extension if not exists pg_trgm;

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  country text not null default '',
  state text,
  domains text[] not null default '{}',
  website text,
  logo_url text,
  accent_hex text not null default '#0051FF',
  kind text not null default 'university',
  source text not null default 'hipo',
  search_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists institutions_name_idx on public.institutions (name);
create index if not exists institutions_search_gin
  on public.institutions using gin (search_name gin_trgm_ops);
create index if not exists institutions_country_idx on public.institutions (country);

create table if not exists public.study_programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text not null,
  provider text not null default '',
  city text not null,
  country text not null,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  domains text[] not null default '{}',
  logo_url text,
  accent_hex text not null default '#0051FF',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists study_programs_active_idx
  on public.study_programs (is_active) where is_active;
create index if not exists study_programs_city_idx
  on public.study_programs (city, country);
create index if not exists study_programs_name_idx on public.study_programs (name);
create index if not exists study_programs_name_search_gin
  on public.study_programs using gin (name gin_trgm_ops);

alter table public.institutions enable row level security;
alter table public.study_programs enable row level security;

drop policy if exists "institutions public read" on public.institutions;
create policy "institutions public read" on public.institutions
  for select using (true);

drop policy if exists "study_programs public read" on public.study_programs;
create policy "study_programs public read" on public.study_programs
  for select using (true);

-- Autocomplete for profile / map school filter
create or replace function public.search_institutions(q text, lim int default 20)
returns table (
  id uuid,
  slug text,
  name text,
  country text,
  state text,
  domains text[],
  website text,
  logo_url text,
  accent_hex text,
  kind text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    i.slug,
    i.name,
    i.country,
    i.state,
    i.domains,
    i.website,
    i.logo_url,
    i.accent_hex,
    i.kind
  from public.institutions i
  where
    length(trim(coalesce(q, ''))) >= 1
    and (
      i.search_name like '%' || lower(trim(q)) || '%'
      or i.name ilike '%' || trim(q) || '%'
    )
  order by
    case when lower(i.name) = lower(trim(q)) then 0
         when lower(i.name) like lower(trim(q)) || '%' then 1
         else 2 end,
    i.name
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;

grant execute on function public.search_institutions(text, int) to anon, authenticated;

-- All active study-abroad programs for map pins
create or replace function public.list_study_programs()
returns table (
  id uuid,
  slug text,
  name text,
  short_name text,
  provider text,
  city text,
  country text,
  latitude double precision,
  longitude double precision,
  address text,
  domains text[],
  logo_url text,
  accent_hex text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.slug,
    p.name,
    p.short_name,
    p.provider,
    p.city,
    p.country,
    p.latitude,
    p.longitude,
    p.address,
    p.domains,
    p.logo_url,
    p.accent_hex
  from public.study_programs p
  where p.is_active
  order by p.country, p.city, p.name;
$$;

grant execute on function public.list_study_programs() to anon, authenticated;
