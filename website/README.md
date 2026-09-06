# Abroadster marketing website

Standalone Next.js site (separate from the Expo app). Vintage postcard brand, App Store CTA, Features, and Contact form.

## Live URL

**https://abroadster.vercel.app**

Vercel dashboard: https://vercel.com/samimoudarres-5783s-projects/abroadster

## Local development

```bash
cd website
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Contact / support form

Visitors submit the form on `/contact` or `/support`. The website API:

1. Saves a row in Supabase `contact_tickets` (service role only — visitors never see your inbox)
2. Emails **you** a notification via Resend (`CONTACT_TO`)

Required Vercel / `.env.local` vars:

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
RESEND_API_KEY=re_xxxxx
CONTACT_TO=your-private-inbox@example.com
CONTACT_FROM=Abroadster <onboarding@resend.dev>
```

With Resend’s onboarding sender you can deliver to your own inbox without verifying a domain. After you own a domain, verify it in Resend and change `CONTACT_FROM`.

There is **no** `mailto:` fallback — your support address stays server-side only.

Run migration `053_contact_tickets.sql` in the Supabase SQL editor before relying on the form in production.

## Deploy free on Vercel

From `website/`:

```bash
npx vercel login
npx vercel --prod
```

Add the same env vars in **Vercel → Project → Settings → Environment Variables**, then redeploy.

You’ll get a URL like `https://abroadster-xxxx.vercel.app`.

### Connect your own domain later

1. Buy a domain (e.g. abroadster.com)
2. Vercel → Project → **Settings → Domains** → Add domain
3. Follow the DNS instructions (usually an A record / CNAME)
4. Set `NEXT_PUBLIC_SITE_URL` to `https://yourdomain.com` and redeploy
5. Optionally set App Store Connect **Marketing URL** to the same address

## Routes

| Path | Purpose |
|------|---------|
| `/` | Home |
| `/features` | Product features + app frames |
| `/contact` | Contact form |
| `/privacy` | Redirects to hosted Privacy Policy |
| `/terms` | Redirects to hosted Terms |

App Store badge links to: `https://apps.apple.com/app/id6800081262`
