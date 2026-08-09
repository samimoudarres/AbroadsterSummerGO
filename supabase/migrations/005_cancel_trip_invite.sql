-- Cancel / uninvite a pending trip invite (host or any trip member).
-- Run after 004_create_trip.sql in the Supabase SQL editor.

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.trip_invites'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if cname is not null then
    execute format('alter table public.trip_invites drop constraint %I', cname);
  end if;
end $$;

alter table public.trip_invites
  add constraint trip_invites_status_check
  check (status in ('pending', 'accepted', 'declined', 'cancelled'));

create or replace function public.cancel_trip_invite(p_trip_id uuid, p_invitee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  is_member boolean;
  invite_row public.trip_invites%rowtype;
  my_name text;
  city text;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select exists(
    select 1 from public.trip_members where trip_id = p_trip_id and user_id = me
  ) into is_member;
  if not is_member then raise exception 'Not a trip member'; end if;

  select * into invite_row
  from public.trip_invites
  where trip_id = p_trip_id
    and invitee_id = p_invitee_id
    and status = 'pending'
  limit 1;

  if not found then
    return;
  end if;

  update public.trip_invites
  set status = 'cancelled'
  where id = invite_row.id;

  select full_name into my_name from public.profiles where id = me;
  select destination_city into city from public.trips where id = p_trip_id;

  insert into public.notifications(user_id, kind, title, body, data)
  values (
    p_invitee_id,
    'trip_invite_cancelled',
    'Invite withdrawn',
    coalesce(my_name, 'Someone') || ' withdrew your invite to ' || coalesce(city, 'a trip'),
    jsonb_build_object(
      'trip_id', p_trip_id,
      'invite_id', invite_row.id,
      'inviter_id', me
    )
  );
end;
$$;
