-- Album photo storage + upload RPC (notifies trip members)

insert into storage.buckets (id, name, public)
values ('album-photos', 'album-photos', true)
on conflict (id) do nothing;

drop policy if exists "album photos public read" on storage.objects;
create policy "album photos public read"
  on storage.objects for select
  using (bucket_id = 'album-photos');

drop policy if exists "album photos member upload" on storage.objects;
create policy "album photos member upload"
  on storage.objects for insert
  with check (
    bucket_id = 'album-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "album photos owner update" on storage.objects;
create policy "album photos owner update"
  on storage.objects for update
  using (
    bucket_id = 'album-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "album photos owner delete" on storage.objects;
create policy "album photos owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'album-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Upload many photos at once; notify other trip members
create or replace function public.upload_album_photos(
  p_trip_id uuid,
  p_image_urls text[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  aid uuid;
  uid uuid := auth.uid();
  url text;
  n int := 0;
  uploader_name text;
  member record;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_image_urls is null or array_length(p_image_urls, 1) is null then
    return 0;
  end if;

  if not exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = uid
  ) then
    raise exception 'Only trip members can upload album photos';
  end if;

  aid := public.ensure_trip_album(p_trip_id);

  foreach url in array p_image_urls loop
    if url is null or length(trim(url)) = 0 then
      continue;
    end if;
    insert into public.album_photos(album_id, uploader_id, image_url)
    values (aid, uid, trim(url));
    n := n + 1;
  end loop;

  if n = 0 then
    return 0;
  end if;

  select coalesce(full_name, first_name, 'Someone') into uploader_name
  from public.profiles where id = uid;

  for member in
    select m.user_id
    from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id <> uid
  loop
    insert into public.notifications(user_id, kind, title, body, data)
    values (
      member.user_id,
      'album_photos_uploaded',
      'New album photos',
      uploader_name || ' uploaded ' || n::text ||
        case when n = 1 then ' photo' else ' photos' end || ' to the trip album',
      jsonb_build_object(
        'tripId', p_trip_id,
        'fromUserId', uid,
        'photoCount', n
      )
    );
  end loop;

  return n;
end;
$$;

grant execute on function public.upload_album_photos(uuid, text[]) to authenticated;
