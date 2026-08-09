-- Ensure avatars bucket, passport RPC grants, and school community sync.
-- Safe to re-run (idempotent).

-- ── Avatars storage ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── Passport RPC grants (015 omitted these) ──────────────────────────────────
grant execute on function public.passport_country_key(text) to authenticated;
grant execute on function public.passport_refresh_profile_counts(uuid) to authenticated;
grant execute on function public.passport_apply_trip_unlock(uuid, uuid, text, text, double precision, double precision) to authenticated;
grant execute on function public.passport_ensure_host_city(uuid) to authenticated;
grant execute on function public.get_passport(uuid) to authenticated;
grant execute on function public.reorder_passport_cities(uuid[]) to authenticated;
grant execute on function public.add_passport_city(text, text, double precision, double precision) to authenticated;

-- ── Sync home/abroad communities to match profile schools ────────────────────
create or replace function public.sync_profile_communities(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := coalesce(p_user_id, auth.uid());
  p public.profiles%rowtype;
  abroad_id uuid;
  home_id uuid;
  abroad_name text;
  home_name text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  -- Session users may only sync their own communities
  if auth.uid() is not null and uid <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  select * into p from public.profiles where id = uid;
  if not found then return; end if;

  abroad_name := coalesce(nullif(trim(p.study_abroad_program), ''), 'Study Abroad');
  home_name := coalesce(nullif(trim(p.home_university), ''), 'Home University');

  abroad_id := public.ensure_community(
    abroad_name,
    'abroad',
    coalesce(nullif(trim(p.abroad_accent), ''), '#9B51E0')
  );
  home_id := public.ensure_community(
    home_name,
    'home',
    coalesce(nullif(trim(p.home_accent), ''), '#BF5700')
  );

  -- Refresh accent on existing communities
  update public.communities
  set accent = coalesce(nullif(trim(p.abroad_accent), ''), accent)
  where id = abroad_id;
  update public.communities
  set accent = coalesce(nullif(trim(p.home_accent), ''), accent)
  where id = home_id;

  insert into public.community_members(community_id, user_id)
  values (abroad_id, uid), (home_id, uid)
  on conflict do nothing;

  -- Leave other home/abroad school chats so pills match the profile
  delete from public.community_members cm
  using public.communities c
  where cm.community_id = c.id
    and cm.user_id = uid
    and c.kind in ('home', 'abroad')
    and cm.community_id not in (abroad_id, home_id);
end;
$$;

grant execute on function public.sync_profile_communities(uuid) to authenticated;

-- Keep communities in sync whenever school fields change
create or replace function public.handle_profile_schools_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.home_university is distinct from old.home_university
     or new.study_abroad_program is distinct from old.study_abroad_program
     or new.home_accent is distinct from old.home_accent
     or new.abroad_accent is distinct from old.abroad_accent then
    perform public.sync_profile_communities(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_schools_updated on public.profiles;
create trigger on_profile_schools_updated
  after update on public.profiles
  for each row execute function public.handle_profile_schools_updated();

-- Host passport when host city/country is set or changed
create or replace function public.handle_profile_host_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(new.host_city), '') <> ''
     and (
       new.host_city is distinct from old.host_city
       or new.host_country is distinct from old.host_country
     ) then
    perform public.passport_ensure_host_city(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_host_updated on public.profiles;
create trigger on_profile_host_updated
  after update on public.profiles
  for each row execute function public.handle_profile_host_updated();
