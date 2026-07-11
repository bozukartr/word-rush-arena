# Game Design

## Core loop

1. A host creates a private room and receives a six-character code.
2. Players join with the code, choose a display name, and mark themselves ready.
3. The server generates one shared letter pool and starts a 75-second round.
4. Players tap or drag across letters, then submit candidate words.
5. The server validates the word, letter usage, duplicate policy, timing, and score.
6. Accepted words update score and combo; rejected words return a precise reason.
7. The round ends on the authoritative server timer, followed by results and rematch.

## Room-code experience

- Alphabet excludes visually ambiguous characters such as 0/O and 1/I.
- Codes are case-insensitive and normalized on input.
- Default capacity is 4; MVP must also support 2-player matches.
- Host may start only when the minimum player count is reached and all non-spectators are ready.
- A disconnected player keeps their seat for a short grace period.
- Expired and completed rooms are cleaned up automatically.
- Join attempts are rate-limited by IP, device, and room code.
- Room errors are explicit: not found, full, started, expired, or temporarily locked.

## Scoring proposal

Base score is driven by word length and letter rarity. Combo rewards rapid valid submissions without making one early lead impossible to recover.

- 3 letters: 100 base points
- 4 letters: 180
- 5 letters: 300
- 6 letters: 460
- 7+ letters: 650 plus a per-letter bonus
- Rare-letter modifier: configurable server-side
- Combo: small capped multiplier that resets on timeout or invalid submission
- Duplicate rule: configurable before implementation testing; recommended MVP rule is “first valid submission owns the word”

All scoring constants must be server-configured and covered by deterministic tests.

## Competitive principles

- Skill comes from vocabulary, pattern recognition, speed, and timing.
- Purchases never affect letters, validation, score, timer, or matchmaking.
- Powers, if added, must be earned equally within the match and remain readable to opponents.
- A losing player should always understand why the score changed.

## Mobile HUD

### Top safe zone

- Authoritative round timer
- Local score and rank
- Network/reconnecting indicator
- Pause/settings access outside ranked play

### Play field

- Shared letter pool
- Current selection path
- Immediate valid/invalid/pending feedback
- Compact opponent score and progress indicators
- Combo and score-delta animation without covering letters

### Bottom thumb zone

- Current word
- Clear/backspace
- Large submit target
- Optional powers with cooldown state
- Controls remain reachable one-handed where practical

## Safe-area rules

- Use platform safe-area insets instead of fixed top or bottom padding.
- Never place essential controls under notches, camera cutouts, Dynamic Island, home indicators, or gesture bars.
- Recalculate layout when orientation, keyboard, split-screen, or window metrics change.
- Keyboard appearance must not hide submit or current-word feedback.
- Minimum touch target: 48 logical pixels; destructive and submit actions need clear separation.
- Test compact phones, tall phones, cutout devices, tablets, and accessibility text scaling.

## Touch and latency targets

- Local visual response begins on the next rendered frame.
- Pointer-down state is visible before server acknowledgement.
- Drag selection samples pointer movement continuously and handles skipped tiles deterministically.
- Submit uses one logical action with idempotency protection; repeated taps cannot create duplicate submissions.
- Haptics and short audio cues are triggered from local state while final acceptance remains server-authoritative.
- Input stays responsive during score animation and opponent updates.
- Gameplay should sustain the target refresh rate without shader or layout jank on representative mid-tier devices.

## Accessibility

- Never communicate validity or rank by color alone.
- Provide reduced motion, haptic toggle, audio controls, and readable contrast.
- Support Turkish characters correctly in input, normalization, font rendering, and screen-reader labels.
