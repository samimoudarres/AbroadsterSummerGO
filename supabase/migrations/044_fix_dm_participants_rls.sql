-- Fix infinite recursion on dm_participants RLS (SELECT policy queried itself).

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

grant execute on function public.is_dm_participant(uuid) to authenticated;

drop policy if exists "dm_participants select own threads" on public.dm_participants;
drop policy if exists "dm_participants select members" on public.dm_participants;
create policy "dm_participants select members" on public.dm_participants
  for select using (public.is_dm_participant(thread_id));

drop policy if exists "dm_participants insert self" on public.dm_participants;
create policy "dm_participants insert self" on public.dm_participants
  for insert with check (
    user_id = auth.uid()
    or public.is_dm_participant(thread_id)
  );
