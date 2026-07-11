# Development

Firebase project: `wordrusharena`

The current vertical slice runs entirely on Firebase's free Spark plan:
Firestore holds room/lobby/match state and the Flutter client reads/writes it
directly (see `firebase/firestore.rules`). There is no separate game server to
run — `services/game` is an earlier Cloud Run-based design kept for reference
if the project later needs fully trusted server-side word validation; it is
not part of the current build or deploy path.

## Prerequisites

- Flutter stable
- Firebase CLI
- Access to the `wordrusharena` Firebase project

## Flutter web client

Generate missing native platform folders once when Android/iOS builds are needed:

```bash
cd apps/game
flutter create . --platforms=android,ios,web --project-name word_rush_arena
```

Run against the real `wordrusharena` Firebase project (Firestore/Auth are
live, so use this for real play, not automated tests):

```bash
flutter pub get
flutter run -d chrome
```

Anonymous Authentication must be enabled once in the Firebase Console
(**Authentication → Sign-in method → Anonymous**), otherwise players can't
sign in to create or join a room.

## Firebase emulators (offline development)

```bash
firebase emulators:start
```

Point the client at the emulators for local-only testing by adding this near
the top of `main()` in `apps/game/lib/main.dart` (temporarily, for local runs
only — do not commit it):

```dart
FirebaseFirestore.instance.useFirestoreEmulator('localhost', 8081);
await FirebaseAuth.instance.useAuthEmulator('localhost', 9099);
```

## Deploying

```bash
flutter build web --release
firebase deploy --only hosting,firestore:rules,firestore:indexes --project wordrusharena
```

See `docs/DEPLOY.md` for the full first-time walkthrough. `FIREBASE_APP_CHECK_SITE_KEY`
is optional for now — App Check isn't enforced on Firestore yet, and a missing
key no longer crashes the app (bootstrap failures are caught and logged).

Never commit service-account credentials or private keys.
