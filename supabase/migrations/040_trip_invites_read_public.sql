-- Pending invitees should be visible on trip traveler lists for everyone
-- (trips themselves are already publicly readable).

drop policy if exists "trip_invites read involved" on public.trip_invites;
create policy "trip_invites read involved" on public.trip_invites
  for select using (
    auth.uid() is not null
    and (
      auth.uid() = inviter_id
      or auth.uid() = invitee_id
      or exists (
        select 1 from public.trip_members m
        where m.trip_id = trip_invites.trip_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.trips t where t.id = trip_invites.trip_id
      )
    )
  );
