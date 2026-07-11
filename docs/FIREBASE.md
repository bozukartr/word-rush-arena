# Firebase Plan

## Role of Firebase

Firebase provides web/PWA delivery, identity, durable product data, client observability, messaging, live configuration, and local emulation. It does not replace the server-authoritative WebSocket match service.

## Firebase products

| Product | MVP use |
| --- | --- |
| Hosting | Flutter Web/PWA delivery, CDN, SSL, custom domains, and preview channels |\n| Authentication | Anonymous-first player UID; later upgrade to platform or email sign-in |
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

Use a dedicated Hosting site and preview channels per environment. Never reuse production credentials, Firestore, analytics, Hosting targets, or notification targets in development. Commit only generated non-secret Firebase client configuration that is safe for mobile distribution; keep service-account credentials and server secrets outside Git.

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

## Firebase Hosting\n\nFirebase Hosting deploys the Flutter web build from `apps/game/build/web`. Recommended behavior:\n\n- rewrite SPA routes to `/index.html`\n- cache fingerprinted assets as public and immutable\n- keep `index.html`, service-worker metadata, and bootstrap files on short/no cache\n- use preview channels for pull requests and acceptance testing\n- configure separate development, staging, and production Hosting targets\n- attach the production custom domain only after staging acceptance\n- route ordinary HTTPS endpoints to Functions/Cloud Run only when useful\n- connect realtime play directly to the Cloud Run `wss://` endpoint\n\nFirebase Hosting does not distribute native iOS/Android binaries and does not replace the WebSocket game process.\n\n## Cloud Run game service

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
- Load-test Cloud Run concurrency and minimum instances before soft launch.\n- Set deliberate Hosting cache headers to avoid stale Flutter app shells.
