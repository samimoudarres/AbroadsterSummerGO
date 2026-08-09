-- Avatar storage + auto-profile on signup (Instagram-style public profile photos)

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read for avatar images
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

-- Create a profiles row for every new auth user, with a default avatar_url
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fname text;
  lname text;
  fulln text;
  home_uni text;
  abroad_prog text;
  avatar text;
begin
  fname := coalesce(
    nullif(new.raw_user_meta_data->>'first_name', ''),
    split_part(coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), ' ', 1),
    'Abroadster'
  );
  lname := coalesce(
    nullif(new.raw_user_meta_data->>'last_name', ''),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name', ''), '^\S+\s*', ''), ''),
    ''
  );
  fulln := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    trim(fname || ' ' || lname),
    fname
  );
  home_uni := coalesce(nullif(new.raw_user_meta_data->>'home_university', ''), 'UT Austin');
  abroad_prog := coalesce(nullif(new.raw_user_meta_data->>'study_abroad_program', ''), 'NYU Paris');
  avatar := coalesce(
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    'https://ui-avatars.com/api/?name=' || replace(fulln, ' ', '+') || '&background=E8E8E8&color=222222&size=256&bold=true'
  );

  insert into public.profiles (
    id, first_name, last_name, full_name, avatar_url,
    home_university, study_abroad_program, home_accent, abroad_accent
  ) values (
    new.id, fname, lname, fulln, avatar,
    home_uni, abroad_prog, '#BF5700', '#9B51E0'
  )
  on conflict (id) do update set
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill missing avatar_url for existing profiles
update public.profiles
set avatar_url = 'https://ui-avatars.com/api/?name=' || replace(full_name, ' ', '+') || '&background=E8E8E8&color=222222&size=256&bold=true'
where avatar_url is null or avatar_url = '';
