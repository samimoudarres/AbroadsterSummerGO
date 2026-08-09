-- Allow a signed-in user to permanently delete their own account (App Store requirement).
-- Cascades remove public.profiles and related rows via FK on delete cascade.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Remove app data first (profiles cascades to memberships when FK is set)
  delete from public.profiles where id = uid;

  -- Remove auth user (requires security definer)
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
