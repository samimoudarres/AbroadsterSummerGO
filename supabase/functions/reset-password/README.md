# Password reset Edge Function

## Deploy

```bash
# Apply SQL lookup helper (Supabase SQL editor or CLI)
#   supabase/migrations/036_password_reset_lookup.sql

npx supabase functions deploy reset-password --no-verify-jwt
```

`--no-verify-jwt` is required — callers are logged out.

## Supabase Auth URL allow-list

Dashboard → Authentication → URL Configuration → Redirect URLs, add:

- `abroadster://auth/reset-password`
- `http://localhost:8081/auth/reset-password`
- your production web origin + `/auth/reset-password`

## How it works

1. **Email accounts** — app sends Supabase recovery email; link opens the app to set a new password.
2. **Any account (phone or email)** — verify birthday on file + set a new password via this function (works even when email delivery isn’t available).
