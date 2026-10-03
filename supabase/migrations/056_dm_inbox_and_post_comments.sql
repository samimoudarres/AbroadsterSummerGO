-- 056: DM inbox (previews + unread) + post comments
-- Apply in Supabase SQL editor if CLI/MCP unavailable.

-- ─── DM unread tracking ─────────────────────────────────────────────────────
alter table public.dm_participants
  add column if not exists last_read_at timestamptz;

update public.dm_participants
set last_read_at = coalesce(last_read_at, now())
where last_read_at is null;

create or replace function public.mark_dm_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  update public.dm_participants
  set last_read_at = now()
  where thread_id = p_thread_id
    and user_id = uid;

  -- Clear matching unread message notifications for this thread
  update public.notifications
  set read_at = coalesce(read_at, now())
  where user_id = uid
    and kind = 'dm_message'
    and read_at is null
    and (data->>'thread_id') = p_thread_id::text;
end;
$$;

grant execute on function public.mark_dm_thread_read(uuid) to authenticated;

-- One round-trip inbox: threads + preview + unread + other profile basics
create or replace function public.list_dm_inbox()
returns jsonb
language plpgsql
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
          coalesce(dt.updated_at, dp.last_read_at, now()) as updated_at,
          coalesce(
            (
              select left(coalesce(m.body, case m.kind
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
          p.first_name as other_first_name,
          p.last_name as other_last_name,
          trim(both from coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as other_full_name,
          p.avatar_url as other_avatar,
          p.home_university as other_home_university,
          p.study_abroad_program as other_study_abroad
        from public.dm_participants dp
        join public.dm_threads dt on dt.id = dp.thread_id
        join public.dm_participants other
          on other.thread_id = dp.thread_id and other.user_id <> uid
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

-- ─── Post comments ──────────────────────────────────────────────────────────
alter table public.posts
  add column if not exists comments_disabled boolean not null default false;

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at desc);

alter table public.post_comments enable row level security;

drop policy if exists "post comments select" on public.post_comments;
create policy "post comments select"
  on public.post_comments for select
  to authenticated
  using (true);

drop policy if exists "post comments insert own" on public.post_comments;
create policy "post comments insert own"
  on public.post_comments for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "post comments delete own" on public.post_comments;
create policy "post comments delete own"
  on public.post_comments for delete
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

create or replace function public.add_post_comment(p_post_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cleaned text := trim(p_body);
  row_rec public.post_comments%rowtype;
  author_name text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if cleaned is null or length(cleaned) = 0 then
    raise exception 'Comment cannot be empty';
  end if;
  if exists (
    select 1 from public.posts
    where id = p_post_id and comments_disabled = true
  ) then
    raise exception 'Comments are turned off for this post';
  end if;
  if not exists (select 1 from public.posts where id = p_post_id) then
    raise exception 'Post not found';
  end if;

  insert into public.post_comments (post_id, author_id, body)
  values (p_post_id, uid, cleaned)
  returning * into row_rec;

  select coalesce(nullif(trim(first_name || ' ' || last_name), ''), 'Someone')
  into author_name
  from public.profiles where id = uid;

  -- Notify post author (not self)
  insert into public.notifications (user_id, kind, title, body, data)
  select
    p.author_id,
    'post_commented',
    'New comment',
    left(author_name || ': ' || cleaned, 120),
    jsonb_build_object(
      'post_id', p_post_id,
      'comment_id', row_rec.id,
      'actor_id', uid
    )
  from public.posts p
  where p.id = p_post_id
    and p.author_id is distinct from uid;

  return jsonb_build_object(
    'id', row_rec.id,
    'post_id', row_rec.post_id,
    'author_id', row_rec.author_id,
    'body', row_rec.body,
    'created_at', row_rec.created_at
  );
end;
$$;

grant execute on function public.add_post_comment(uuid, text) to authenticated;

create or replace function public.list_post_comments(p_post_id uuid, p_limit int default 80)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at asc), '[]'::jsonb)
  into result
  from (
    select
      c.id,
      c.post_id,
      c.author_id,
      c.body,
      c.created_at,
      p.first_name as author_first_name,
      p.last_name as author_last_name,
      trim(both from coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as author_full_name,
      p.avatar_url as author_avatar
    from public.post_comments c
    left join public.profiles p on p.id = c.author_id
    where c.post_id = p_post_id
    order by c.created_at asc
    limit greatest(1, least(coalesce(p_limit, 80), 200))
  ) x;

  return result;
end;
$$;

grant execute on function public.list_post_comments(uuid, int) to authenticated;

create or replace function public.delete_post_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.post_comments c
  using public.posts p
  where c.id = p_comment_id
    and c.post_id = p.id
    and (c.author_id = auth.uid() or p.author_id = auth.uid());
end;
$$;

grant execute on function public.delete_post_comment(uuid) to authenticated;

create or replace function public.set_post_comments_disabled(
  p_post_id uuid,
  p_disabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.posts
  set comments_disabled = coalesce(p_disabled, false)
  where id = p_post_id
    and author_id = auth.uid();
end;
$$;

grant execute on function public.set_post_comments_disabled(uuid, boolean) to authenticated;

-- Feed rows include comment counts + disable flag
create or replace function public.list_home_feed(p_limit int default 30, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_home text;
  my_abroad text;
  result jsonb;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select home_university, study_abroad_program into my_home, my_abroad
  from public.profiles where id = me;

  select coalesce(jsonb_agg(row_data order by score desc, created_at desc), '[]'::jsonb)
  into result
  from (
    select
      jsonb_build_object(
        'id', p.id,
        'author_id', p.author_id,
        'caption', p.caption,
        'location_label', p.location_label,
        'latitude', p.latitude,
        'longitude', p.longitude,
        'created_at', p.created_at,
        'display_mode', coalesce(p.display_mode, 'carousel'),
        'collage_layout_id', p.collage_layout_id,
        'audience', coalesce(p.audience, 'all'),
        'tagged_trip_id', p.tagged_trip_id,
        'comments_disabled', coalesce(p.comments_disabled, false),
        'comment_count', coalesce(cc.cnt, 0),
        'comment_preview_body', cp.body,
        'comment_preview_author', cp.author_name,
        'stamp_count', coalesce(sc.cnt, 0),
        'i_stamped', exists (
          select 1 from public.post_stamps s where s.post_id = p.id and s.user_id = me
        ),
        'photo_urls', coalesce((
          select jsonb_agg(pp.image_url order by pp.sort_order)
          from public.post_photos pp where pp.post_id = p.id
        ), '[]'::jsonb),
        'photo_crops', coalesce((
          select jsonb_agg(coalesce(pp.crop_json, '{}'::jsonb) order by pp.sort_order)
          from public.post_photos pp where pp.post_id = p.id
        ), '[]'::jsonb),
        'tagged_user_ids', coalesce((
          select jsonb_agg(pt.user_id) from public.post_tags pt where pt.post_id = p.id
        ), '[]'::jsonb),
        'audience_community_ids', coalesce((
          select jsonb_agg(pac.community_id)
          from public.post_audience_communities pac where pac.post_id = p.id
        ), '[]'::jsonb),
        'stamper_preview_ids', coalesce((
          select jsonb_agg(x.user_id)
          from (
            select s.user_id from public.post_stamps s
            where s.post_id = p.id
            order by s.created_at desc
            limit 3
          ) x
        ), '[]'::jsonb)
      ) as row_data,
      p.created_at,
      (
        (1000.0 / (1.0 + (extract(epoch from (now() - p.created_at)) / 3600.0) / 12.0))
        + case
            when p.author_id = me
              and p.created_at > now() - interval '6 hours'
            then 2500
            when p.author_id = me then 600
            else 0
          end
        + case when exists (
            select 1 from public.friendships f
            where f.user_id = me and f.friend_id = p.author_id
          ) then 450 else 0 end
        + case when my_abroad is not null and length(trim(my_abroad)) > 0
            and a.study_abroad_program is not null
            and lower(trim(a.study_abroad_program)) = lower(trim(my_abroad))
          then 250 else 0 end
        + case when my_home is not null and length(trim(my_home)) > 0
            and a.home_university is not null
            and lower(trim(a.home_university)) = lower(trim(my_home))
          then 120 else 0 end
        + coalesce(sc.cnt, 0) * 4
      ) as score
    from public.posts p
    join public.profiles a on a.id = p.author_id
    left join lateral (
      select count(*)::int as cnt from public.post_stamps s where s.post_id = p.id
    ) sc on true
    left join lateral (
      select count(*)::int as cnt from public.post_comments c where c.post_id = p.id
    ) cc on true
    left join lateral (
      select
        c.body,
        coalesce(nullif(trim(pr.first_name || ' ' || pr.last_name), ''), 'Someone') as author_name
      from public.post_comments c
      left join public.profiles pr on pr.id = c.author_id
      where c.post_id = p.id
      order by c.created_at desc
      limit 1
    ) cp on true
    where
      p.author_id = me
      or (
        exists (
          select 1 from public.friendships f
          where f.user_id = me and f.friend_id = p.author_id
        )
        and coalesce(p.audience, 'all') in ('all', 'friends')
      )
      or (
        p.audience = 'communities'
        and exists (
          select 1
          from public.post_audience_communities pac
          join public.community_members cm on cm.community_id = pac.community_id
          where pac.post_id = p.id and cm.user_id = me
        )
      )
    order by score desc, p.created_at desc
    limit greatest(1, coalesce(p_limit, 30))
    offset greatest(0, coalesce(p_offset, 0))
  ) ranked;

  return result;
end;
$$;

grant execute on function public.list_home_feed(int, int) to authenticated;
