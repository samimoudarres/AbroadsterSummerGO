# TestFlight crash fix — what changed (build 7)

Crashed build: 1.0.1 (5) — instant quit on open  
Latest fixed build: **1.0.1 (8)** — crash fixes + your stamp app icon

IPA: https://expo.dev/artifacts/eas/v1iomkrcdFbuAZgj5LS0BWPyDG7nO9weUW_vME690p8.ipa  
Build page: https://expo.dev/accounts/samimoudarress-team/projects/sami-moudarres/builds/3f8c321a-01df-4b7a-b7ef-76e37518ca55

## YOU — submit this build to TestFlight (1 command)

In Cursor terminal:

```powershell
cd C:\Users\SamiM\AbroadsterSummerGO
$m = Select-String -Path .env -Pattern '^EXPO_TOKEN=(.+)$'
$env:EXPO_TOKEN = $m.Matches.Groups[1].Value.Trim()
$env:EAS_NO_VCS = "1"
npx eas-cli submit --platform ios --id 3f8c321a-01df-4b7a-b7ef-76e37518ca55
```

When asked which App Store Connect app, pick **Abroadster**.
When TestFlight updates, install **1.0.1 (8)** (not build 5).

Optional: to skip the app picker next time, open App Store Connect → your app → **App Information** → copy **Apple ID** (numbers only), then put it in `eas.json` under `submit.production.ios.ascAppId`.

## App Store Connect — turn off Mac availability (stops ITMS-90863 emails)

Your email about ExpoModulesCore / Mac Apple silicon is a **warning**, not a hard reject.
To silence it for future uploads:

1. App Store Connect → Abroadster → **Pricing and Availability** (or Distribution → Availability)
2. Find **Apple Silicon Mac** / “iPhone and iPad Apps on Apple Silicon Macs”
3. Turn **OFF** / don’t make available on Mac
4. Save

Abroadster is iPhone-only (`supportsTablet: false`).

