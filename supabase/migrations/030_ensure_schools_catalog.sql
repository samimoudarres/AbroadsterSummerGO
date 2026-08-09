-- Ensure schools catalog exists (016 may not have been applied).
-- Harden coord resolvers so profile signup never fails if catalog is empty/missing.

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

-- Never fail signup/profile saves when catalog lookup misses.
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

  if to_regclass('public.study_programs') is null then
    return;
  end if;

  begin
    return query
      select p.latitude, p.longitude
      from public.study_programs p
      where lower(p.city) = lower(trim(p_city))
         or lower(p.city) like '%' || lower(trim(p_city)) || '%'
         or lower(trim(p_city)) like '%' || lower(p.city) || '%'
      order by case when lower(p.city) = lower(trim(p_city)) then 0 else 1 end
      limit 1;
  exception
    when undefined_table then
      return;
    when others then
      return;
  end;
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

  if to_regclass('public.study_programs') is null then
    return;
  end if;

  begin
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
  exception
    when undefined_table then
      return;
    when others then
      return;
  end;
end;
$$;

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

  begin
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
  exception
    when others then
      -- Never block profile create/update on coordinate enrichment.
      null;
  end;

  return NEW;
end;
$$;
