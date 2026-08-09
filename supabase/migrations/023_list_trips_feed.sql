-- Batched trips feed (members, album preview, join state, invites, channel).
-- Replaces N+1 hydrateTrip client queries. Safe to re-run.

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
        'leaving_time', t.leaving_time,
        'description', t.description,
        'max_members', t.max_members,
        'invite_token', t.invite_token,
        'latitude', t.latitude,
        'longitude', t.longitude,
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
        'is_following_album', exists (
          select 1 from public.album_followers af
          where af.album_id = al.id and af.user_id = me
        ),
        'album_preview_urls', coalesce((
          select jsonb_agg(p.image_url order by p.created_at desc)
          from (
            select ap.image_url, ap.created_at
            from public.album_photos ap
            where ap.album_id = al.id
            order by ap.created_at desc
            limit 3
          ) p
        ), '[]'::jsonb),
        'channel_id', (
          select c.id
          from public.channels c
          where c.trip_id = t.id and c.slug = 'trip'
          limit 1
        ),
        'pending_invitee_ids', coalesce((
          select jsonb_agg(i.invitee_id)
          from public.trip_invites i
          where i.trip_id = t.id and i.status = 'pending'
        ), '[]'::jsonb)
      ) as row_data
    from public.trips t
    left join public.trip_albums al on al.trip_id = t.id
    where (
      not p_mine_only
      or exists (
        select 1 from public.trip_members tm
        where tm.trip_id = t.id and tm.user_id = me
      )
    )
  ) feed;

  return result;
end;
$$;

grant execute on function public.list_trips_feed(boolean) to authenticated;

-- Enable realtime for chat messages (idempotent)
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;
