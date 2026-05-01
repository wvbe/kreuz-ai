# Feature Specification: Game Loop & Time Progression

**Feature Branch**: `001-game-loop`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "An important part of the game is the game loop, ie. the passage of time. It needs to have pause/continue, speed up/down controls, and it must be independent of the render loop (because a renderer is not required to play the game). The game experience will be measured in hours, days, weeks -- 1x game speed is about 48x realtime."

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
- What happens if speed multiplier is set to a negative value? → Should reject or be treated as a pause; time must not run backwards.
- What happens if game loop receives a tick command while paused? → Should not advance time; pause takes precedence.
- What happens if game is loaded from save at time T, then reloaded from a different save at time T-100? → Each should track independently; no shared time state.
- What happens if a game runs for many ticks (e.g., 1 million ticks)? → Time must not overflow or lose precision; elapsed time must remain accurate.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST maintain an internal game time offset representing elapsed game hours from the start of simulation.
- **FR-002**: System MUST accept pause commands that suspend game time progression; paused state MUST be persisted in game state.
- **FR-003**: System MUST accept resume commands that restore game time progression from paused state.
- **FR-004**: System MUST accept speed multiplier commands that adjust the rate of game time advancement (e.g., 0.5x, 1x, 2x, 4x).
- **FR-005**: System MUST apply speed multipliers to game time deltas such that each tick advances time by (delta_seconds × speed_multiplier).
- **FR-006**: System MUST provide a query interface to retrieve current elapsed game time, pause status, and active speed multiplier.
- **FR-007**: System MUST operate game loop ticks independently of any rendering loop; game simulation advances on regular intervals regardless of renderer state.
- **FR-008**: System MUST serialize game time state (elapsed time, pause flag, speed multiplier) to JSON format without precision loss.
- **FR-009**: System MUST deserialize game time state from JSON and resume simulation at the saved time offset and state.
- **FR-010**: System MUST support deterministic time progression such that identical seeds and identical sequence of commands produce identical game time states.

### Key Entities

- **GameTime**: Represents the internal time tracking system. Attributes: `elapsedHours` (number), `paused` (boolean), `speedMultiplier` (number), `tickCount` (integer). No public mutable state; all changes via commands.
- **GameLoop**: The core simulation loop that ticks at regular intervals. Attributes: reference to GameTime, current tick count, tick delta (in real-world milliseconds or fixed units). Must not hold renderer state.
- **GameState**: The central game state object that includes GameTime as a nested property. GameState must be serializable to JSON with all time fields preserved.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A game loop can run indefinitely in a headless environment (no renderer) for at least 1 million ticks without time overflow, precision loss, or memory leaks.
- **SC-002**: Pause/resume commands respond with zero delay; game time does not drift when paused.
- **SC-003**: Speed adjustments take effect within one tick cycle (< 100ms real-world delay).
- **SC-004**: Game time serialized to JSON and deserialized produces identical time state (bit-for-bit equality for numeric fields).
- **SC-005**: Two game instances loaded from the same save state and receiving identical tick commands produce identical game time values.
- **SC-006**: Game loop operates at a fixed simulation rate independent of rendering; game time advances correctly whether renderer is present, absent, or throttled.
- **SC-007**: 100% of game time state fields (elapsed time, pause flag, speed multiplier) are successfully serialized and deserialized without loss.

## Assumptions

- **Time Granularity**: 1x game speed corresponds to 48x real-world time passage (e.g., 1 real second = 48 game seconds). This ratio is a game design constant, not configurable per-save.
    - Edit by user: Game design can be modified, but from a game entity's point of view a day passes every 30 minutes that the user plays.
- **Speed Multiplier Ranges**: Reasonable speed multiplier range is 0.25x to 4x (can be adjusted). Speeds outside this range require explicit approval. Multiplier 0 is treated as equivalent to pause.
- **Tick-Based Simulation**: Game advances in discrete ticks (not continuous time), allowing deterministic state tracking. Tick interval is a game engine constant (e.g., 100ms real-world per tick).
- **No Real-World Time Dependencies**: The game loop never calls system time functions (Date.now(), performance.now(), etc.) for simulation purposes. All time advancement is controlled via tick deltas and the speed multiplier.
- **Save Game Compatibility**: Game time state is versioned with the game. Minor version updates maintain backward compatibility; major version updates may require migration logic for time fields.
- **Single Global Time**: The game maintains a single authoritative elapsed time value. No parallel time tracks or localized time zones.
- **Headless Priority**: Headless game loop is the primary implementation; browser renderer is a consumer layer that queries game state, not a prerequisite for simulation.
