-- 055: Force-replace community_members / messages policies (054 RPCs work;
-- direct SELECT still recurses if old peer policy remains).

create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.community_members m
    where m.community_id = p_community_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id and tm.user_id = auth.uid()
  );
$$;

create or replace function public.is_dm_participant(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.dm_participants
    where thread_id = p_thread_id and user_id = auth.uid()
  );
$$;

alter function public.is_community_member(uuid) owner to postgres;
alter function public.is_trip_member(uuid) owner to postgres;
alter function public.is_dm_participant(uuid) owner to postgres;

grant execute on function public.is_community_member(uuid) to authenticated;
grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.is_dm_participant(uuid) to authenticated;

-- Drop EVERY select policy on community_members, then recreate non-recursive ones
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'community_members'
  loop
    execute format('drop policy if exists %I on public.community_members', r.policyname);
  end loop;
end $$;

create policy "community_members read own" on public.community_members
  for select using (user_id = auth.uid());
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

drop policy if exists "dm_participants select own threads" on public.dm_participants;
drop policy if exists "dm_participants select members" on public.dm_participants;
create policy "dm_participants select members" on public.dm_participants
  for select using (public.is_dm_participant(thread_id));
