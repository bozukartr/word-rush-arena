# Development

Firebase project: `wordrusharena`

## Prerequisites

- Flutter stable
- Node.js 22+
- Firebase CLI
- Access to the `wordrusharena` Firebase project

## Game server

```bash
cd services/game
npm install
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

The committed Web App configuration initializes Firebase Authentication and Analytics. The local game server accepts an insecure development identity only when `ALLOW_INSECURE_AUTH=true`; never enable it in production.

## Firebase-enabled web build

The registered Firebase Web App configuration is stored in `firebase_options.dart`. Only the deployed game-server URL is injected at build time.

```bash
flutter build web \
  --dart-define=GAME_SERVER_URL=wss://GAME_SERVICE_HOST/game
```

Android and iOS require their own Firebase app registrations and platform-specific options. Do not reuse the Web App ID for native builds.

## Firebase emulators and Hosting

```bash
firebase use wordrusharena
firebase emulators:start
firebase hosting:channel:deploy preview --project wordrusharena
```

Production deployment:

```bash
firebase deploy --only hosting,firestore:rules,firestore:indexes,storage --project wordrusharena
```

Never commit service-account credentials or private keys.
