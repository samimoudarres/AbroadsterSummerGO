-- Map / trips feed: show people YOU friended (one-way), not only mutuals.
-- Upcoming/planning trips appear when you friended any trip member.

create or replace function public.is_friend_of_any_member(p_viewer uuid, p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    join public.friendships f
      on f.user_id = p_viewer
     and f.friend_id = tm.user_id
    where tm.trip_id = p_trip_id
  );
$$;

create or replace function public.list_trips_feed(p_mine_only boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  result jsonb := '[]'::jsonb;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(
    jsonb_agg(row_data order by created_at desc),
    '[]'::jsonb
  )
  into result
  from (
    select
      t.created_at,
      jsonb_build_object(
        'id', t.id,
        'owner_id', t.owner_id,
        'status', t.status,
        'open_to_join', t.open_to_join,
        'destination_city', t.destination_city,
        'destination_country', t.destination_country,
        'date_label', t.date_label,
        'date_start', t.date_start,
        'date_end', t.date_end,
        'leaving_time', case
          when public.is_trip_member(me, t.id) then t.leaving_time
          else null
        end,
        'description', case
          when public.is_trip_member(me, t.id) then t.description
          else null
        end,
        'max_members', t.max_members,
        'invite_token', case
          when public.is_trip_member(me, t.id) then t.invite_token
          else null
        end,
        'latitude', case
          when public.is_trip_member(me, t.id) then t.latitude
          else null
        end,
        'longitude', case
          when public.is_trip_member(me, t.id) then t.longitude
          else null
        end,
        'member_ids', coalesce((
          select jsonb_agg(tm.user_id)
          from public.trip_members tm
          where tm.trip_id = t.id
        ), '[]'::jsonb),
        'my_join_status', (
          select r.status
          from public.trip_join_requests r
          where r.trip_id = t.id and r.requester_id = me
          limit 1
        ),
        'album_id', al.id,
        'photos_private', coalesce(al.photos_private, false),
        'is_following_album', exists (
          select 1 from public.album_followers af
          where af.album_id = al.id and af.user_id = me
        ),
        'album_preview_urls', case
          when al.id is null then '[]'::jsonb
          when coalesce(al.photos_private, false)
               and not public.is_trip_member(me, t.id)
            then '[]'::jsonb
          else coalesce((
            select jsonb_agg(p.image_url order by p.created_at desc)
            from (
              select ap.image_url, ap.created_at
              from public.album_photos ap
              where ap.album_id = al.id
              order by ap.created_at desc
              limit 3
            ) p
          ), '[]'::jsonb)
        end,
        'channel_id', case
          when public.is_trip_member(me, t.id) then (
            select c.id
            from public.channels c
            where c.trip_id = t.id and c.slug = 'trip'
            limit 1
          )
          else null
        end,
        'pending_invitee_ids', case
          when public.is_trip_member(me, t.id) then coalesce((
            select jsonb_agg(i.invitee_id)
            from public.trip_invites i
            where i.trip_id = t.id and i.status = 'pending'
          ), '[]'::jsonb)
          else '[]'::jsonb
        end
      ) as row_data
    from public.trips t
    left join public.trip_albums al on al.trip_id = t.id
    where (
      (
        p_mine_only
        and public.is_trip_member(me, t.id)
      )
      or (
        not p_mine_only
        and (
          public.is_trip_member(me, t.id)
          or public.trip_is_past(t)
          -- People you friended (directed) — matches Abroadster one-way friends
          or public.is_friend_of_any_member(me, t.id)
          -- Keep mutual as a safety net
          or public.is_mutual_friend_of_any_member(me, t.id)
        )
      )
    )
  ) feed;

  return result;
end;
$$;

grant execute on function public.list_trips_feed(boolean) to authenticated;
grant execute on function public.is_friend_of_any_member(uuid, uuid) to authenticated;
