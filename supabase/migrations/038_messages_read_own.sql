-- Messages: sender can always read their own rows (RETURNING + getMessages).
-- INSERT only required sender_id = auth.uid(); SELECT needed membership and
-- could hide the just-inserted row, so the UI looked like send "vanished".

drop policy if exists "messages read channel members" on public.messages;
create policy "messages read channel members" on public.messages
  for select using (
    sender_id = auth.uid()
    or (
      channel_id is not null
      and exists (
        select 1
        from public.channels c
        where c.id = channel_id
          and (
            (
              c.community_id is not null
              and public.is_community_member(c.community_id)
            )
            or (
              c.trip_id is not null
              and public.is_trip_member(c.trip_id)
            )
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
  );

-- trip_members had RLS with no policies in some DBs — break trip chat reads
drop policy if exists "trip_members read" on public.trip_members;
create policy "trip_members read" on public.trip_members
  for select using (
    user_id = auth.uid()
    or public.is_trip_member(trip_id)
  );

drop policy if exists "trip_members insert self" on public.trip_members;
create policy "trip_members insert self" on public.trip_members
  for insert with check (
    user_id = auth.uid()
    or public.is_trip_member(trip_id)
  );
