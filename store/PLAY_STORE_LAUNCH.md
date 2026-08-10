# Abroadster — Google Play launch guide

Use this checklist. Most backend/app work is already done. Complete the **YOU** steps in order.

---

## What’s already done (by the developer / agent)

- [x] Report user (profile menu → Report)
- [x] Block / unblock (backed by Supabase; Settings → Blocked)
- [x] Privacy Policy + Terms updated and hosted
- [x] Public **Delete account** page hosted
- [x] Removed unused Android location / mic / legacy storage permissions
- [x] Feature graphic generated: `store/play/feature-graphic.png` (1024×500)
- [x] Production EAS env vars (Supabase, Mapbox, legal URL, demo seed off)
- [x] Package id: `com.abroadster.myapp`

### Important URLs (paste into Play Console)

| Field | URL |
|--------|-----|
| Privacy Policy | https://ajwnvwvpvasxkwpfdsvo.supabase.co/storage/v1/object/public/legal/privacy.html |
| Terms | https://ajwnvwvpvasxkwpfdsvo.supabase.co/storage/v1/object/public/legal/terms.html |
| Account deletion | https://ajwnvwvpvasxkwpfdsvo.supabase.co/storage/v1/object/public/legal/delete-account.html |
| Support email | support@abroadster.com |

---

## YOU — Step 1: Create the Play app (10–15 min)

1. Open [Google Play Console](https://play.google.com/console) and sign in with your **business** account.
2. Click **Create app**.
3. Fill in:
   - **App name:** Abroadster  
   - **Default language:** English (United States)  
   - **App or game:** App  
   - **Free or paid:** Free  
4. Accept the declarations (Developer Program Policies, US export laws, etc.).
5. Click **Create app**.

---

## YOU — Step 2: Store listing (20–30 min)

Go to **Grow → Store presence → Main store listing** (wording can vary slightly).

### App details
- **App name:** Abroadster  
- **Short description** (80 chars max):  
  `Meet study-abroad students, plan trips, and share albums abroad.`  
- **Full description:**

```
Abroadster is the social map for students studying abroad.

Find classmates and friends nearby, plan trips together, share albums from every city, and stay in the loop with DMs and school community chats.

• See friends on the map based on your study-abroad city
• Create and lock in group trips
• Follow trip albums and share posts
• Message friends and join school community chats
• Build your passport as you explore

Abroadster is made for university students living and traveling abroad.

Support: support@abroadster.com
Privacy: https://ajwnvwvpvasxkwpfdsvo.supabase.co/storage/v1/object/public/legal/privacy.html
```

### Graphics
1. **App icon:** upload `assets/icon.png` (already 512+; Play wants 512×512 — our 1024 icon is fine).
2. **Feature graphic:** upload `store/play/feature-graphic.png`.
3. **Phone screenshots (required — at least 2):**
   - Open the app on your phone **or** open http://localhost:8081 in Chrome.
   - Capture 2–8 screens: Map, Home feed, Trips, Profile, Community chat.
   - Phone screenshots: roughly **1080×1920** (portrait).
   - Save them into `store/play/screenshots/` if you want them organized.
   - Upload in Play Console under Phone screenshots.

### Contact details
- **Email:** support@abroadster.com  
- **Privacy policy:** paste the Privacy Policy URL above.

Save the listing.

---

## YOU — Step 3: App content / policy questionnaires (25–40 min)

Complete every item under **Policy → App content** (left sidebar). Answer carefully:

### 1) Privacy policy
- Add the Privacy Policy URL above.

### 2) Ads
- **No**, the app does not contain ads.

### 3) App access (if asked for login)
- Yes, accounts required for core features.
- Provide: create a **reviewer demo account** (email + password) OR tell them to sign up with email.
- **Recommended:** create `playreview@yourdomain.com` (or a Gmail) in the app now, finish onboarding, and paste those credentials in the “App access” form.

### 4) Content ratings
- Start questionnaire → category **Social networking / communication**.  
- Answer honestly: user-generated content yes; sharing yes; location is host-city based (not continuous GPS).  
- Complete and apply the rating.

### 5) Target audience
- Target age: **13 and up** (not primarily children).  
- Not designed for kids under 13.

### 6) News app
- No.

### 7) Data safety (critical — answer from real behavior)

**Data collected / shared:**

| Data type | Collected? | Shared with other users? | Required? | Purpose |
|-----------|------------|--------------------------|-----------|---------|
| Name | Yes | Yes (profile) | Yes | App functionality |
| Email / phone | Yes | No (not public directory) | Yes | Account |
| User photos | Yes | Yes (posts/albums/chat) | No | App functionality |
| Other user content (messages, trips, posts) | Yes | Yes (as designed) | No | App functionality |
| Approximate location (host city / profile) | Yes | Yes (map pin) | No | App functionality |
| Precise GPS location | **No** | — | — | Not collected |
| Device IDs / push tokens | Yes | No | No | App functionality / notifications |

- **Data is encrypted in transit:** Yes  
- **Users can request deletion:** Yes (in-app + web page)  
- **Account deletion URL** (if asked): use the Delete account URL above  

### 8) Government apps
- No.

### 9) Financial features
- No.

### 10) Health
- No.

### 11) Permissions declarations
- Camera / Photos: for uploading posts, albums, chat images.  
- Notifications: optional alerts.  
- **Do not** declare background location. We blocked unused location permissions.

### 12) UGC (User-generated content)
- Yes, users can create content.  
- Users can **report** and **block**.  
- You review reports via Supabase table `content_reports` (status `open`).  
- Email for safety: support@abroadster.com  

### 13) Families / Children
- Not in Designed for Families unless you intend to; leave as **not primarily for children**.

---

## YOU — Step 4: Link Play Console to Expo (for upload) — ~15 min

This lets us upload the Android App Bundle (AAB) without you using the command line.

1. In Play Console go to **Setup → API access** (or Users and permissions → API access).
2. Link a **Google Cloud project** if prompted (create one named “Abroadster Play” if needed).
3. Click **Create new service account** (opens Google Cloud).
4. In Google Cloud:
   - Create service account name: `eas-play-submit`
   - Role: **Service Account User** is enough at creation; then continue.
5. Create a **JSON key** for that service account → download the `.json` file.
6. Back in Play Console API access, find that service account → **Grant access**:
   - Permissions: **Admin** (or at least Release to production / Release apps / View app information).
   - Invite / apply.
7. Put the JSON file somewhere safe on your PC, e.g.  
   `C:\Users\SamiM\AbroadsterSummerGO\secrets\play-service-account.json`  
   (**Do not share this file.** It is gitignored if under `secrets/` — we should add that.)

Tell the agent the file path when ready, OR run submit yourself after the build finishes (Step 6).

---

## YOU — Step 5: Wait for the production Android build

Production Android build is already running on Expo:

**Build page:** https://expo.dev/accounts/samimoudarress-team/projects/sami-moudarres/builds/4ef2f94c-c44d-4701-874c-14d17e579f9d

**Download AAB (ready):** https://expo.dev/artifacts/eas/sfi47wEHWOf5NNhNl9o9GW38UaFIpnZ5tOgUqaaWC9k.aab

Status: **Finished** — upload this file in Play Console (Internal testing recommended first).

---

## YOU — Step 6: Upload & release (15–25 min)

### Option A — EAS Submit (easiest once service account is linked)
From the project folder (or ask the agent once the JSON path exists):

```
npx eas-cli submit --platform android --profile production --latest
```

### Option B — Manual upload in Play Console
1. Play Console → **Release → Production** (or start with **Testing → Internal testing** — strongly recommended first).
2. **Create new release**.
3. Upload the `.aab` from Expo.
4. Release notes example:

```
Initial release of Abroadster — map, trips, albums, community chat, and AirMail for study-abroad students.
```

5. Review and **Start rollout to Production** (or send to Internal testing first).

**Strong recommendation:** ship to **Internal testing** first with your own Gmail as a tester, install from the Play link, smoke-test signup/login/map/chat/delete account, then promote to Production.

---

## YOU — Step 7: Countries, pricing, final checks

1. **Pricing & distribution:** Free; select countries (usually all).  
2. **Content rating** applied.  
3. Dashboard shows no red “errors” on the left checklist.  
4. Submit for review.

Review often takes **a few days to ~2 weeks**.

---

## After approval — keep watching

- Check email for Play policy questions.  
- Review open rows in Supabase `content_reports`.  
- Reply from support@abroadster.com if Google asks for more info.

---

## Data Safety quick answers (copy)

- Collects personal info: **Yes**  
- Shares with other users: **Yes** (profile, posts, messages as designed)  
- Sold: **No**  
- Encrypted in transit: **Yes**  
- Deletion: **Yes** — Settings → Delete account; also web instructions URL  
- Precise location: **No**  
- Approximate location / host city: **Yes** (map pin from profile)

---

## If Google rejects

Common fixes:
1. Missing screenshots / feature graphic → upload Step 2 assets.  
2. Data Safety mismatch → re-check Precise location = No.  
3. UGC → confirm Report + Block exist (they do).  
4. Login for reviewers → provide working demo credentials.

Paste the rejection email text into chat and we will fix it quickly.
