-- List everyone who stamped a post (Instagram-style likers sheet).
create or replace function public.list_post_stampers(p_post_id uuid)
returns table (
  user_id uuid,
  stamped_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, s.created_at as stamped_at
  from public.post_stamps s
  where s.post_id = p_post_id
  order by s.created_at desc;
$$;

grant execute on function public.list_post_stampers(uuid) to anon, authenticated;
