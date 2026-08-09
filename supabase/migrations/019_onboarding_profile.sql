-- Onboarding fields collected during create-account flow
alter table public.profiles
  add column if not exists phone_number text,
  add column if not exists date_of_birth date,
  add column if not exists student_email text,
  add column if not exists is_verified_student boolean not null default false,
  add column if not exists login_email text;

comment on column public.profiles.student_email is 'School email ending in .edu — grants verified student status';
comment on column public.profiles.is_verified_student is 'True when signup used a valid .edu email';
