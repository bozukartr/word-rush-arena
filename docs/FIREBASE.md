# Firebase Plan

## Role of Firebase

Firebase provides identity, durable product data, mobile observability, messaging, live configuration, and local emulation. It does not replace the server-authoritative WebSocket match service.

## Firebase products

| Product | MVP use |
| --- | --- |
| Authentication | Anonymous-first player UID; later upgrade to platform or email sign-in |
| Firestore | Profiles, settings, server-written match summaries, public rank views, cosmetics |
| App Check | Attest Flutter clients and protect Firebase/custom backend requests |
| Crashlytics | Crash and non-fatal error diagnostics |
| Performance Monitoring | Startup, screen, and network traces |
| Analytics | Consent-aware funnel and gameplay events |
| Remote Config | Feature rollout and presentation tuning |
| Cloud Messaging | Invites and asynchronous social/event notifications |
| Cloud Functions 2nd gen | Scheduled jobs, notifications, maintenance, aggregates |
| Cloud Storage | Versioned public assets when required |
| Emulator Suite | Local development and Security Rules tests |

## Environment strategy

Use three separate Firebase projects:

- development
- staging
- production

Never reuse production credentials, Firestore, analytics, or notification targets in development. Commit only generated non-secret Firebase client configuration that is safe for mobile distribution; keep service-account credentials and server secrets outside Git.

## Initial Firestore model

```text
users/{uid}
  publicProfile
  settings
  progression        # trusted write only
  inventory          # trusted write only

matches/{matchId}    # trusted write only
  participants
  summary
  scoringVersion
  dictionaryVersion
  createdAt

seasons/{seasonId}
  publicMetadata
  leaderboard/{uid}  # trusted write only

moderation/{uid}     # trusted/admin only
```

Live letter selections, authoritative timers, accepted words, and rapidly changing match state remain in the Colyseus room, not Firestore.

## Security Rules principles

- Default deny.
- A user may read/update only explicitly allowed preference fields on their own profile.
- Clients cannot create or update match summaries, ratings, inventory grants, leaderboards, or moderation data.
- Public profile reads expose only a documented allowlist.
- Server code uses Firebase Admin SDK and validates all mutations.
- Emulator tests cover allowed and denied paths before deployment.

## Authentication

Start with anonymous authentication so the first launch has minimal friction. Preserve the UID when linking to a permanent provider. Display names are moderated separately and are never used as authorization identifiers.

## App Check

Enforce App Check gradually:

1. Integrate in development with debug providers.
2. Measure valid/invalid traffic in staging.
3. Verify App Check tokens in the Cloud Run game service.
4. Enable enforcement for supported Firebase products.
5. Monitor false rejections before full production rollout.

App Check raises the cost of abuse but does not replace server validation or rate limiting.

## Cloud Run game service

Colyseus runs as a dedicated Cloud Run service with WebSocket support. Configure:

- regional placement near the initial player market
- minimum warm instances for acceptable cold-start behavior
- bounded concurrency based on load testing
- request timeout compatible with match sessions
- graceful shutdown and reconnect handling
- Firebase Admin SDK verification
- structured logging and Cloud Monitoring
- Memorystore coordination before multi-instance room routing

## Analytics event baseline

- app_open
- auth_ready
- room_create
- room_join_attempt / success / failure
- lobby_ready
- match_start
- word_submit / accepted / rejected
- reconnect_start / success / failure
- match_complete
- rematch
- tutorial_complete

Do not log submitted word text, room codes, tokens, or other sensitive payloads in analytics or crash breadcrumbs.

## Cost controls

- Set Google Cloud budgets and alert thresholds before staging.
- Define Firestore indexes deliberately.
- Avoid using Firestore as a high-frequency game-state bus.
- Sample verbose telemetry.
- Apply retention policies to logs and temporary data.
- Load-test Cloud Run concurrency and minimum instances before soft launch.
