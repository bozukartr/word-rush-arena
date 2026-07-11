# Word Rush Arena

Competitive, hyper-casual multiplayer word puzzle designed for fast mobile sessions.

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
- Ranked matchmaking and MMR after the private-room vertical slice is stable

## Proposed stack

- **Mobile:** Flutter
- **Realtime server:** Node.js, TypeScript, Colyseus
- **Persistence:** PostgreSQL
- **Ephemeral state / matchmaking:** Redis
- **Shared contracts:** versioned JSON schemas and protocol documentation

## Repository layout

```text
apps/mobile/       Flutter client
services/game/     Realtime game server
packages/shared/   Shared contracts and validation fixtures
docs/              Product, UX, architecture, and delivery plans
```

## Core quality targets

- Touch feedback begins on the next rendered frame
- No network round-trip is required for local input feedback
- Server remains authoritative for accepted words and score
- Gameplay stays usable around notches, Dynamic Island, cutouts, gesture bars, and keyboards
- Rejoining players recover the authoritative room snapshot
- No client-submitted score is trusted

## Delivery order

1. Product rules and protocol contracts
2. Room creation, room-code join, lobby, ready state, reconnect
3. Core word loop and server validation
4. Mobile HUD, safe areas, touch latency, haptics
5. Match results, rematch, telemetry, abuse controls
6. Ranked matchmaking, MMR, progression, cosmetics

See [Game Design](docs/GAME_DESIGN.md), [Architecture](docs/ARCHITECTURE.md), and [Roadmap](docs/ROADMAP.md).

## Status

Pre-production foundation. The first implementation milestone is a playable private-room vertical slice.
