-- Harden DM inbox so existing AirMail threads always return with preview + unread.

create or replace function public.list_dm_inbox()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(
    (
      select jsonb_agg(to_jsonb(t) order by t.updated_at desc)
      from (
        select
          dp.thread_id as id,
          other.user_id as other_user_id,
          coalesce(
            (
              select m.created_at
              from public.messages m
              where m.dm_thread_id = dp.thread_id
              order by m.created_at desc
              limit 1
            ),
            dt.updated_at,
            now()
          ) as updated_at,
          coalesce(
            (
              select left(coalesce(nullif(trim(m.body), ''), case m.kind
                when 'image' then 'Photo'
                when 'post' then 'Shared a post'
                when 'trip' then 'Shared a trip'
                when 'poll' then 'Poll'
                else 'Message'
              end), 120)
              from public.messages m
              where m.dm_thread_id = dp.thread_id
              order by m.created_at desc
              limit 1
            ),
            ''
          ) as last_preview,
          (
            select count(*)::int
            from public.messages m
            where m.dm_thread_id = dp.thread_id
              and m.sender_id is distinct from uid
              and m.created_at > coalesce(dp.last_read_at, '1970-01-01'::timestamptz)
          ) as unread_count,
          coalesce(p.first_name, '') as other_first_name,
          coalesce(p.last_name, '') as other_last_name,
          nullif(
            trim(both from coalesce(p.full_name, '')),
            ''
          ) as other_full_name,
          p.avatar_url as other_avatar,
          coalesce(p.home_university, '') as other_home_university,
          coalesce(p.study_abroad_program, '') as other_study_abroad
        from public.dm_participants dp
        join public.dm_threads dt on dt.id = dp.thread_id
        join public.dm_participants other
          on other.thread_id = dp.thread_id
         and other.user_id <> uid
        left join public.profiles p on p.id = other.user_id
        where dp.user_id = uid
      ) t
    ),
    '[]'::jsonb
  )
  into result;

  return result;
end;
$$;

grant execute on function public.list_dm_inbox() to authenticated;

-- Ensure last_read_at exists for unread counting
alter table public.dm_participants
  add column if not exists last_read_at timestamptz;
