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

## Contact form email

Messages are sent to **samimoudarres@hotmail.com**.

1. Create a free account at [resend.com](https://resend.com)
2. Create an API key
3. Copy `.env.example` → `.env.local` and set:

```bash
RESEND_API_KEY=re_xxxxx
CONTACT_TO=samimoudarres@hotmail.com
CONTACT_FROM=Abroadster <onboarding@resend.dev>
```

With Resend’s onboarding sender you can deliver to your own inbox without verifying a domain. After you own a domain, verify it in Resend and change `CONTACT_FROM`.

If `RESEND_API_KEY` is missing, the form falls back to opening a prefilled `mailto:` to the support address.

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
