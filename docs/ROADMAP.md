# Roadmap

## Phase 0 — Decisions, Firebase foundation, and contracts

Goal: remove ambiguity before UI and networking implementation diverge.

- Lock round duration, duplicate rule, scoring curve, and Turkish normalization
- Define protocol messages, room state machine, errors, and reconnect semantics
- Select initial dictionary source and licensing approach
- Create separate Firebase development, staging, and production projects
- Configure FlutterFire, Firebase Hosting, preview channels, Firebase Emulator Suite, Authentication, Firestore, App Check, Analytics, Crashlytics, Performance, Remote Config, and Cloud Messaging
- Draft Firestore/Storage Security Rules and indexes
- Establish Flutter and Node/TypeScript project conventions
- Add linting, formatting, unit tests, emulator tests, and CI
- Define device test matrix and performance instrumentation

Exit: Firebase emulators run locally, a Flutter Web shell deploys to a Hosting preview channel, and protocol/scoring fixtures pass deterministically.

## Phase 1 — Firebase-integrated private-room vertical slice

Goal: two real devices can complete a reliable match.

- Build the Flutter client for iOS, Android, and Web/PWA from one codebase\n- Deploy the web client to a Firebase Hosting preview channel\n- Anonymous Firebase Authentication with stable UID
- Firebase ID token and App Check verification in the game service
- Deploy a warm development Colyseus service to Cloud Run
- Create room and generate six-character code
- Join by code
- Lobby roster, host, ready state, leave, kick, and room-full handling
- Countdown and authoritative 75-second timer
- Shared letter pool
- Tap/drag selection and word submission
- Server validation, scoring, and result screen
- Server-written Firestore match summary
- Rematch and return-to-lobby

Exit: repeated 2-player matches complete without manual recovery and clients cannot forge protected Firestore data.

## Phase 2 — Cross-platform quality and resilience

Goal: the game feels instant and remains usable across mobile devices, supported browsers, and network changes.

- Final HUD hierarchy and responsive layout
- Safe-area, cutout, keyboard, tablet, and text-scaling coverage
- Haptics, audio, reduced motion, and accessibility states
- Firebase Crashlytics and Performance instrumentation
- Frame-time and touch-latency telemetry
- Reconnect grace period and authoritative snapshot recovery
- Background/foreground lifecycle handling
- Idempotent submission and duplicate-tap protection
- Mid-tier Android, representative iOS, mobile Safari, and Chromium performance pass\n- Firebase Hosting cache, service-worker update, offline shell, and rollback tests

Exit: device matrix and poor-network scenarios meet agreed acceptance criteria.

## Phase 3 — Backend durability and abuse controls

- Firestore player profiles, match summaries, progression, and moderation documents
- Security Rules and emulator test coverage
- Cloud Functions for scheduled maintenance, notifications, and leaderboard aggregation
- Cloud Messaging invite and social notification flows
- Remote Config rollout flags
- Memorystore room lookup, presence, rate limits, and distributed coordination when scaling out
- Dictionary/scoring versioning
- Audit event trail
- Room-code brute-force prevention
- Submission-rate anomaly detection
- Structured logs, alerts, and dashboards

Exit: staged Firebase/Google Cloud environment can be operated and investigated safely.

## Phase 4 — Competitive systems

- Quick match
- MMR/ELO calibration with trusted server writes
- Ranked seasons and leagues
- Placement matches
- Disconnect and abandonment policy
- Firestore-backed public leaderboard views
- Leaderboards with anti-abuse review
- Daily competition and friend invites

Exit: matchmaking produces fair games with explainable rating changes.

## Phase 5 — Retention and monetization

- Cosmetic profile, tiles, trails, emotes, and result celebrations
- Daily/weekly missions
- Non-pay-to-win progression
- Remote Config experiments and staged rollouts
- Consent-aware Firebase Analytics
- FCM retention and event messaging
- Store readiness, localization, privacy, account deletion, and moderation workflows

Exit: soft-launch candidate with measurable retention and fair monetization.

## Initial backlog priority

### P0

- Firebase project separation, FlutterFire setup, and Hosting targets\n- Hosting preview-channel CI and cache policy
- Auth + App Check verification path
- Firestore Security Rules and emulator tests
- Room state machine and code service
- Turkish Unicode normalization tests
- Server-authoritative timer, validation, and scoring
- Mobile safe-area shell
- Low-latency letter selection
- Reconnect and submission idempotency

### P1

- Results, Firestore summaries, Crashlytics, Performance, accessibility
- Cloud Functions and Cloud Messaging
- Memorystore integration for scale-out
- Abuse controls and operational dashboards

### P2

- Ranked matchmaking, progression, cosmetics, experiments, events
