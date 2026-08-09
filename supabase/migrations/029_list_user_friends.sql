-- Public Instagram-style "following" list: anyone can see who a user has added.
-- Uses SECURITY DEFINER so we don't open all friendship rows via RLS.

create or replace function public.list_user_friends(p_user_id uuid)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  full_name text,
  avatar_url text,
  home_university text,
  study_abroad_program text,
  host_city text,
  host_country text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.first_name,
    p.last_name,
    p.full_name,
    p.avatar_url,
    p.home_university,
    p.study_abroad_program,
    p.host_city,
    p.host_country
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  where f.user_id = p_user_id
  order by lower(coalesce(p.full_name, p.first_name, '')) asc;
$$;

create or replace function public.count_user_friends(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.friendships
  where user_id = p_user_id;
$$;

grant execute on function public.list_user_friends(uuid) to authenticated;
grant execute on function public.count_user_friends(uuid) to authenticated;
