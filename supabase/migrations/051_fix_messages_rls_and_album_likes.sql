-- Re-apply community_members RLS fix (infinite recursion breaks message send).
-- Safe to run even if 028 already applied.

create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_members m
    where m.community_id = p_community_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_community_member(uuid) from public;
grant execute on function public.is_community_member(uuid) to authenticated;
revoke all on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;

drop policy if exists "community_members read peers" on public.community_members;
create policy "community_members read peers" on public.community_members
  for select using (public.is_community_member(community_id));

drop policy if exists "communities read members" on public.communities;
create policy "communities read members" on public.communities
  for select using (public.is_community_member(id));

drop policy if exists "channels read members" on public.channels;
create policy "channels read members" on public.channels
  for select using (
    (community_id is not null and public.is_community_member(community_id))
    or (trip_id is not null and public.is_trip_member(trip_id))
  );

-- Keep messages readable for channel/DM members without recursive community_members RLS
drop policy if exists "messages read channel members" on public.messages;
create policy "messages read channel members" on public.messages
  for select using (
    (
      channel_id is not null
      and exists (
        select 1
        from public.channels c
        where c.id = channel_id
          and (
            (c.community_id is not null and public.is_community_member(c.community_id))
            or (c.trip_id is not null and public.is_trip_member(c.trip_id))
          )
      )
    )
    or (
      dm_thread_id is not null
      and exists (
        select 1
        from public.dm_participants p
        where p.thread_id = dm_thread_id
          and p.user_id = auth.uid()
      )
    )
    or sender_id = auth.uid()
  );

-- Album photo likes (Instagram-style heart on album viewer)
create table if not exists public.album_photo_likes (
  photo_id uuid not null references public.album_photos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

create index if not exists album_photo_likes_photo_idx
  on public.album_photo_likes (photo_id);

alter table public.album_photo_likes enable row level security;

drop policy if exists "album_photo_likes select" on public.album_photo_likes;
create policy "album_photo_likes select" on public.album_photo_likes
  for select using (true);

drop policy if exists "album_photo_likes insert own" on public.album_photo_likes;
create policy "album_photo_likes insert own" on public.album_photo_likes
  for insert with check (user_id = auth.uid());

drop policy if exists "album_photo_likes delete own" on public.album_photo_likes;
create policy "album_photo_likes delete own" on public.album_photo_likes
  for delete using (user_id = auth.uid());

create or replace function public.toggle_album_photo_like(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  liked boolean;
  cnt int;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_photo_id is null then raise exception 'Invalid photo'; end if;

  if exists (
    select 1 from public.album_photo_likes
    where photo_id = p_photo_id and user_id = me
  ) then
    delete from public.album_photo_likes
    where photo_id = p_photo_id and user_id = me;
    liked := false;
  else
    insert into public.album_photo_likes (photo_id, user_id)
    values (p_photo_id, me)
    on conflict do nothing;
    liked := true;
  end if;

  select count(*)::int into cnt
  from public.album_photo_likes
  where photo_id = p_photo_id;

  return jsonb_build_object('liked', liked, 'like_count', cnt);
end;
$$;

grant execute on function public.toggle_album_photo_like(uuid) to authenticated;
