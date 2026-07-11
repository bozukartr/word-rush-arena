# Roadmap

## Phase 0 — Decisions and contracts

Goal: remove ambiguity before UI and networking implementation diverge.

- Lock round duration, duplicate rule, scoring curve, and Turkish normalization
- Define protocol messages, room state machine, errors, and reconnect semantics
- Select initial dictionary source and licensing approach
- Establish Flutter and Node/TypeScript project conventions
- Add linting, formatting, unit tests, and CI
- Define device test matrix and performance instrumentation

Exit: protocol and scoring fixtures can be tested deterministically.

## Phase 1 — Private-room vertical slice

Goal: two real devices can complete a reliable match.

- Create room and generate six-character code
- Join by code
- Lobby roster, host, ready state, leave, kick, and room-full handling
- Countdown and authoritative 75-second timer
- Shared letter pool
- Tap/drag selection and word submission
- Server validation, scoring, and result screen
- Rematch and return-to-lobby

Exit: repeated 2-player matches complete without manual recovery.

## Phase 2 — Mobile quality and resilience

Goal: the game feels instant and remains usable across devices and network changes.

- Final HUD hierarchy and responsive layout
- Safe-area, cutout, keyboard, tablet, and text-scaling coverage
- Haptics, audio, reduced motion, and accessibility states
- Frame-time and touch-latency instrumentation
- Reconnect grace period and authoritative snapshot recovery
- Background/foreground lifecycle handling
- Idempotent submission and duplicate-tap protection
- Mid-tier Android and representative iOS performance pass

Exit: device matrix and poor-network scenarios meet agreed acceptance criteria.

## Phase 3 — Backend durability and abuse controls

- PostgreSQL match summaries and player identity
- Redis room lookup, presence, rate limits, and distributed coordination
- Dictionary/scoring versioning
- Audit event trail
- Room-code brute-force prevention
- Submission-rate anomaly detection
- Crash reporting, structured logs, and dashboards

Exit: staged environment can be operated and investigated safely.

## Phase 4 — Competitive systems

- Quick match
- MMR/ELO calibration
- Ranked seasons and leagues
- Placement matches
- Disconnect and abandonment policy
- Leaderboards with anti-abuse review
- Daily competition and friend invites

Exit: matchmaking produces fair games with explainable rating changes.

## Phase 5 — Retention and monetization

- Cosmetic profile, tiles, trails, emotes, and result celebrations
- Daily/weekly missions
- Non-pay-to-win progression
- Live configuration and experiments
- Consent-aware analytics
- Store readiness, localization, privacy, and moderation workflows

Exit: soft-launch candidate with measurable retention and fair monetization.

## Initial backlog priority

### P0

- Room state machine and code service
- Turkish Unicode normalization tests
- Server-authoritative timer, validation, and scoring
- Mobile safe-area shell
- Low-latency letter selection
- Reconnect and submission idempotency

### P1

- Results, rematch, telemetry, accessibility
- Redis/PostgreSQL integration
- Abuse controls and operational dashboards

### P2

- Ranked matchmaking, progression, cosmetics, events
