-- Create post: collage/carousel metadata, tags, audience, storage, RPC
-- Run after 010_home_feed.sql

-- ---------------------------------------------------------------------------
-- Extend posts
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists display_mode text not null default 'carousel'
    check (display_mode in ('carousel', 'collage'));

alter table public.posts
  add column if not exists collage_layout_id text;

alter table public.posts
  add column if not exists audience text not null default 'all'
    check (audience in ('all', 'friends', 'communities'));

alter table public.posts
  add column if not exists tagged_trip_id uuid references public.trips(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Extend post_photos with crop transforms
-- ---------------------------------------------------------------------------
alter table public.post_photos
  add column if not exists crop_json jsonb;

-- ---------------------------------------------------------------------------
-- post_tags
-- ---------------------------------------------------------------------------
create table if not exists public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_tags_user_idx on public.post_tags (user_id);

alter table public.post_tags enable row level security;

drop policy if exists "post_tags read" on public.post_tags;
create policy "post_tags read" on public.post_tags for select using (true);

drop policy if exists "post_tags insert author" on public.post_tags;
create policy "post_tags insert author" on public.post_tags
  for insert with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

drop policy if exists "post_tags delete author" on public.post_tags;
create policy "post_tags delete author" on public.post_tags
  for delete using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- post_audience_communities
-- ---------------------------------------------------------------------------
create table if not exists public.post_audience_communities (
  post_id uuid not null references public.posts(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  primary key (post_id, community_id)
);

alter table public.post_audience_communities enable row level security;

drop policy if exists "post_audience_communities read" on public.post_audience_communities;
create policy "post_audience_communities read" on public.post_audience_communities
  for select using (true);

drop policy if exists "post_audience_communities insert author" on public.post_audience_communities;
create policy "post_audience_communities insert author" on public.post_audience_communities
  for insert with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

drop policy if exists "post_audience_communities delete author" on public.post_audience_communities;
create policy "post_audience_communities delete author" on public.post_audience_communities
  for delete using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: post-photos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('post-photos', 'post-photos', true)
on conflict (id) do nothing;

drop policy if exists "post photos public read" on storage.objects;
create policy "post photos public read"
  on storage.objects for select
  using (bucket_id = 'post-photos');

drop policy if exists "post photos auth upload" on storage.objects;
create policy "post photos auth upload"
  on storage.objects for insert
  with check (
    bucket_id = 'post-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "post photos auth update" on storage.objects;
create policy "post photos auth update"
  on storage.objects for update
  using (
    bucket_id = 'post-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "post photos auth delete" on storage.objects;
create policy "post photos auth delete"
  on storage.objects for delete
  using (
    bucket_id = 'post-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- create_post RPC
-- p_photos: jsonb array of { image_url, sort_order, crop_json? }
-- p_tagged_user_ids: uuid[]
-- p_audience_community_ids: uuid[]
-- ---------------------------------------------------------------------------
create or replace function public.create_post(
  p_caption text,
  p_location_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_display_mode text,
  p_collage_layout_id text,
  p_audience text,
  p_tagged_trip_id uuid,
  p_photos jsonb,
  p_tagged_user_ids uuid[],
  p_audience_community_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
  new_id uuid;
  photo jsonb;
  tid uuid;
  cid uuid;
  result jsonb;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_location_label is null or char_length(trim(p_location_label)) = 0 then
    raise exception 'Location is required';
  end if;
  if p_display_mode is null or p_display_mode not in ('carousel', 'collage') then
    raise exception 'Invalid display_mode';
  end if;
  if p_audience is null or p_audience not in ('all', 'friends', 'communities') then
    raise exception 'Invalid audience';
  end if;
  if p_photos is null or jsonb_array_length(p_photos) = 0 then
    raise exception 'At least one photo is required';
  end if;

  select coalesce(full_name, first_name, 'Someone') into my_name
  from public.profiles where id = me;

  insert into public.posts (
    author_id, caption, location_label, latitude, longitude,
    display_mode, collage_layout_id, audience, tagged_trip_id
  ) values (
    me,
    coalesce(p_caption, ''),
    trim(p_location_label),
    p_latitude,
    p_longitude,
    p_display_mode,
    p_collage_layout_id,
    p_audience,
    p_tagged_trip_id
  )
  returning id into new_id;

  for photo in select * from jsonb_array_elements(p_photos)
  loop
    insert into public.post_photos (post_id, image_url, sort_order, crop_json)
    values (
      new_id,
      photo->>'image_url',
      coalesce((photo->>'sort_order')::int, 0),
      photo->'crop_json'
    );
  end loop;

  if p_tagged_user_ids is not null then
    foreach tid in array p_tagged_user_ids
    loop
      if tid is null or tid = me then continue; end if;
      insert into public.post_tags (post_id, user_id)
      values (new_id, tid)
      on conflict do nothing;
      insert into public.notifications (user_id, kind, title, body, data)
      values (
        tid,
        'post_tagged',
        'Tagged in a post',
        my_name || ' tagged you in a post',
        jsonb_build_object('postId', new_id, 'fromUserId', me)
      );
    end loop;
  end if;

  if p_audience = 'communities' and p_audience_community_ids is not null then
    foreach cid in array p_audience_community_ids
    loop
      if cid is null then continue; end if;
      insert into public.post_audience_communities (post_id, community_id)
      values (new_id, cid)
      on conflict do nothing;
    end loop;
  end if;

  select jsonb_build_object(
    'id', p.id,
    'author_id', p.author_id,
    'caption', p.caption,
    'location_label', p.location_label,
    'latitude', p.latitude,
    'longitude', p.longitude,
    'created_at', p.created_at,
    'display_mode', p.display_mode,
    'collage_layout_id', p.collage_layout_id,
    'audience', p.audience,
    'tagged_trip_id', p.tagged_trip_id,
    'stamp_count', 0,
    'i_stamped', false,
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
    'stamper_preview_ids', '[]'::jsonb
  )
  into result
  from public.posts p
  where p.id = new_id;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_home_feed with audience filter
-- ---------------------------------------------------------------------------
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
        case when exists (
          select 1 from public.friendships f
          where f.user_id = me and f.friend_id = p.author_id
        ) then 1000 else 0 end
        + case when a.study_abroad_program = my_abroad then 400 else 0 end
        + case when a.home_university = my_home then 200 else 0 end
        + case when exists (
          select 1 from public.friendships f1
          join public.friendships f2 on f1.friend_id = f2.friend_id
          where f1.user_id = me and f2.user_id = p.author_id
            and f1.friend_id <> me and f1.friend_id <> p.author_id
        ) then 150 else 0 end
        + coalesce(sc.cnt, 0) * 5
        + greatest(0, 200 - extract(epoch from (now() - p.created_at)) / 3600.0)
      ) as score
    from public.posts p
    join public.profiles a on a.id = p.author_id
    left join lateral (
      select count(*)::int as cnt from public.post_stamps s where s.post_id = p.id
    ) sc on true
    where
      p.author_id = me
      or coalesce(p.audience, 'all') = 'all'
      or (
        p.audience = 'friends'
        and exists (
          select 1 from public.friendships f
          where f.user_id = me and f.friend_id = p.author_id
        )
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
