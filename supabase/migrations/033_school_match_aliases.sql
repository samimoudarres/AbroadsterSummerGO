-- Stronger school/program matching for map filters (NYU London ↔ NYU in London)
-- + list/count RPCs that accept alias labels.

create or replace function public._school_normalize(t text)
returns text
language sql
immutable
as $$
  select trim(both ' ' from regexp_replace(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(t, ''))), '\m(in|at|the|of)\M', ' ', 'g'),
      '[^a-z0-9]+',
      ' ',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  ));
$$;

create or replace function public._school_label_matches(candidate text, needle text)
returns boolean
language sql
immutable
as $$
  select
    candidate is not null
    and needle is not null
    and length(public._school_normalize(candidate)) > 0
    and length(public._school_normalize(needle)) > 0
    and (
      public._school_normalize(candidate) = public._school_normalize(needle)
      or public._school_normalize(candidate) like '%' || public._school_normalize(needle) || '%'
      or public._school_normalize(needle) like '%' || public._school_normalize(candidate) || '%'
    );
$$;

drop function if exists public.count_students_at_school(text, text);
drop function if exists public.list_students_at_school(text, text, int);
-- Also drop older overload if present
drop function if exists public.count_students_at_school(text, text, text[]);
drop function if exists public.list_students_at_school(text, text, int, text[]);

create or replace function public.count_students_at_school(
  p_kind text,
  p_label text,
  p_aliases text[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  kind text := lower(trim(coalesce(p_kind, '')));
  label text := trim(coalesce(p_label, ''));
  aliases text[] := coalesce(p_aliases, array[]::text[]);
  n integer := 0;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if label = '' and coalesce(array_length(aliases, 1), 0) = 0 then
    return 0;
  end if;
  if kind not in ('program', 'university') then
    raise exception 'p_kind must be program or university';
  end if;

  -- Always include the primary label in the alias set
  if label <> '' then
    aliases := array_prepend(label, aliases);
  end if;

  if kind = 'program' then
    select count(*)::integer into n
    from public.profiles pr
    where exists (
      select 1
      from unnest(aliases) as a(alias)
      where public._school_label_matches(pr.study_abroad_program, a.alias)
    );
  else
    select count(*)::integer into n
    from public.profiles pr
    where exists (
      select 1
      from unnest(aliases) as a(alias)
      where public._school_label_matches(pr.home_university, a.alias)
    );
  end if;

  return coalesce(n, 0);
end;
$$;

create or replace function public.list_students_at_school(
  p_kind text,
  p_label text,
  p_limit int default 500,
  p_aliases text[] default null
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  full_name text,
  avatar_url text,
  home_university text,
  study_abroad_program text,
  host_city text,
  host_country text,
  host_latitude double precision,
  host_longitude double precision,
  semester text,
  bio text,
  is_verified_student boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  kind text := lower(trim(coalesce(p_kind, '')));
  label text := trim(coalesce(p_label, ''));
  aliases text[] := coalesce(p_aliases, array[]::text[]);
  lim int := coalesce(p_limit, 500);
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if label = '' and coalesce(array_length(aliases, 1), 0) = 0 then
    return;
  end if;
  if kind not in ('program', 'university') then
    raise exception 'p_kind must be program or university';
  end if;
  if lim < 1 then lim := 1; end if;
  if lim > 1000 then lim := 1000; end if;

  if label <> '' then
    aliases := array_prepend(label, aliases);
  end if;

  if kind = 'program' then
    return query
    select
      pr.id,
      pr.first_name,
      pr.last_name,
      pr.full_name,
      pr.avatar_url,
      pr.home_university,
      pr.study_abroad_program,
      pr.host_city,
      pr.host_country,
      pr.host_latitude,
      pr.host_longitude,
      pr.semester,
      pr.bio,
      coalesce(pr.is_verified_student, false) as is_verified_student
    from public.profiles pr
    where exists (
      select 1
      from unnest(aliases) as a(alias)
      where public._school_label_matches(pr.study_abroad_program, a.alias)
    )
    order by pr.full_name nulls last, pr.id
    limit lim;
  else
    return query
    select
      pr.id,
      pr.first_name,
      pr.last_name,
      pr.full_name,
      pr.avatar_url,
      pr.home_university,
      pr.study_abroad_program,
      pr.host_city,
      pr.host_country,
      pr.host_latitude,
      pr.host_longitude,
      pr.semester,
      pr.bio,
      coalesce(pr.is_verified_student, false) as is_verified_student
    from public.profiles pr
    where exists (
      select 1
      from unnest(aliases) as a(alias)
      where public._school_label_matches(pr.home_university, a.alias)
    )
    order by pr.full_name nulls last, pr.id
    limit lim;
  end if;
end;
$$;

grant execute on function public._school_normalize(text) to authenticated;
grant execute on function public._school_label_matches(text, text) to authenticated;
grant execute on function public.count_students_at_school(text, text, text[]) to authenticated;
grant execute on function public.list_students_at_school(text, text, int, text[]) to authenticated;
