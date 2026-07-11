# Architecture

## System boundaries

### Flutter mobile client

Responsible for rendering, safe-area layout, touch handling, local prediction, haptics, audio, reconnect UX, and telemetry. It never decides whether a submitted word or score is final.

### Colyseus game service

Owns room lifecycle, membership, ready states, authoritative timer, letter pool, word validation, duplicate policy, scoring, results, reconnect snapshots, and abuse controls.

### PostgreSQL

Stores accounts, player profiles, match summaries, ratings, progression, cosmetics, moderation actions, and audit-friendly result records.

### Redis

Stores short-lived room lookup data, distributed locks, rate limits, presence, matchmaking queues, and reconnect tokens. An MVP may begin with a single game-service process but must keep room rules independent of process-local UI assumptions.

## Repository boundaries

```text
apps/mobile/
  lib/
    app/
    core/
    features/rooms/
    features/match/
    features/results/
    design_system/

services/game/
  src/
    rooms/
    match/
    dictionary/
    scoring/
    security/
    telemetry/

packages/shared/
  protocol/
  schemas/
  fixtures/
```

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

- Server issues an opaque reconnect token scoped to player, room, and expiry.
- Client stores it only for the active session.
- On reconnect, server validates the token and returns a full authoritative snapshot.
- Client discards conflicting predicted state, reapplies unacknowledged safe UI actions where appropriate, and resumes.
- A reconnecting player cannot replay accepted word submissions.

## Word validation pipeline

1. Normalize Unicode consistently, including Turkish casing rules.
2. Validate length and allowed characters.
3. Confirm the word can be built from the current letter pool.
4. Check dictionary membership and banned-word policy.
5. Apply duplicate/ownership rule atomically.
6. Calculate score from server configuration.
7. Persist or buffer the accepted event.
8. Broadcast the minimal authoritative delta.

Dictionary version and scoring configuration version are attached to every match record.

## Security and fairness

- Treat the client as untrusted.
- Never accept client-computed score, time remaining, combo, or ownership.
- Rate-limit room-code guesses and word submissions.
- Make submissions idempotent.
- Use a server monotonic clock for round timing.
- Keep an append-only match event trail sufficient to investigate disputes.
- Detect impossible submission rates, repeated reconnect abuse, and modified-client protocol violations.
- Do not expose the complete answer set to clients before a match ends.

## Performance budgets

- Local touch response: next frame
- Client frame pacing: stable at target refresh rate on mid-tier devices
- Regional gameplay RTT target: below 150 ms where infrastructure permits
- Server command processing: p95 below 50 ms excluding external persistence
- Room broadcasts: compact deltas; snapshots reserved for join/reconnect/recovery
- Word lookup: in-memory indexed structure with deterministic normalization

These are engineering targets, not promises; telemetry must measure real devices and regions.
