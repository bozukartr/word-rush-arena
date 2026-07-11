# Development

## Prerequisites

- Flutter stable
- Node.js 22+
- Firebase CLI
- A Firebase development project

## Game server

```bash
cd services/game
npm ci
ALLOW_INSECURE_AUTH=true npm run dev
```

Health check: `http://localhost:8080/healthz`

## Flutter web client

Generate missing native platform folders once when Android/iOS builds are needed:

```bash
cd apps/game
flutter create . --platforms=android,ios,web --project-name word_rush_arena
```

Run the web client against the local game server:

```bash
flutter pub get
flutter run -d chrome --dart-define=GAME_SERVER_URL=ws://localhost:8080/game
```

Without Firebase compile-time values, local development uses the server's insecure development identity. Never enable `ALLOW_INSECURE_AUTH` in production.

## Firebase-enabled build

```bash
flutter build web \
  --dart-define=GAME_SERVER_URL=wss://GAME_SERVICE_HOST/game \
  --dart-define=FIREBASE_API_KEY=... \
  --dart-define=FIREBASE_APP_ID=... \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=... \
  --dart-define=FIREBASE_PROJECT_ID=... \
  --dart-define=FIREBASE_AUTH_DOMAIN=... \
  --dart-define=FIREBASE_STORAGE_BUCKET=...
```

Never commit service-account credentials. Firebase client configuration is public by design, but production values should still be injected by the build pipeline so environments cannot be mixed accidentally.

## Firebase emulators and Hosting

```bash
cp .firebaserc.example .firebaserc
firebase emulators:start
firebase hosting:channel:deploy preview
```

Replace the example project and Hosting target before deployment.
