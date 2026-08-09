-- Auto-join home + abroad school chats and return them for the signed-in user.
-- Bypasses RLS (security definer). Safe to re-run.

grant execute on function public.ensure_community(text, text, text) to authenticated;

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
  if auth.uid() is not null and uid <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  select * into p from public.profiles where id = uid;
  if not found then return; end if;

  abroad_name := nullif(trim(coalesce(p.study_abroad_program, '')), '');
  home_name := nullif(trim(coalesce(p.home_university, '')), '');

  -- Nothing to join until the user has set schools on their profile
  if abroad_name is null and home_name is null then
    return;
  end if;

  if abroad_name is not null then
    abroad_id := public.ensure_community(
      abroad_name,
      'abroad',
      coalesce(nullif(trim(p.abroad_accent), ''), '#9B51E0')
    );
    update public.communities
    set accent = coalesce(nullif(trim(p.abroad_accent), ''), accent)
    where id = abroad_id;
    insert into public.community_members(community_id, user_id)
    values (abroad_id, uid)
    on conflict do nothing;
  end if;

  if home_name is not null then
    home_id := public.ensure_community(
      home_name,
      'home',
      coalesce(nullif(trim(p.home_accent), ''), '#BF5700')
    );
    update public.communities
    set accent = coalesce(nullif(trim(p.home_accent), ''), accent)
    where id = home_id;
    insert into public.community_members(community_id, user_id)
    values (home_id, uid)
    on conflict do nothing;
  end if;

  -- Leave other home/abroad school chats so pills match the profile
  delete from public.community_members cm
  using public.communities c
  where cm.community_id = c.id
    and cm.user_id = uid
    and c.kind in ('home', 'abroad')
    and (
      (abroad_id is not null and home_id is not null and cm.community_id not in (abroad_id, home_id))
      or (abroad_id is not null and home_id is null and cm.community_id <> abroad_id)
      or (abroad_id is null and home_id is not null and cm.community_id <> home_id)
    );
end;
$$;

grant execute on function public.sync_profile_communities(uuid) to authenticated;

-- Sync + return school communities (with channel ids) for the current user
create or replace function public.get_my_school_communities()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  result jsonb := '[]'::jsonb;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  perform public.sync_profile_communities(me);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'kind', c.kind,
        'accent', c.accent,
        'logo_url', c.logo_url,
        'channel_ids', coalesce((
          select jsonb_object_agg(ch.slug, ch.id)
          from public.channels ch
          where ch.community_id = c.id
        ), '{}'::jsonb)
      )
      order by case when c.kind = 'abroad' then 0 else 1 end
    ),
    '[]'::jsonb
  )
  into result
  from public.community_members m
  join public.communities c on c.id = m.community_id
  where m.user_id = me
    and c.kind in ('home', 'abroad');

  return result;
end;
$$;

grant execute on function public.get_my_school_communities() to authenticated;

-- On profile insert: join only schools that are actually set (no blank community names)
create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  abroad_id uuid;
  home_id uuid;
  ch uuid;
  abroad_name text := nullif(trim(coalesce(new.study_abroad_program, '')), '');
  home_name text := nullif(trim(coalesce(new.home_university, '')), '');
begin
  if abroad_name is not null then
    abroad_id := public.ensure_community(
      abroad_name,
      'abroad',
      coalesce(nullif(trim(new.abroad_accent), ''), '#9B51E0')
    );
    insert into public.community_members(community_id, user_id)
    values (abroad_id, new.id)
    on conflict do nothing;
  end if;

  if home_name is not null then
    home_id := public.ensure_community(
      home_name,
      'home',
      coalesce(nullif(trim(new.home_accent), ''), '#BF5700')
    );
    insert into public.community_members(community_id, user_id)
    values (home_id, new.id)
    on conflict do nothing;
  end if;

  for ch in
    select c.id from public.channels c
    where c.community_id in (abroad_id, home_id) and c.slug = 'general'
  loop
    insert into public.messages(channel_id, sender_id, kind, body)
    values (ch, new.id, 'system', new.first_name || ' has joined this chat');
  end loop;

  return new;
end;
$$;
