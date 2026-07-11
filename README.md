# Word Rush Arena

Competitive, hyper-casual multiplayer word puzzle designed for fast mobile and web sessions.

## Product vision

Players race against each other to build valid words from the same letter pool. Matches are short, readable at a glance, and decided by vocabulary, speed, combo control, and limited tactical powers—not pay-to-win advantages.

## MVP

- 2–4 player private rooms
- Join by a 6-character room code
- Host controls and ready checks
- 75-second real-time matches
- Server-authoritative word validation and scoring
- Turkish-first dictionary support
- Combo, streak, and opponent progress feedback
- Reconnect grace period
- Mobile-first HUD with safe-area support
- Low-latency tap, drag, submit, haptic, and audio feedback
- Flutter Web/PWA delivery through Firebase Hosting
- Firebase-backed identity, player data, telemetry, messaging, and live configuration
- Ranked matchmaking and MMR after the private-room vertical slice is stable

## Proposed stack

- **Game client:** Flutter for Web/PWA, iOS, and Android
- **Firebase project:** `wordrusharena`\n- **Firebase:** Authentication, Firestore, App Check, Analytics, Crashlytics, Performance Monitoring, Remote Config, Cloud Messaging
- **Realtime game server:** Node.js, TypeScript, JSON WebSocket service on Google Cloud Run
- **Serverless workflows:** Cloud Functions for Firebase (2nd gen)
- **Ephemeral state / scale-out:** Redis-compatible Google Cloud Memorystore when multi-instance coordination is required
- **Shared contracts:** versioned JSON schemas and protocol documentation

Firebase is the product platform, but the live match remains server-authoritative. Firestore clients never write scores, ratings, accepted words, or match results directly.

## Repository layout

```text
apps/game/         Flutter client for iOS, Android, and Web
services/game/     Authoritative JSON WebSocket game server
functions/         Firebase Functions for non-realtime workflows
packages/shared/   Shared contracts and validation fixtures
firebase/          Hosting config, rules, indexes, emulator fixtures
docs/              Product, UX, architecture, and delivery plans
```

## Core quality targets

- Touch feedback begins on the next rendered frame
- No network round-trip is required for local input feedback
- Server remains authoritative for accepted words and score
- Gameplay stays usable around notches, Dynamic Island, cutouts, gesture bars, keyboards, and responsive browser viewports
- Rejoining players recover the authoritative room snapshot
- No client-submitted score is trusted
- App Check and Firebase Security Rules enforce the client trust boundary

## Delivery order

1. Product rules, Firebase environments, Hosting preview channels, and protocol contracts
2. Anonymous Firebase Authentication, room creation, code join, lobby, ready state, reconnect
3. Core word loop and server validation on Cloud Run
4. Mobile HUD, safe areas, touch latency, haptics
5. Results, Firestore persistence, telemetry, abuse controls
6. Ranked matchmaking, MMR, progression, cosmetics, messaging

See [Game Design](docs/GAME_DESIGN.md), [Architecture](docs/ARCHITECTURE.md), [Firebase Plan](docs/FIREBASE.md), and [Roadmap](docs/ROADMAP.md).

## Status

Pre-production foundation. The first implementation milestone is a playable Firebase Hosting-integrated private-room vertical slice, with native mobile builds from the same Flutter codebase.

The currently deployable slice runs entirely on Firebase's free Spark plan: the
Flutter client talks to Firestore directly (see `firebase/firestore.rules`)
instead of the `services/game` WebSocket server described above and in
`docs/ARCHITECTURE.md`. That server design is kept for when the project needs
fully trusted, server-authoritative word validation again — see
`docs/DEPLOY.md` for the current deploy steps and the exact trade-offs.
