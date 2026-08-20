# Abroadster — Apple App Store launch guide

Follow these steps in order. Most of the app work is already done in the repo.

**Bundle ID:** `com.abroadster.app`  
**Version:** `1.0.1` (build number auto-increments on EAS)

---

## What’s already done for you

- [x] Native Map tab (Apple Maps via `react-native-maps`) — required for App Review
- [x] Bundle ID, display name, encryption export compliance (`ITSAppUsesNonExemptEncryption: false`)
- [x] Privacy Manifests (no tracking)
- [x] Photo + Camera permission strings
- [x] When-In-Use location for live map pin + host city fallback (no background GPS)
- [x] Account deletion in Settings + hosted delete-account page
- [x] Report + Block for UGC moderation
- [x] Privacy Policy + Terms hosted (public URLs)
- [x] Production EAS env: Supabase, Mapbox (web), `DEMO_SEED=0`, legal URL
- [x] 1024×1024 app icon (`assets/icon.png` / `assets/app-icon-1024.png`)
- [x] Listing + review notes draft: `store/APP_STORE_LISTING.txt`

---

## YOU — Step 1: Apple Developer identifiers (10 min)

1. Open [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. Click **+** → **App IDs** → **App**
3. Description: `Abroadster`
4. Bundle ID → **Explicit** → `com.abroadster.app`
5. Enable capabilities you’ll need:
   - **Push Notifications**
   - (Sign In with Apple is **not** required — we only use email/phone auth)
6. Continue → Register

Also confirm your paid Apple Developer Program membership is **Active**.

---

## YOU — Step 2: Create the app in App Store Connect (10 min)

1. Open [App Store Connect](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**
2. Fill in:
   - Platforms: **iOS**
   - Name: **Abroadster**
   - Primary Language: English (U.S.)
   - Bundle ID: **com.abroadster.app**
   - SKU: `abroadster-ios-001` (any unique string; not shown to users)
   - User Access: Full Access
3. Create

---

## YOU — Step 3: Fill the App Store listing (30–45 min)

Open the app → **App Store** tab → the **1.0.1 Prepare for Submission** version.

Paste from `store/APP_STORE_LISTING.txt`:

| Field | Source |
|--------|--------|
| Name / Subtitle / Description / Keywords / Promo text | Listing file |
| Support URL | Listing file |
| Privacy Policy URL | `https://ajwnvwvpvasxkwpfdsvo.supabase.co/storage/v1/object/public/legal/privacy.html` |
| Category | Social Networking / Travel |
| Copyright | `2026 Abroadster` (or your legal name) |

### Screenshots (required — you must capture these)

Apple requires screenshots for at least one iPhone size (usually **6.7"**).

**How to get them without a Mac (easiest paths):**

1. **Best:** Install a TestFlight / internal EAS build on a physical iPhone once Step 5 finishes, then screenshot:
   - Map with pins
   - Home / feed
   - Trips
   - Profile
   - Chat / community
2. **Alt:** Use any design tool + iPhone 15 Pro Max frame and drop in UI captures from Android/web (must look like the real iOS app).

Save copies into `store/ios/screenshots/` for your records.

**App icon:** upload `assets/app-icon-1024.png` (1024×1024, no transparency, no rounded corners added by you — Apple rounds it).

---

## YOU — Step 4: Age rating + App Privacy + Review info (20 min)

1. **Age Rating** — complete questionnaire (see listing file). Social UGC apps often land **13+** or **17+**.
2. **App Privacy** — answer using the nutrition-label section in `store/APP_STORE_LISTING.txt`.
   - Tracking = **No**
   - Location = study-abroad / approximate city data linked to the user account — **not** live GPS
3. **App Review Information**
   - Sign-in required: **Yes**
   - Provide a demo account **or** tell them to Sign up with Email (notes already explain this)
   - Contact phone + email you actually answer
   - Paste **Review Notes** from `store/APP_STORE_LISTING.txt`
4. **Content Rights** / export compliance: encryption uses only standard HTTPS → select **No** for proprietary encryption (matches `usesNonExemptEncryption: false`)

---

## YOU — Step 5: Build the iOS app with EAS (interactive — ~20–30 min)

This must run on **your** machine once so Expo can log into Apple and create certificates.

In PowerShell, from the project folder:

```powershell
cd C:\Users\SamiM\AbroadsterSummerGO
$m = Select-String -Path .env -Pattern '^EXPO_TOKEN=(.+)$'
$env:EXPO_TOKEN = $m.Matches.Groups[1].Value.Trim()
$env:EAS_NO_VCS = "1"

npx eas-cli build --platform ios --profile production
```

When prompted:

1. Log in with your **Apple ID** (the one on the Developer Program)
2. Select your **Team**
3. Let Expo manage credentials → **Yes**
4. Generate a new Distribution Certificate / Provisioning Profile if asked → **Yes**
5. For Push: create/upload an **APNs Key** when Expo asks (recommended so notifications work)

Wait until the build finishes. Open the build URL Expo prints and confirm status = **Finished**.

Optional: download the `.ipa` from the Expo build page (backup).

---

## YOU — Step 6: Submit the build to App Store Connect

Still in PowerShell:

```powershell
cd C:\Users\SamiM\AbroadsterSummerGO
$m = Select-String -Path .env -Pattern '^EXPO_TOKEN=(.+)$'
$env:EXPO_TOKEN = $m.Matches.Groups[1].Value.Trim()
$env:EAS_NO_VCS = "1"

npx eas-cli submit --platform ios --latest --profile production
```

Follow prompts to select the Abroadster app in App Store Connect.

Then in ASC:

1. Wait until the build finishes processing (can take 10–30 min; you’ll get email)
2. In the version page → **Build** → select the new build
3. Answer any remaining compliance questions
4. **Add for Review** → **Submit to App Review**

---

## YOU — Step 7: After you submit

- Typical first review: **24–48 hours** (sometimes longer)
- Watch for App Store Connect emails / Resolution Center messages
- Common first-time asks: clearer demo account, screenshot mismatch, or UGC moderation details — reply with the review notes + deletion / report / block paths

---

## Important URLs (bookmark)

| Item | URL |
|------|-----|
| Privacy | https://ajwnvwvpvasxkwpfdsvo.supabase.co/storage/v1/object/public/legal/privacy.html |
| Terms | https://ajwnvwvpvasxkwpfdsvo.supabase.co/storage/v1/object/public/legal/terms.html |
| Delete account | https://ajwnvwvpvasxkwpfdsvo.supabase.co/storage/v1/object/public/legal/delete-account.html |
| Support | samimoudarres@hotmail.com |
| Expo project builds | https://expo.dev/accounts/samimoudarress-team/projects/sami-moudarres/builds |
| App Store Connect | https://appstoreconnect.apple.com |

---

## If App Review rejects

| Rejection theme | What to do |
|-----------------|------------|
| Incomplete map / feature | Confirm they installed the build that includes native MapView (after this prepare work) |
| Login / demo account | Create a dedicated reviewer account and put email+password in ASC Review Information |
| Privacy / location mismatch | We do not use live GPS; reply with that + point to city-based map pins |
| UGC / moderation | Point to Report, Block, Delete account, samimoudarres@hotmail.com |
| Missing screenshots / metadata | Fix in ASC; no rebuild needed |

---

## What you still must do yourself (cannot be automated from here)

1. Apple Developer login / team selection for the first EAS iOS credentials
2. Create ASC app + fill questionnaires
3. Capture and upload screenshots
4. Run `eas build` / `eas submit` interactively (Step 5–6)
5. Click **Submit for Review** in App Store Connect
