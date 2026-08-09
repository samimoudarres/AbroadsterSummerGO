# Abroadster

Study-abroad social map (Map screen first).

## Run the app

```bash
npm install
npm run web
```

Then open the URL Expo prints (usually http://localhost:8081).

## Mapbox setup (optional but recommended)

The map works immediately with a free OpenFreeMap fallback.
For official **Mapbox** light + satellite styles:

1. Create a free account: https://account.mapbox.com/auth/signup/
2. Copy your **Default Public Token** (starts with `pk.`): https://account.mapbox.com/access-tokens/
3. Open the `.env` file in this project
4. Paste your token like this:

```
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_token_here
```

5. Stop the app and run `npm run web` again

That’s the only setup step you need for Mapbox.
