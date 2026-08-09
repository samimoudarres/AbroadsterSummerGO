-- Chat: membership helpers that bypass RLS recursion so recipients can read messages.
-- Posts: update/delete RPCs. Blocks: bidirectional helper + feed filtering.

create or replace function public.is_dm_participant(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dm_participants
    where thread_id = p_thread_id and user_id = auth.uid()
  );
$$;

create or replace function public.users_blocked_either(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

grant execute on function public.is_dm_participant(uuid) to authenticated;
grant execute on function public.users_blocked_either(uuid, uuid) to authenticated;

-- IDs of users blocked in either direction with the current user (for feed/search filters)
create or replace function public.list_blocked_either_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select blocked_id from public.user_blocks where blocker_id = auth.uid()
  union
  select blocker_id from public.user_blocks where blocked_id = auth.uid();
$$;

grant execute on function public.list_blocked_either_ids() to authenticated;

drop policy if exists "messages read channel members" on public.messages;
create policy "messages read channel members" on public.messages
  for select using (
    sender_id = auth.uid()
    or (
      channel_id is not null
      and exists (
        select 1 from public.channels c
        where c.id = channel_id
          and (
            (c.community_id is not null and public.is_community_member(c.community_id))
            or (c.trip_id is not null and public.is_trip_member(c.trip_id))
          )
      )
    )
    or (
      dm_thread_id is not null
      and public.is_dm_participant(dm_thread_id)
    )
  );

-- Recipients must be able to see reactions on messages they can read
drop policy if exists "reactions all members" on public.message_reactions;
drop policy if exists "message_reactions read" on public.message_reactions;
drop policy if exists "message_reactions write own" on public.message_reactions;
create policy "message_reactions read" on public.message_reactions
  for select using (true);
create policy "message_reactions write own" on public.message_reactions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Posts: delete + update
-- ---------------------------------------------------------------------------
create or replace function public.delete_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  author uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select author_id into author from public.posts where id = p_post_id;
  if author is null then raise exception 'Post not found'; end if;
  if author <> me then raise exception 'Not allowed'; end if;

  delete from public.post_stamps where post_id = p_post_id;
  delete from public.post_tags where post_id = p_post_id;
  delete from public.post_audience_communities where post_id = p_post_id;
  delete from public.post_photos where post_id = p_post_id;
  update public.messages set post_id = null where post_id = p_post_id;
  delete from public.posts where id = p_post_id;
end;
$$;

grant execute on function public.delete_post(uuid) to authenticated;

create or replace function public.update_post(
  p_post_id uuid,
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
  author uuid;
  photo jsonb;
  i int := 0;
  result jsonb;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select author_id into author from public.posts where id = p_post_id;
  if author is null then raise exception 'Post not found'; end if;
  if author <> me then raise exception 'Not allowed'; end if;

  update public.posts set
    caption = coalesce(p_caption, ''),
    location_label = p_location_label,
    latitude = p_latitude,
    longitude = p_longitude,
    display_mode = coalesce(nullif(p_display_mode, ''), display_mode),
    collage_layout_id = p_collage_layout_id,
    audience = coalesce(nullif(p_audience, ''), audience),
    tagged_trip_id = p_tagged_trip_id
  where id = p_post_id;

  if p_photos is not null and jsonb_typeof(p_photos) = 'array' and jsonb_array_length(p_photos) > 0 then
    delete from public.post_photos where post_id = p_post_id;
    for photo in select * from jsonb_array_elements(p_photos)
    loop
      insert into public.post_photos (post_id, image_url, sort_order, crop_json)
      values (
        p_post_id,
        photo->>'image_url',
        coalesce((photo->>'sort_order')::int, i),
        coalesce(photo->'crop_json', '{}'::jsonb)
      );
      i := i + 1;
    end loop;
  end if;

  delete from public.post_tags where post_id = p_post_id;
  if p_tagged_user_ids is not null then
    insert into public.post_tags (post_id, user_id)
    select p_post_id, unnest(p_tagged_user_ids)
    on conflict do nothing;
  end if;

  delete from public.post_audience_communities where post_id = p_post_id;
  if p_audience_community_ids is not null then
    insert into public.post_audience_communities (post_id, community_id)
    select p_post_id, unnest(p_audience_community_ids)
    on conflict do nothing;
  end if;

  select to_jsonb(p.*) into result from public.posts p where p.id = p_post_id;
  return result;
end;
$$;

grant execute on function public.update_post(
  uuid, text, text, double precision, double precision, text, text, text, uuid, jsonb, uuid[], uuid[]
) to authenticated;
