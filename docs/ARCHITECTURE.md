# Architecture

## System boundaries

### Flutter mobile client

Responsible for rendering, safe-area layout, touch handling, local prediction, haptics, audio, reconnect UX, and Firebase SDK integrations. It never decides whether a submitted word or score is final.

### Firebase platform

- **Hosting:** Flutter Web/PWA assets, global CDN, SSL, custom domain, and preview channels\n- **Authentication:** anonymous-first identity with optional account upgrade
- **Firestore:** player profiles, public progression, server-written match summaries, ratings, cosmetics, moderation state
- **App Check:** attestation for mobile requests and custom-backend calls
- **Analytics, Crashlytics, Performance:** product and client quality telemetry
- **Remote Config:** versioned rollout flags and non-authoritative UX configuration
- **Cloud Messaging:** invites, social events, and asynchronous notifications
- **Cloud Functions (2nd gen):** scheduled jobs, notification fan-out, leaderboard materialization, moderation and maintenance
- **Cloud Storage:** versioned non-secret assets where needed

Firestore is not the authoritative live match transport. Firebase Hosting serves the web client but does not execute the match loop.

### Firebase Hosting\n\nFirebase Hosting serves the compiled Flutter Web/PWA bundle and optional landing/admin static assets. HTTPS API routes may be rewritten to Cloud Functions or Cloud Run where appropriate. The realtime client connects directly to the dedicated Cloud Run WebSocket endpoint over `wss://`; Hosting is not treated as the game server.\n\nLong-cache hashed assets, short-cache app shells, preview channels, and per-environment Hosting sites are required. Native iOS and Android builds are distributed through their normal app channels, not Firebase Hosting.\n\n### Colyseus game service on Cloud Run

Owns room lifecycle, membership, ready states, authoritative timer, letter pool, word validation, duplicate policy, scoring, results, reconnect snapshots, and abuse controls. It verifies Firebase ID tokens and App Check tokens before admitting a player.

Cloud Run is used because live matches require a dedicated WebSocket-capable process. Cloud Functions are reserved for short-lived or event-driven work, not the match loop.

### Google Cloud Memorystore

Stores short-lived room lookup data, distributed locks, rate limits, presence, matchmaking queues, and reconnect tokens when the service scales beyond one instance. The first vertical slice may use one warm Cloud Run instance but must not embed client trust in process-local state.

## Repository boundaries

```text
apps/game/
  lib/
    app/
    core/firebase/
    features/auth/
    features/rooms/
    features/match/
    features/results/
    design_system/

services/game/
  src/
    auth/
    rooms/
    match/
    dictionary/
    scoring/
    security/
    telemetry/

functions/
  src/
    notifications/
    leaderboards/
    maintenance/
    moderation/

firebase/
  firestore.rules
  firestore.indexes.json
  storage.rules
  emulator/
```

## Identity and session flow

1. Native or web game client creates or restores a Firebase Auth session.
2. App obtains a Firebase ID token and App Check token.
3. Client requests room creation/join from the game service.
4. Game service verifies both tokens using Firebase Admin SDK.
5. Server maps the Firebase UID to an in-memory player seat and issues an opaque room reconnect token.
6. Only the game service or trusted Functions write protected match and rating documents.

## Room protocol

Room states:

```text
created -> lobby -> countdown -> playing -> results -> closed
```

Required commands:

- create room
- join by code
- leave
- ready/unready
- host start
- submit word
- heartbeat
- reconnect
- request rematch

Every client command carries a protocol version and request identifier. Word submissions also carry a monotonic local sequence number. The server replies with accepted/rejected status and the resulting authoritative state version.

## Reconnect

- Server issues an opaque reconnect token scoped to Firebase UID, player, room, and expiry.
- Client stores it only for the active session.
- On reconnect, server verifies identity and token, then returns a full authoritative snapshot.
- Client discards conflicting predicted state and resumes from the server state.
- A reconnecting player cannot replay accepted word submissions.

## Word validation pipeline

1. Verify authenticated player, App Check, room membership, and rate limits.
2. Normalize Unicode consistently, including Turkish casing rules.
3. Validate length and allowed characters.
4. Confirm the word can be built from the current letter pool.
5. Check dictionary membership and banned-word policy.
6. Apply duplicate/ownership rule atomically.
7. Calculate score from server configuration.
8. Persist or buffer the accepted event.
9. Broadcast the minimal authoritative delta.

Dictionary, scoring, and protocol versions are attached to every match summary.

## Firestore trust boundary

Game clients may read permitted profile and public competition data and may update narrowly scoped preferences. Security Rules deny direct client writes to:

- accepted words and score
- match results
- rating/MMR
- inventory and purchase grants
- moderation state
- authoritative room lifecycle
- leaderboard aggregates

Remote Config may tune presentation and rollout behavior, but authoritative scoring constants are loaded and validated by the game service.

## Security and fairness

- Treat the client as untrusted.
- Verify Firebase ID token and App Check on the custom backend.
- Never accept client-computed score, time remaining, combo, or ownership.
- Rate-limit room-code guesses and word submissions.
- Make submissions idempotent.
- Use a server monotonic clock for round timing.
- Keep an audit trail sufficient to investigate disputes.
- Detect impossible submission rates, reconnect abuse, and protocol violations.
- Do not expose the complete answer set before a match ends.
- Use separate Firebase projects for development, staging, and production.

## Performance budgets

- Local touch response: next frame
- Client frame pacing: stable at target refresh rate on mid-tier devices and supported browsers\n- Hosting delivery: immutable hashed assets cached at the CDN; app shell updated safely
- Regional gameplay RTT target: below 150 ms where infrastructure permits
- Server command processing: p95 below 50 ms excluding external persistence
- Room broadcasts: compact deltas; snapshots reserved for join/reconnect/recovery
- Word lookup: in-memory indexed structure with deterministic normalization

These are engineering targets, not promises; Firebase Performance, Cloud Monitoring, and server telemetry must measure real devices and regions.
