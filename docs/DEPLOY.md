# Manual deploy (first live link)

One-time steps to get a real, playable URL on the `wordrusharena` Firebase
project. Run everything from your own machine — this requires your Google
account, which cannot be done from an automated session. No billing/credit
card is required: the whole stack (Hosting + Firestore + Authentication) runs
on Firebase's free Spark plan.

## Prerequisites

- Firebase CLI: `npm install -g firebase-tools`
- Flutter stable: https://docs.flutter.dev/get-started/install

## 1. Authenticate

```bash
firebase login
```

## 2. Enable Anonymous Authentication (required)

Firebase Console → **Authentication → Sign-in method → Anonymous → Enable**.
The client signs every player in anonymously before it can create or join a
room; without this the app loads but nobody can connect.

## 3. Build the Flutter web client

```bash
cd apps/game
flutter pub get
flutter build web --release
```

## 4. Deploy Hosting + Firestore rules

```bash
cd ..
firebase deploy --only hosting,firestore:rules,firestore:indexes --project wordrusharena
```

The command prints the live Hosting URL (typically `https://wordrusharena.web.app`).
That link is where you and your friends play.

## Notes and current trade-offs

- There is no dedicated game server: word validation, letter-availability
  checks, and scoring are computed by each player's own client, with Firestore
  Security Rules (`firebase/firestore.rules`) enforcing what's structurally
  checkable without a trusted backend — players can't rewrite each other's
  scores, impersonate another player, re-claim an already-claimed word, or
  start a match they don't host. A technically motivated player could still
  open browser devtools and submit a forged word/score for *themselves*,
  since nothing server-side re-checks the dictionary or letter pool. Fine for
  casual play with friends; not suitable for a competitive/public leaderboard.
- `services/game` (the earlier Cloud Run-based authoritative server) is kept
  in the repo for reference but isn't part of this deploy path. Moving to it
  later would close the gap above, at the cost of requiring the Blaze billing
  plan (Cloud Run/Cloud Build aren't available on Spark).
- Redeploying only changes what you pass to `--only`; `firestore:rules` is
  cheap to redeploy any time the rules file changes.
