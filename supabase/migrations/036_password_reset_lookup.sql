-- Password reset: look up user id + DOB for the reset-password Edge Function.
-- Callable with service_role only (not exposed to anon/authenticated clients).

create or replace function public.lookup_user_for_password_reset(
  p_email text default null,
  p_phone text default null
)
returns table (user_id uuid, date_of_birth text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if phone is not null and length(phone) >= 10 then
    return query
      select p.id, left(coalesce(p.date_of_birth::text, ''), 10)
      from public.profiles p
      where p.phone_number = phone
      limit 1;
    if found then
      return;
    end if;
  end if;

  if email is not null then
    return query
      select p.id, left(coalesce(p.date_of_birth::text, ''), 10)
      from public.profiles p
      where lower(coalesce(p.login_email, '')) = email
         or lower(coalesce(p.student_email, '')) = email
      limit 1;
    if found then
      return;
    end if;

    return query
      select
        u.id,
        left(
          coalesce(
            p.date_of_birth::text,
            u.raw_user_meta_data->>'date_of_birth',
            ''
          ),
          10
        )
      from auth.users u
      left join public.profiles p on p.id = u.id
      where lower(u.email) = email
      limit 1;
  end if;
end;
$$;

revoke all on function public.lookup_user_for_password_reset(text, text) from public;
revoke all on function public.lookup_user_for_password_reset(text, text) from anon, authenticated;
grant execute on function public.lookup_user_for_password_reset(text, text) to service_role;
