-- Recovery email lookup for request-password-reset Edge Function.
-- Callable with service_role only (not exposed to anon/authenticated clients).

create or replace function public.lookup_recovery_email_for_password_reset(
  p_email text default null,
  p_phone text default null
)
returns table (recovery_email text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  profile_id uuid;
  login_email text;
  student_email text;
  auth_email text;
begin
  if phone is not null and length(phone) >= 10 then
    select p.id, lower(nullif(trim(p.login_email), '')), lower(nullif(trim(p.student_email), ''))
      into profile_id, login_email, student_email
      from public.profiles p
      where p.phone_number = phone
      limit 1;

    if profile_id is null then
      return;
    end if;

    if login_email is not null and login_email !~ '@phone\.abroadster\.app$' then
      recovery_email := login_email;
      return next;
      return;
    end if;

    if student_email is not null and student_email !~ '@phone\.abroadster\.app$' then
      recovery_email := student_email;
      return next;
      return;
    end if;

    select lower(u.email)
      into auth_email
      from auth.users u
      where u.id = profile_id
      limit 1;

    if auth_email is not null and auth_email !~ '@phone\.abroadster\.app$' then
      recovery_email := auth_email;
      return next;
    end if;

    return;
  end if;

  if email is not null then
    select lower(nullif(trim(p.login_email), ''))
      into login_email
      from public.profiles p
      where lower(coalesce(p.login_email, '')) = email
         or lower(coalesce(p.student_email, '')) = email
      limit 1;

    if login_email is not null and login_email !~ '@phone\.abroadster\.app$' then
      recovery_email := login_email;
      return next;
      return;
    end if;

    select lower(nullif(trim(p.student_email), ''))
      into student_email
      from public.profiles p
      where lower(coalesce(p.student_email, '')) = email
      limit 1;

    if student_email is not null and student_email !~ '@phone\.abroadster\.app$' then
      recovery_email := student_email;
      return next;
      return;
    end if;

    select lower(u.email)
      into auth_email
      from auth.users u
      where lower(u.email) = email
      limit 1;

    if auth_email is not null and auth_email !~ '@phone\.abroadster\.app$' then
      recovery_email := auth_email;
      return next;
    end if;

    -- Fall back to the typed email — GoTrue accepts unknown addresses without leaking.
    recovery_email := email;
    return next;
  end if;
end;
$$;

revoke all on function public.lookup_recovery_email_for_password_reset(text, text) from public;
revoke all on function public.lookup_recovery_email_for_password_reset(text, text) from anon, authenticated;
grant execute on function public.lookup_recovery_email_for_password_reset(text, text) to service_role;
