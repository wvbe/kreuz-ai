# Feature Specification: Game Loop & Time Progression

**Feature Branch**: `001-game-loop`
**Created**: 2026-05-02
**Status**: Unimplemented (fresh start)
**Input**: User description: "An important part of the game is the game loop, ie. the passage of time. It needs to have pause/continue, speed up/down controls, and it must be independent of the render loop (because a renderer is not required to play the game). The game experience will be measured in hours, days, weeks -- 1x game speed is about 48x realtime."

> **Note (2026-05-04)**: A previous implementation of this feature was discarded. This spec is being reimplemented from scratch following the conventions in spec 023 (TypeScript code style). All code lives under `src/game/`, tests are co-located, no barrel files, no default exports. Entities are pure data objects; systems provide behavior. See spec 023 for the full code style reference.


## User Scenarios & Testing _(mandatory)_

### User Story 1 - Pause and Resume Game Time (Priority: P1)

The player needs to be able to pause the game's internal time progression while maintaining the ability to inspect game state, read UI information, or perform administrative actions. When resumed, game time continues from where it left off without loss of state or desynchronization.

**Why this priority**: Pause is fundamental to single-player game experience; enables player control over pacing and allows investigation of game state without simulation progression.

**Independent Test**: Can be fully tested by starting a game, pausing, verifying that one full game tick cycle does not advance time, then resuming and confirming time advances normally. Delivers core pause/resume mechanic.

**Acceptance Scenarios**:

1. **Given** a running game with game time at 100 hours, **When** player invokes pause command, **Then** subsequent game ticks do not advance game time and pause state is recorded in game state.
2. **Given** a paused game, **When** player invokes resume command, **Then** game time advances normally on next tick and pause state is cleared.
3. **Given** a paused game at time T, **When** player queries current game time, **Then** the time returns T (no drift during pause).
4. **Given** a paused game, **When** player saves the game, **Then** the saved state includes pause flag and can be loaded in paused state.

---

### User Story 2 - Adjust Game Speed (Priority: P2)

The player can increase or decrease the simulation speed independent of the real-world passage of time. This allows players to speed through early-game or slow down during critical decision points. Speed adjustments take effect immediately on the next game tick.

**Why this priority**: Enables varied gameplay pacing; P2 because pause covers minimum control, but speed adjustment significantly improves user experience and is core to the "48x realtime" design goal.

**Independent Test**: Can be fully tested by running game at 1x speed for N ticks, measuring elapsed game time, then switching to 2x speed and verifying time advances twice as fast per tick. Delivers speed multiplier mechanic.

**Acceptance Scenarios**:

1. **Given** a running game at 1x speed (baseline multiplier), **When** player increases speed to 2x, **Then** subsequent game ticks advance game time by 2x the normal delta.
2. **Given** a game running at 2x speed with game time at 200 hours, **When** player decreases speed to 0.5x, **Then** subsequent ticks advance by half the normal delta.
3. **Given** a game at any speed, **When** player queries current speed multiplier, **Then** the system returns the active multiplier (e.g., 1.0, 2.0, 0.5).
4. **Given** a running game at 3x speed, **When** player saves the game, **Then** the saved state includes current speed multiplier and resumes at that speed.

---

### User Story 3 - Game Loop Operates Independently from Render Loop (Priority: P1)

The game's internal time loop and simulation tick cycle MUST operate independently from any visual rendering loop. The game must advance time and process all game systems (citizen actions, job transitions, economic calculations, faction dynamics) at regular intervals regardless of whether a renderer exists, is paused, or runs at a different frame rate. This is critical to the Engine-Renderer Decoupling principle.

**Why this priority**: Architectural requirement mandated by Constitution Principle I. Enables headless operation, unit testing without rendering, and future multi-renderer support.

**Independent Test**: Can be fully tested in a headless environment (no DOM, no WebGL) by running the game loop for 100 ticks with fixed time deltas, verifying that citizens progress through job cycles, economy updates, and faction states on schedule without any render-side code executing. Demonstrates independence from rendering.

**Acceptance Scenarios**:

1. **Given** a headless game instance with no renderer attached, **When** the game loop advances 100 ticks at 1x speed, **Then** game time progresses, citizen jobs advance, economy updates, and all game systems behave identically to a rendered version.
2. **Given** a running game loop, **When** a renderer attaches mid-simulation, **Then** the game loop continues uninterrupted and provides current game state to the renderer without requiring loop synchronization.
3. **Given** a game loop and a render loop running at different frame rates (e.g., game loop 10 ticks/sec, render loop 60 fps), **When** both run concurrently, **Then** game simulation advances at the correct rate independent of render framerate.
4. **Given** a game running in headless mode with 10 ticks completed, **When** the same save state is loaded in a browser-rendered version, **Then** subsequent ticks advance identically and game state remains synchronized.

---

### User Story 4 - Game State Time is Serializable (Priority: P1)

All game time state (current elapsed time, pause status, speed multiplier) must be fully serializable to and deserializable from JSON without loss of information. When a save game is created, all time-related state is captured; when loaded, the game resumes from the exact same time offset, pause state, and speed settings.

**Why this priority**: Required by Constitution Principle II (Deterministic State & JSON Serialization). Essential for save/load functionality and scenario testing.

**Independent Test**: Can be fully tested by running a game to an arbitrary time (e.g., 500 hours), saving to JSON, inspecting the JSON structure for time fields, loading the save, and verifying game time matches and subsequent ticks advance correctly from the saved time. Delivers serialization contract.

**Acceptance Scenarios**:

1. **Given** a running game at 500 hours, 2x speed, paused state, **When** game is saved to JSON, **Then** JSON contains fields for elapsed time (500), speed multiplier (2.0), and pause flag (true) with no precision loss.
2. **Given** a JSON save file containing time state, **When** save is loaded into a new game instance, **Then** game resumes at the saved time, speed multiplier, and pause state.
3. **Given** identical save files and identical random seed, **When** two game instances load the saves and run for N ticks, **Then** both instances have identical elapsed time and game state.
4. **Given** a game saved at 1000 hours, **When** the save is loaded multiple times and each instance runs independently, **Then** each instance tracks time independently without interference and can be serialized again with correct time values.

---

### Edge Cases

- What happens if a speed multiplier is set to 0 (pause equivalent)? → Should behave the same as explicit pause.
- What happens if speed multiplier is set to a negative value or a value not in {0.25, 0.5, 1.0, 2.0, 4.0}? → System rejects the command with an error; current multiplier is unchanged.
- What happens if game loop receives a tick command while paused? → Should not advance time; pause takes precedence.
- What happens if game is loaded from save at time T, then reloaded from a different save at time T-100? → Each should track independently; no shared time state.
- What happens if a game runs for many ticks (e.g., 1 million ticks)? → `tickCount` is a 64-bit integer; safe up to ~9×10¹⁸ ticks — no overflow risk for sandbox play.
- What happens when a save file contains invalid time state (negative ticks, unrecognized speed, missing fields)? → System throws an error and refuses to load. No silent fallback to defaults.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST maintain an internal game time counter as an integer tick count representing elapsed game ticks from the start of simulation. Game hours are derived: `gameHours = tickCount / ticksPerHour` (where `ticksPerHour` is a game design constant, e.g., 12). No floating-point time values are stored.
- **FR-002**: System MUST accept pause commands that suspend game time progression; paused state MUST be persisted in game state.
- **FR-003**: System MUST accept resume commands that restore game time progression from paused state.
- **FR-004**: System MUST accept speed multiplier commands from the fixed set: 0.25x, 0.5x, 1x, 2x, 4x. Any value outside this set MUST be rejected with an error; partial or free-form multipliers are not accepted.
- **FR-005**: System MUST apply speed multipliers to tick frequency such that higher speed multipliers cause more game ticks per real-world second. Each tick always advances exactly 1 game tick (5 game minutes at 1x); speed multiplier controls how many ticks occur per real-world interval. The engine itself is manually ticked (`engine.tick()`); an optional `AutoRunner` helper wraps the engine and calls `tick()` at a configurable real-world interval divided by the speed multiplier.
- **FR-006**: System MUST provide a query interface to retrieve current elapsed game time, pause status, and active speed multiplier.
- **FR-007**: System MUST operate game loop ticks independently of any rendering loop; game simulation advances regardless of renderer state. The engine exposes `engine.tick()` as the primitive (manual ticking); an optional `AutoRunner` provides configurable-interval auto-ticking for real-time gameplay. The real-world tick interval MUST be runtime-configurable; changes take effect on the next tick.
- **FR-008**: System MUST serialize game time state (tick count, pause flag, speed multiplier, tick interval) to JSON format as integers without precision loss.
- **FR-009**: System MUST deserialize game time state from JSON and resume simulation at the saved time offset and state. If the loaded state contains invalid values (negative elapsed time, unrecognized speed multiplier, missing required fields, NaN), the system MUST throw an error and refuse to load rather than silently falling back to defaults.
- **FR-011**: System MUST expose derived calendar helpers (e.g., toDay(), toWeek(), toYear()) computed from tickCount and ticksPerHour. These are read-only computations — calendar fields are never stored as independent state.
- **FR-010**: System MUST support deterministic time progression such that identical seeds and identical sequence of commands produce identical game time states.

### Key Entities

- **GameTime**: Represents the internal time tracking system. Attributes: `tickCount` (integer, canonical game time), `paused` (boolean), `speedMultiplier` (one of: 0.25, 0.5, 1.0, 2.0, 4.0), `ticksPerHour` (integer constant, e.g., 12). Exposes derived read-only helpers: `toGameHours()`, `toDay()`, `toWeek()`, `toYear()` computed from `tickCount / ticksPerHour`. Calendar values are never stored independently. No public mutable state; all changes via commands.
- **GameLoop / engine.tick()**: The primitive tick method. Calling `engine.tick()` advances the simulation by exactly one game tick. Does NOT auto-run; caller controls when and how often `tick()` is called. This is the foundation used by both headless tests and the AutoRunner.
- **AutoRunner**: Optional convenience wrapper that calls `engine.tick()` at a configurable real-world interval. Interval is adjusted by speed multiplier (e.g., base 100ms at 1x becomes 50ms at 2x, 25ms at 4x). Provides start/stop/pause. Used for real-time browser gameplay. Not required for headless operation or tests.
- **GameState**: The central game state object that includes GameTime as a nested property. GameState must be serializable to JSON with all time fields preserved.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A game loop can run indefinitely in a headless environment (no renderer) for at least 1 million ticks without integer overflow, precision loss, or memory leaks.
- **SC-002**: Pause/resume commands respond with zero delay; game time does not drift when paused.
- **SC-003**: Speed adjustments take effect within one tick cycle (< 100ms real-world delay).
- **SC-004**: Game time serialized to JSON and deserialized produces identical time state (bit-for-bit equality for numeric fields).
- **SC-005**: Two game instances loaded from the same save state and receiving identical tick commands produce identical game time values.
- **SC-006**: Game loop operates at a fixed simulation rate independent of rendering; game time advances correctly whether renderer is present, absent, or throttled.
- **SC-007**: 100% of game time state fields (elapsed time, pause flag, speed multiplier) are successfully serialized and deserialized without loss.

## Clarifications

### Session 2026-05-02

- Q: What is the canonical game time delta per tick at 1x speed? → A: Each tick at 1x speed advances 5 game minutes (1/288 of a game day). At 1x speed, one game day passes every 30 real-world minutes of play.
- Q: What are the valid speed multiplier values and rejection behavior? → A: Fixed step set only — {0.25, 0.5, 1.0, 2.0, 4.0}. Any other value is rejected with an error; current multiplier unchanged.
- Q: Is the real-world tick interval fixed or configurable? → A: Runtime-configurable. Changes take effect on the next tick. Included in serialized state.
- Q: Should the game loop expose structured calendar time or raw hours? → A: Derived helpers only (toDay(), toWeek(), toYear()) computed from tickCount / ticksPerHour. Calendar is never stored as independent state.
- Q: What happens when a save file has invalid time state? → A: Hard error — system throws and refuses to load. No silent fallback to defaults.
- Q: What is the maximum supported game time span? → A: Indefinite/sandbox. tickCount is a 64-bit integer; safe to ~9×10¹⁸ ticks — effectively limitless for gameplay purposes.

### Cross-Cutting Session 2026-05-02

- Q: What is the canonical game time representation across all specs? → A: Integer ticks everywhere. `tickCount` (integer) is the single canonical time value. Game hours are a derived display value: `gameHours = tickCount / ticksPerHour` (constant = 12). No floating-point time values exist in serialized state. All specs (001, 005, 006) use ticks. This eliminates floating-point drift, ensures deterministic save/load, and makes PRNG-seeded replay exactly reproducible.
- Q: How should the game loop execution model work (auto-tick vs manual-tick conflict between specs 001 and 007)? → A: Manual tick is the primitive; optional AutoRunner is a wrapper. `engine.tick()` advances exactly one game tick. An optional `AutoRunner` helper calls `tick()` at a configurable real-world interval (adjusted by speed multiplier). Headless tests use manual ticking; browser runtime uses AutoRunner. Both specs are reconciled: 007's manual-tick design is the engine primitive; 001's auto-ticking behavior is the AutoRunner convenience layer.

## Assumptions

- **Time Granularity**: At 1x speed, one game day passes every 30 real-world minutes. Each tick at 1x speed advances exactly 1 tick (= 5 game minutes = 1/288 of a game day). This ratio is a game design constant (`ticksPerHour = 12`), not configurable per-save. Speed multiplier controls how many ticks occur per real-world interval (2x = 2 ticks per interval), NOT the time delta per tick.
- **Speed Multiplier Ranges**: Accepted speed multiplier values are the fixed set {0.25, 0.5, 1.0, 2.0, 4.0}. No other values are valid. Multiplier 0 is treated as equivalent to pause. The set is a game design constant and cannot be changed without a spec revision.
- **Tick-Based Simulation**: Game advances in discrete ticks (not continuous time), allowing deterministic state tracking. `engine.tick()` is the primitive; AutoRunner provides optional auto-ticking. The real-world tick interval (for AutoRunner) is runtime-configurable (default 100ms); changing it takes effect on the next tick. Tick interval is included in serialized state.
- **No Real-World Time Dependencies**: The game loop never calls system time functions (Date.now(), performance.now(), etc.) for simulation purposes. All time advancement is controlled via tick deltas and the speed multiplier.
- **Save Game Compatibility**: Game time state is versioned with the game. Minor version updates maintain backward compatibility; major version updates may require migration logic for time fields. Invalid or corrupt time state on load causes a hard error — no silent defaults.
- **Calendar Derivation**: Day/week/year values are always derived from `tickCount / ticksPerHour` at read time. They are never stored as independent fields. This keeps state minimal and avoids desync between raw time and calendar display.
- **Indefinite Sandbox Duration**: The simulation has no designed end point. `tickCount` is a 64-bit integer, safe to ~9×10¹⁸ ticks — effectively limitless for gameplay purposes.
- **Integer Ticks as Canonical Time**: All game time is canonically represented as integer ticks. Game hours, days, weeks are derived values (`gameHours = tickCount / ticksPerHour`). No floating-point time values exist in serialized state. This ensures deterministic save/load and eliminates floating-point drift.
- **Single Global Time**: The game maintains a single authoritative elapsed time value. No parallel time tracks or localized time zones.
- **Headless Priority**: Headless game loop is the primary implementation; browser renderer is a consumer layer that queries game state, not a prerequisite for simulation.
