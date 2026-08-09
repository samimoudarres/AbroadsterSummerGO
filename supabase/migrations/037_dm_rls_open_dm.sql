-- DM threads/participants: RLS was enabled with no policies, so AirMail
-- open/insert failed for every signed-in user. Fix policies + open_dm RPC.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
drop policy if exists "dm_threads select participants" on public.dm_threads;
create policy "dm_threads select participants" on public.dm_threads
  for select using (
    exists (
      select 1 from public.dm_participants p
      where p.thread_id = dm_threads.id and p.user_id = auth.uid()
    )
  );

drop policy if exists "dm_threads insert authenticated" on public.dm_threads;
create policy "dm_threads insert authenticated" on public.dm_threads
  for insert with check (auth.uid() is not null);

drop policy if exists "dm_threads update participants" on public.dm_threads;
create policy "dm_threads update participants" on public.dm_threads
  for update using (
    exists (
      select 1 from public.dm_participants p
      where p.thread_id = dm_threads.id and p.user_id = auth.uid()
    )
  );

drop policy if exists "dm_participants select own threads" on public.dm_participants;
create policy "dm_participants select own threads" on public.dm_participants
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.dm_participants p2
      where p2.thread_id = dm_participants.thread_id
        and p2.user_id = auth.uid()
    )
  );

drop policy if exists "dm_participants insert self" on public.dm_participants;
create policy "dm_participants insert self" on public.dm_participants
  for insert with check (
    auth.uid() is not null
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.dm_participants p
        where p.thread_id = dm_participants.thread_id
          and p.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- open_dm — create or reuse a 1:1 thread (security definer avoids insert races)
-- ---------------------------------------------------------------------------
create or replace function public.open_dm(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing uuid;
  tid uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_other_user_id is null or p_other_user_id = me then
    raise exception 'Invalid recipient';
  end if;

  select t.id into existing
  from public.dm_threads t
  where exists (
      select 1 from public.dm_participants a
      where a.thread_id = t.id and a.user_id = me
    )
    and exists (
      select 1 from public.dm_participants b
      where b.thread_id = t.id and b.user_id = p_other_user_id
    )
    and (
      select count(*) from public.dm_participants p where p.thread_id = t.id
    ) = 2
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into public.dm_threads default values
  returning id into tid;

  insert into public.dm_participants(thread_id, user_id)
  values (tid, me), (tid, p_other_user_id);

  return tid;
end;
$$;

grant execute on function public.open_dm(uuid) to authenticated;
