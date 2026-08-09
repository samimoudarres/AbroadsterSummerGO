-- Home feed: most recent + most relevant first.
-- Recency decays smoothly so new posts surface; friends / schools / stamps still boost.

create or replace function public.list_home_feed(p_limit int default 30, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_home text;
  my_abroad text;
  result jsonb;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select home_university, study_abroad_program into my_home, my_abroad
  from public.profiles where id = me;

  select coalesce(jsonb_agg(row_data order by score desc, created_at desc), '[]'::jsonb)
  into result
  from (
    select
      jsonb_build_object(
        'id', p.id,
        'author_id', p.author_id,
        'caption', p.caption,
        'location_label', p.location_label,
        'latitude', p.latitude,
        'longitude', p.longitude,
        'created_at', p.created_at,
        'display_mode', coalesce(p.display_mode, 'carousel'),
        'collage_layout_id', p.collage_layout_id,
        'audience', coalesce(p.audience, 'all'),
        'tagged_trip_id', p.tagged_trip_id,
        'stamp_count', coalesce(sc.cnt, 0),
        'i_stamped', exists (
          select 1 from public.post_stamps s where s.post_id = p.id and s.user_id = me
        ),
        'photo_urls', coalesce((
          select jsonb_agg(pp.image_url order by pp.sort_order)
          from public.post_photos pp where pp.post_id = p.id
        ), '[]'::jsonb),
        'photo_crops', coalesce((
          select jsonb_agg(coalesce(pp.crop_json, '{}'::jsonb) order by pp.sort_order)
          from public.post_photos pp where pp.post_id = p.id
        ), '[]'::jsonb),
        'tagged_user_ids', coalesce((
          select jsonb_agg(pt.user_id) from public.post_tags pt where pt.post_id = p.id
        ), '[]'::jsonb),
        'audience_community_ids', coalesce((
          select jsonb_agg(pac.community_id)
          from public.post_audience_communities pac where pac.post_id = p.id
        ), '[]'::jsonb),
        'stamper_preview_ids', coalesce((
          select jsonb_agg(x.user_id)
          from (
            select s.user_id from public.post_stamps s
            where s.post_id = p.id
            order by s.created_at desc
            limit 3
          ) x
        ), '[]'::jsonb)
      ) as row_data,
      p.created_at,
      (
        -- Recency (dominant): fresh posts rise to the top
        (1000.0 / (1.0 + (extract(epoch from (now() - p.created_at)) / 3600.0) / 12.0))
        + case when p.author_id = me then 80 else 0 end
        + case when exists (
            select 1 from public.friendships f
            where f.user_id = me and f.friend_id = p.author_id
          ) then 450 else 0 end
        + case when my_abroad is not null and length(trim(my_abroad)) > 0
            and a.study_abroad_program is not null
            and lower(trim(a.study_abroad_program)) = lower(trim(my_abroad))
          then 250 else 0 end
        + case when my_home is not null and length(trim(my_home)) > 0
            and a.home_university is not null
            and lower(trim(a.home_university)) = lower(trim(my_home))
          then 120 else 0 end
        + coalesce(sc.cnt, 0) * 4
      ) as score
    from public.posts p
    join public.profiles a on a.id = p.author_id
    left join lateral (
      select count(*)::int as cnt from public.post_stamps s where s.post_id = p.id
    ) sc on true
    where
      p.author_id = me
      or (
        exists (
          select 1 from public.friendships f
          where f.user_id = me and f.friend_id = p.author_id
        )
        and coalesce(p.audience, 'all') in ('all', 'friends')
      )
      or (
        p.audience = 'communities'
        and exists (
          select 1
          from public.post_audience_communities pac
          join public.community_members cm on cm.community_id = pac.community_id
          where pac.post_id = p.id and cm.user_id = me
        )
      )
    order by score desc, p.created_at desc
    limit greatest(1, coalesce(p_limit, 30))
    offset greatest(0, coalesce(p_offset, 0))
  ) ranked;

  return result;
end;
$$;

grant execute on function public.list_home_feed(int, int) to authenticated;
