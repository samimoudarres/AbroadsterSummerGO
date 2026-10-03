-- Welcome invite notification for every new profile (red-dot on bell).
-- Safe to re-run: only inserts when the user has none of this kind.

create or replace function public.seed_invite_friends_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, kind, title, body, data)
  select
    new.id,
    'invite_friends',
    'Invite your friends',
    'Create your first trip and bring your people onto Abroadster.',
    jsonb_build_object(
      'action', 'invite_friends',
      'appStoreUrl', 'https://apps.apple.com/app/id6800081262'
    )
  where not exists (
    select 1
    from public.notifications n
    where n.user_id = new.id
      and n.kind = 'invite_friends'
  );
  return new;
end;
$$;

drop trigger if exists trg_seed_invite_friends_notification on public.profiles;
create trigger trg_seed_invite_friends_notification
  after insert on public.profiles
  for each row
  execute function public.seed_invite_friends_notification();

-- Backfill existing accounts that never got one
insert into public.notifications (user_id, kind, title, body, data)
select
  p.id,
  'invite_friends',
  'Invite your friends',
  'Create your first trip and bring your people onto Abroadster.',
  jsonb_build_object(
    'action', 'invite_friends',
    'appStoreUrl', 'https://apps.apple.com/app/id6800081262'
  )
from public.profiles p
where not exists (
  select 1
  from public.notifications n
  where n.user_id = p.id
    and n.kind = 'invite_friends'
);
