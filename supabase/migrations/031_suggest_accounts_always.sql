-- Always return suggested accounts: prioritize same program / home school /
-- mutuals (esp. mutuals at those schools), then fill with general profiles.
-- Note: RETURNS TABLE column names become PL/pgSQL vars — always qualify
-- profile columns with a table alias to avoid "ambiguous column" errors.

drop function if exists public.suggest_accounts(int);

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
  shared_friends int,
  reason text
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

  select pr.home_university, pr.study_abroad_program, pr.host_city
    into my_home, my_abroad, my_host
  from public.profiles pr
  where pr.id = me;

  return query
  with my_friends as (
    select f.friend_id as id from public.friendships f where f.user_id = me
  ),
  my_cities as (
    select lower(trim(c.city_name)) as city
    from public.passport_city_ranks c
    where c.user_id = me and c.city_name is not null
  ),
  my_communities as (
    select cm.community_id
    from public.community_members cm
    where cm.user_id = me
  ),
  candidates as (
    select
      p.id as cand_id,
      p.first_name as cand_first,
      p.last_name as cand_last,
      p.full_name as cand_full,
      p.avatar_url as cand_avatar,
      p.home_university as cand_home,
      p.study_abroad_program as cand_abroad,
      p.host_city as cand_host_city,
      p.host_country as cand_host_country,
      (
        case when my_home is not null and length(trim(my_home)) > 0
          and length(trim(coalesce(p.home_university, ''))) > 0
          and (
            lower(trim(p.home_university)) = lower(trim(my_home))
            or lower(trim(p.home_university)) like '%' || lower(trim(my_home)) || '%'
            or lower(trim(my_home)) like '%' || lower(trim(p.home_university)) || '%'
          ) then 100 else 0 end
        +
        case when my_abroad is not null and length(trim(my_abroad)) > 0
          and length(trim(coalesce(p.study_abroad_program, ''))) > 0
          and (
            lower(trim(p.study_abroad_program)) = lower(trim(my_abroad))
            or lower(trim(p.study_abroad_program)) like '%' || lower(trim(my_abroad)) || '%'
            or lower(trim(my_abroad)) like '%' || lower(trim(p.study_abroad_program)) || '%'
          ) then 95 else 0 end
        +
        coalesce((
          select count(*)::int * 30
          from public.friendships f
          where f.user_id = p.id
            and f.friend_id in (select mf.id from my_friends mf)
        ), 0)
        +
        coalesce((
          select count(*)::int * 40
          from public.friendships f
          join public.profiles fp on fp.id = f.friend_id
          where f.user_id = p.id
            and f.friend_id in (select mf.id from my_friends mf)
            and my_home is not null and length(trim(my_home)) > 0
            and length(trim(coalesce(fp.home_university, ''))) > 0
            and (
              lower(trim(fp.home_university)) = lower(trim(my_home))
              or lower(trim(fp.home_university)) like '%' || lower(trim(my_home)) || '%'
              or lower(trim(my_home)) like '%' || lower(trim(fp.home_university)) || '%'
            )
        ), 0)
        +
        coalesce((
          select count(*)::int * 40
          from public.friendships f
          join public.profiles fp on fp.id = f.friend_id
          where f.user_id = p.id
            and f.friend_id in (select mf.id from my_friends mf)
            and my_abroad is not null and length(trim(my_abroad)) > 0
            and length(trim(coalesce(fp.study_abroad_program, ''))) > 0
            and (
              lower(trim(fp.study_abroad_program)) = lower(trim(my_abroad))
              or lower(trim(fp.study_abroad_program)) like '%' || lower(trim(my_abroad)) || '%'
              or lower(trim(my_abroad)) like '%' || lower(trim(fp.study_abroad_program)) || '%'
            )
        ), 0)
        +
        case when exists (
          select 1
          from public.community_members cm
          where cm.user_id = p.id
            and cm.community_id in (select mc.community_id from my_communities mc)
        ) then 55 else 0 end
        +
        case when my_host is not null and length(trim(my_host)) > 0
          and lower(trim(coalesce(p.host_city, ''))) = lower(trim(my_host))
          then 35 else 0 end
        +
        coalesce((
          select count(*)::int * 12
          from public.passport_city_ranks c
          where c.user_id = p.id
            and lower(trim(c.city_name)) in (select mc.city from my_cities mc)
        ), 0)
        + 1
      )::int as cand_score,
      coalesce((
        select count(*)::int
        from public.friendships f
        where f.user_id = p.id
          and f.friend_id in (select mf.id from my_friends mf)
      ), 0) as cand_shared
    from public.profiles p
    where p.id <> me
      and p.id not in (select mf.id from my_friends mf)
  )
  select
    c.cand_id,
    c.cand_first,
    c.cand_last,
    c.cand_full,
    c.cand_avatar,
    c.cand_home,
    c.cand_abroad,
    c.cand_host_city,
    c.cand_host_country,
    c.cand_score,
    c.cand_shared,
    case
      when my_abroad is not null and length(trim(my_abroad)) > 0
        and length(trim(coalesce(c.cand_abroad, ''))) > 0
        and (
          lower(trim(c.cand_abroad)) = lower(trim(my_abroad))
          or lower(trim(c.cand_abroad)) like '%' || lower(trim(my_abroad)) || '%'
          or lower(trim(my_abroad)) like '%' || lower(trim(c.cand_abroad)) || '%'
        ) then 'Same study abroad program'
      when my_home is not null and length(trim(my_home)) > 0
        and length(trim(coalesce(c.cand_home, ''))) > 0
        and (
          lower(trim(c.cand_home)) = lower(trim(my_home))
          or lower(trim(c.cand_home)) like '%' || lower(trim(my_home)) || '%'
          or lower(trim(my_home)) like '%' || lower(trim(c.cand_home)) || '%'
        ) then 'Same home school'
      when c.cand_shared > 0 then
        c.cand_shared::text || ' mutual friend' ||
        case when c.cand_shared = 1 then '' else 's' end
      when exists (
        select 1 from public.community_members cm
        where cm.user_id = c.cand_id
          and cm.community_id in (select mc.community_id from my_communities mc)
      ) then 'From your school communities'
      else 'Suggested for you'
    end
  from candidates c
  order by c.cand_score desc, c.cand_full asc nulls last
  limit p_limit;
end;
$$;

grant execute on function public.suggest_accounts(int) to authenticated;
