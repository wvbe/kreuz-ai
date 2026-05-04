# Feature Specification: PRNG & Seed System

**Feature Branch**: `011-prng-seed`
**Created**: 2026-05-02
**Status**: Unimplemented (fresh start)
**Input**: User description: "The PRNG/seed system. The game must be fully deterministic and reproducible given a seed."

> **Note (2026-05-04)**: A previous implementation of this feature was discarded. This spec is being reimplemented from scratch following the conventions in spec 023 (TypeScript code style). All code lives under `src/game/`, tests are co-located, no barrel files, no default exports. Entities are pure data objects; systems provide behavior. See spec 023 for the full code style reference.


## User Scenarios & Testing _(mandatory)_

### User Story 1 - Initialize PRNG with a Seed at Bootstrap (Priority: P1)

When a game is bootstrapped (feature 007), a seed is provided (explicit integer) or auto-generated if not provided. The PRNG is initialized with the seed and is ready to produce deterministic random values. The same seed always produces the same sequence of random values, enabling reproducible game simulations for testing and replay.

**Why this priority**: Foundation of determinism. Without seeded PRNG, the game is non-deterministic and save/load reproducibility fails. Blocking.

**Independent Test**: Can be fully tested by: initializing PRNG with seed 42, calling random values 10 times, re-initializing with seed 42, calling 10 times again, and verifying both sequences are identical.

**Acceptance Scenarios**:

1. **Given** bootstrap with `{ seed: 12345 }`, **When** the PRNG is initialized, **Then** the seed is valid and stored (verified via `getSeed()`).
2. **Given** no seed provided at bootstrap, **When** the engine initializes, **Then** a seed is auto-generated (e.g., from timestamp) and stored for reproducibility.
3. **Given** two games bootstrapped with the same seed, **When** both call `random()` 100 times, **Then** the two sequences are bit-for-bit identical.
4. **Given** a game with seed 42 running 50 ticks, **When** a second game with seed 42 also runs 50 ticks, **Then** all random events (pathfinding, entity decisions, loot generation) are identical.
5. **Given** an invalid seed (e.g., seed > 2^32-1), **When** bootstrap is called, **Then** validation rejects with clear error message.

---

### User Story 2 - Request Random Values and Derived Values (Priority: P1)

The PRNG provides a rich API: `random()` returns float 0.0–1.0, `randomInt(min, max)` returns integer in range, `randomChoice(array)` picks random element, `randomWeighted(options, weights)` picks weighted option, `randomBool(probability)` returns true/false, and `shuffle(array)` randomizes array order. All operations are deterministic and use the seeded PRNG.

**Why this priority**: Enables all gameplay randomness (NPC decisions, loot drops, pathfinding tie-breaks, room generation). Blocking for game mechanics.

**Independent Test**: Can be fully tested by: calling each API method multiple times with same seed, verifying deterministic output, and verifying distributions are reasonable (weighted selections match weights, shuffle produces permutations).

**Acceptance Scenarios**:

1. **Given** `random()` called 10 times with seed 42, **When** called again with seed 42, **Then** all 10 values match exactly (float precision identical).
2. **Given** `randomInt(1, 10)` called 100 times, **When** results tallied, **Then** distribution roughly uniform (all integers 1–10 appear; no bias toward 1 or 10).
3. **Given** `randomWeighted([A, B, C], [0.5, 0.3, 0.2])` called 1000 times, **When** results tallied, **Then** A chosen ~50%, B ~30%, C ~20% (weights respected).
4. **Given** `randomChoice([1, 2, 3, 4, 5])` called, **When** called 5+ times, **Then** all elements can be selected (distribution covers all options).
5. **Given** `shuffle(array)` called, **When** called with same seed multiple times, **Then** produces identical shuffles and different shuffles each tick (no repeated shuffles in sequence).

---

### User Story 3 - Serialize PRNG State to GameState for Save/Load (Priority: P1)

When a game is saved (feature 006), the PRNG's internal state is serialized into GameState (seed, current position, any internal counters). When the game is loaded, the PRNG resumes from the exact same state. A series of random values after load matches what would have been generated if the game had never been saved.

**Why this priority**: Critical for deterministic save/load. Without state serialization, a loaded game continues the sequence and diverges from unsaved version. Blocking for reproducibility.

**Independent Test**: Can be fully tested by: running game for 10 ticks (generating random values), saving mid-sequence, loading, running 10 more ticks, and comparing final random values to a game that ran 20 ticks without saving.

**Acceptance Scenarios**:

1. **Given** a game running 10 ticks with PRNG calls, **When** saved, **Then** GameState contains PRNG state (seed, position).
2. **Given** a loaded game from save, **When** run for 10 more ticks, **Then** random values produced match the original game's ticks 11–20 exactly.
3. **Given** PRNG state serialized to JSON, **When** deserialized, **Then** the PRNG resumes with identical behavior (no state loss).
4. **Given** a game saved with PRNG mid-sequence, **When** loaded on a different platform (web vs. Node.js), **Then** random values remain identical (cross-platform determinism).
5. **Given** an in-progress randomization (e.g., `shuffle()` mid-operation), **When** saved and loaded, **Then** the shuffle completes identically (state preserved).

---

### User Story 4 - Derive Sub-PRNGs for Scoped Randomness (Priority: P2)

Systems can derive sub-PRNGs from the main PRNG (e.g., pathfinding gets a derived PRNG for A\* tie-breaking, room generator gets one for entity placement). Each sub-PRNG has its own deterministic sequence derived from the main seed but remains independent. This enables modular randomness management without tangling all randomness through one sequence.

**Why this priority**: Improves architecture (each system has its own PRNG). P2 because main PRNG can be used directly; deriving is an optimization.

**Independent Test**: Can be fully tested by: calling `derive("pathfinding")` to get a sub-PRNG, using it 100 times, re-deriving with same name, verifying sequence matches, and verifying derived sequences don't interfere with main PRNG.

**Acceptance Scenarios**:

1. **Given** a main PRNG seeded with 42, **When** `derive("pathfinding")` is called, **Then** a new PRNG is returned with its own independent sequence.
2. **Given** two derives of "pathfinding" from the same main PRNG, **When** both call `random()` 10 times, **Then** both produce identical sequences (deterministic derivation).
3. **Given** main PRNG and derived PRNG both calling `random()`, **When** sequences compared, **Then** they are independent (derived doesn't interfere with main, main doesn't interfere with derived).
4. **Given** derived PRNGs with different names ("pathfinding" vs. "room-gen"), **When** both derived, **Then** they produce different sequences (derived sequence depends on name).
5. **Given** derived PRNG serialized with main game state, **When** loaded, **Then** derived PRNG resumes identically (derivations reconstructed from main state).

---

### User Story 5 - Re-seed During Gameplay for Testing and Debugging (Priority: P2)

The PRNG can be re-seeded during gameplay via `setSeed(newSeed)`. This resets the PRNG to a new sequence, useful for testing different random outcomes without restarting the game. Derived PRNGs are also reset with corresponding seeds.

**Why this priority**: Useful for testing but not required for base game. P2 because it's optional but valuable for dev/test workflows.

**Independent Test**: Can be fully tested by: running game, emitting random events, re-seeding mid-game, continuing, and verifying new random sequence starts fresh (events after re-seed are different from original).

**Acceptance Scenarios**:

1. **Given** game with PRNG seeded 42, **When** `setSeed(99)` is called mid-game, **Then** next `random()` call produces value from seed 99, not 42 continuation.
2. **Given** re-seeding, **When** two games both re-seed to the same value at the same point, **Then** subsequent randomness is identical (deterministic re-seed).
3. **Given** derived PRNGs in use, **When** main PRNG is re-seeded, **Then** derived PRNGs are reset (re-derived with new seed context).
4. **Given** a game with save point, re-seeded mid-game, **When** saved, **Then** GameState reflects the new seed (save captures re-seeded state).
5. **Given** re-seeding in a test environment, **When** multiple test runs use the same re-seed sequence, **Then** results are reproducible (testing utility works).

---

### User Story 6 - Guarantee Cross-Platform Determinism (Priority: P1)

The PRNG implementation is identical across all platforms (web browser, Node.js, CLI, etc.). The same seed produces the same sequence whether running in JavaScript/browser, Node.js, or another environment. No platform-specific randomness sources (e.g., Math.random, crypto APIs) are used; instead, a pure deterministic algorithm is used everywhere.

**Why this priority**: Critical for determinism guarantees. If web and Node.js diverge, saves become platform-specific. Blocking for cross-platform reproducibility.

**Independent Test**: Can be fully tested by: running the same seed on web and Node.js environments, generating 1000 random values in each, and verifying byte-for-byte identity.

**Acceptance Scenarios**:

1. **Given** seed 12345 on Node.js PRNG, **When** 100 values are generated, **Then** the sequence is identical to web browser PRNG with same seed (cross-platform identity).
2. **Given** a save file from Node.js game, **When** loaded in web browser, **Then** PRNG resumes with identical behavior (platform-agnostic state).
3. **Given** PRNG state serialized to JSON, **When** transferred between platforms and deserialized, **Then** behavior is identical (JSON representation is portable).
4. **Given** PRNG implementation using only pure JavaScript (no native modules), **When** run on any platform with JavaScript support, **Then** behavior is consistent (no platform-specific code paths).
5. **Given** floating-point values from PRNG on different platforms, **When** values compared at full precision, **Then** bit-for-bit identity is maintained (no rounding platform-specific).

---

### Edge Cases

- What happens if `randomInt(max, min)` is called with max < min? → Validation swaps parameters or rejects with error.
- What happens if `randomWeighted()` is called with empty options array? → Validation rejects or returns null.
- What happens if `randomWeighted()` weights don't sum to 1? → Weights are normalized; if they sum to 100, treat as percentages; if they sum to 5, normalize to 1.
- What happens if seed is re-set while a `shuffle()` is mid-operation? → Current operation completes; new seed applies to next operation.
- What happens if PRNG state is corrupted in JSON (e.g., position is negative)? → Validation fails on load; error is raised before game resumes.
- What happens if many derived PRNGs are created (100+)? → Each derives independently; memory usage scales; no artificial limit.
- What happens if `derive()` is called with the same name twice? → Returns the same derived PRNG (or a fresh one; behavior documented).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: PRNG MUST be seeded with an explicit integer seed at bootstrap time (feature 007) or auto-generated if not provided.
- **FR-002**: Valid seed range MUST be 0 to 2^32-1 (unsigned 32-bit). Seeds outside this range MUST be rejected at initialization time.
- **FR-003**: PRNG algorithm MUST be PCG (Permuted Congruential Generator) or equivalent deterministic, cross-platform algorithm.
- **FR-004**: The PRNG MUST produce identical sequences given identical seeds and call sequences (strict determinism, bit-for-bit).
- **FR-005**: PRNG MUST expose `random()` returning float in [0.0, 1.0), `randomInt(min, max)` returning integer, `randomChoice(array)` returning random element.
- **FR-006**: PRNG MUST expose `randomWeighted(options, weights)` for weighted selection, `randomBool(probability)` for boolean, `shuffle(array)` for in-place randomization.
- **FR-007**: PRNG MUST be injected as a dependency (passed to systems/entities that need it), not accessed as a global singleton.
- **FR-008**: PRNG state (seed, position, any internal counters) MUST serialize to JSON and include in GameState (feature 006).
- **FR-009**: When a game is loaded from a save file, PRNG state MUST be restored; subsequent `random()` calls resume the pre-save sequence exactly.
- **FR-010**: PRNG MUST support `derive(name)` to create independent sub-PRNGs with deterministic but separate sequences.
- **FR-011**: Derived PRNGs MUST serialize as part of GameState; on load, derived PRNGs are reconstructed with identical state.
- **FR-012**: PRNG MUST support `setSeed(newSeed)` to reset to a new sequence during gameplay (for testing/debugging).
- **FR-013**: PRNG implementation MUST be pure deterministic code (no platform-specific APIs like Math.random() or crypto); must work identically on all platforms.
- **FR-014**: PRNG MUST validate all parameters (seed range, array bounds, weight sums); invalid calls MUST reject with clear error messages.
- **FR-015**: Cross-platform determinism MUST be verified: same seed on Node.js and web browser produces bit-for-bit identical sequences.

### Key Entities

- **PRNG**: Main random number generator with seed, state, and methods for generating random values. Serializable.
- **Seed**: Integer 0–2^32-1 provided by caller or auto-generated. Uniquely identifies a random sequence.
- **DerivedPRNG**: Sub-PRNG derived from main PRNG. Has its own independent sequence but derived deterministically.
- **PRNGState**: Internal state of PRNG (position, counters, algorithm-specific data). Serializes to JSON.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Two games with identical seed and identical gameplay events produce identical random sequences (0 divergence in first 10,000 random calls).
- **SC-002**: A game saved at tick N and loaded, then run to tick N+M, produces identical random values to a game run continuously to tick N+M (save/load preserves sequence).
- **SC-003**: PRNG produces 1 million random values per second (performance baseline; no bottleneck for gameplay).
- **SC-004**: Same seed produces identical sequences on Node.js and web browser (cross-platform determinism verified by byte-for-byte comparison).
- **SC-005**: PRNG state JSON representation is under 1KB (serialization overhead is minimal).
- **SC-006**: `randomWeighted()` distribution matches weights within ±5% over 10,000 samples (distribution accuracy).

## Assumptions

- **Bootstrap provides seed or timestamp**: Bootstrap (feature 007) either receives an explicit seed or uses timestamp/deterministic auto-generation to seed the PRNG.
- **No concurrent PRNG calls**: For POC, PRNG is assumed single-threaded. Concurrent calls from multiple threads are not thread-safe.
- **Pure JavaScript implementation**: PRNG is implemented in pure JavaScript/TypeScript with no native modules or platform-specific code paths.
- **GameState handles serialization**: GameState (feature 006) serializes PRNG state; PRNG itself only provides state data (JSON-serializable).
- **Derived PRNGs are reconstructed**: On load, derived PRNGs with the same names are reconstructed with identical state. New derives with unknown names start fresh.
- **Pathfinding receives derived PRNG**: Pathfinding (feature 004) receives a derived PRNG for tie-breaking; it does not call main PRNG directly (injected dependency).
- **Room generation receives derived PRNG**: Room generator (feature 009) receives a derived PRNG; it does not access main PRNG directly.
- **Event system uses main or derived PRNG**: Event bus (feature 010) and other systems receive PRNG as needed; no global PRNG singleton.
- **No true randomness needed**: For all game purposes, pseudo-random sequences are sufficient; cryptographic randomness is not required.

## Clarifications

**Q1 - Seed validity**: Should a seed of -1 or 3^33 be rejected or normalized?
**Answer**: Rejected with clear error message. Only 0–2^32-1 are valid. Caller must validate before calling bootstrap.

**Q2 - Derived PRNG reconstruction**: If a game is saved, a new system requests a derived PRNG with an unknown name, and game is loaded, does the new system's PRNG continue old state or restart?
**Answer**: Restart fresh. Only derived PRNGs that were saved (with known names) are reconstructed. New systems get fresh derived PRNGs with new seeds.

**Q3 - Floating-point precision**: Does `random()` guarantee full 32-bit precision or is 24-bit (JavaScript float precision) acceptable?
**Answer**: Full 32-bit precision where possible. JavaScript floats are 64-bit (double), so full precision can be represented. Test for bit-for-bit identity across platforms.

**Q4 - Array mutations**: Does `shuffle(array)` mutate the input array or return a new shuffled array?
**Answer**: Mutates in-place (like Fisher-Yates). Caller has the shuffled array after the call.

**Q5 - Re-seeding and derived PRNGs**: If main PRNG is re-seeded, do existing derived PRNG instances continue their old state or are they reset?
**Answer**: They continue their old state (independent). Calling `derive()` again with the same name after re-seeding returns a fresh derived PRNG based on the new seed.
