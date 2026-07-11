# Manual deploy (first live link)

One-time steps to get a real, playable URL on the `wordrusharena` Firebase project.
Run everything from your own machine — this requires your Google account, which
cannot be done from an automated session.

## Prerequisites

- Node.js 22+
- Firebase CLI: `npm install -g firebase-tools`
- Google Cloud CLI: https://cloud.google.com/sdk/docs/install
- Flutter stable: https://docs.flutter.dev/get-started/install

## 1. Authenticate

```bash
firebase login
gcloud auth login
gcloud config set project wordrusharena
```

## 2. Confirm billing

Cloud Run requires the Blaze (pay-as-you-go) plan. In the Firebase Console,
open **Usage and billing** for `wordrusharena` and upgrade if it's still on
Spark. The free tier covers a small private game comfortably.

## 3. Enable required Google Cloud APIs

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

## 4. Enable Anonymous Authentication (required)

Firebase Console → **Authentication → Sign-in method → Anonymous → Enable**.
The client signs every player in anonymously before it can create or join a
room; without this the app loads but nobody can connect.

## 5. Deploy the game server to Cloud Run

```bash
cd services/game
gcloud run deploy word-rush-arena-game \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars GOOGLE_CLOUD_PROJECT=wordrusharena,NODE_ENV=production
```

Copy the printed **Service URL**, e.g. `https://word-rush-arena-game-xxxxx-ew.a.run.app`.
The game client needs it as a WebSocket URL: `wss://<that host>/game`.

`GOOGLE_CLOUD_PROJECT` is required so the server can verify Firebase ID tokens
with Application Default Credentials (Cloud Run's attached service account
already has everything it needs — no key file required).

## 6. Build the Flutter web client against that server

```bash
cd ../../apps/game
flutter pub get
flutter build web --release --dart-define=GAME_SERVER_URL=wss://word-rush-arena-game-xxxxx-ew.a.run.app/game
```

## 7. Deploy the web build to Firebase Hosting

```bash
cd ../..
firebase deploy --only hosting --project wordrusharena
```

The command prints the live Hosting URL (typically `https://wordrusharena.web.app`).
That link is where you and your friends play.

## Notes

- App Check is not yet enforced server-side (see `docs/FIREBASE.md`), so a
  `FIREBASE_APP_CHECK_SITE_KEY` isn't required for this first deploy. Add it
  later when App Check verification lands in the game service.
- Redeploying the server (step 5) reuses the same Cloud Run URL as long as the
  service name and region stay the same, so step 6 only needs to change if
  you rename or move the service.
