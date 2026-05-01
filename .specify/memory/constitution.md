# Kreuzvibe Constitution

## Core Principles

### I. Engine-Renderer Decoupling (CRITICAL)

The game engine MUST be entirely decoupled from any rendering layer. The game simulation, world state management, entity logic, and all game systems MUST run independently of HTML, DOM, WebGL, or any visual representation. This enables headless operation, unit testing without UI dependencies, and supports multiple rendering targets (browser DOM, terminal, future platforms). No rendering code may exist in game modules; all rendering is unidirectional consumption of game state only.

### II. Deterministic State & JSON Serialization (NON-NEGOTIABLE)

All game state MUST be fully serializable to and deserializable from JSON without loss of information. The game world, including all citizens, factions, resources, relationships, and simulation state, MUST produce identical results when given an identical seed and initial save state. Randomness is controlled exclusively through seeded PRNG; external non-deterministic sources (system time, network, etc.) MUST NOT influence game outcomes. This enables save/load functionality, regression testing, and scenario replay.

### III. Headless-First Development

The game MUST be designed to run indefinitely in a headless environment (terminal, Node.js, unit test runner) with no UI. All development, testing, and gameplay logic verification happens headless first; the browser GUI is a secondary consumption layer, not a prerequisite. This ensures the game remains playable and fully testable independently of frontend development.

### IV. Integration Testing via Scenario Snapshots

Beyond unit tests, the project MUST maintain a library of saved game scenarios representing real-world gameplay conditions: early-game economy, mid-game political complexity, late-game faction conflicts, edge cases, and failure modes. These scenarios MUST be re-run in test suites to verify no regressions in citizen behavior, job assignment, trading, politics, or faction dynamics. Scenario tests validate the game as an integrated whole, not just isolated systems.

### V. Modular Game Systems

Game systems—Citizens, Jobs, Economy, Factions, Politics, Research, Trading—MUST be designed as independent modules with clear contracts and minimal coupling. Each system operates on serialized game state and emits state changes in a predictable, testable manner. Systems may interact through published events or queries but MUST NOT require direct object references or mutable shared state beyond the central game state object.

## Architectural Constraints

- **Browser Integration**: The HTML/DOM browser layer is a view-only consumer of game state. State flows from engine → browser; browser input becomes commands fed into the engine.
- **Testability Mandate**: Every game system must be unit-testable in isolation; the entire game must be integration-testable with no external dependencies (no network, no timers, no browser APIs).
- **Seed-Based Randomness**: All randomness must derive from a single project seed, ensuring identical play-throughs are reproducible.
- **State Transparency**: Game state must be inspectable, queryable, and loggable at any point; opaque or hidden state is prohibited.

## Development Workflow

1. **Game Logic First**: Implement core engine and game systems in headless mode; all development prioritizes simulation correctness over UI.
2. **Comprehensive Unit Testing**: Every citizen behavior, job transition, economic rule, and faction mechanic has dedicated unit tests.
3. **Scenario-Driven Testing**: Before merging major changes, run scenario snapshot tests to verify real-world gameplay stability.
4. **Browser UI as Visualization**: The browser layer is developed only after core systems are stable and tested; it consumes published game state APIs.
5. **Save/Load Validation**: Every new feature includes JSON serialization tests; save games from one version must remain valid across minor versions (breaking changes require migration logic).

## Governance

All code changes MUST maintain strict compliance with Engine-Renderer Decoupling and Deterministic State principles—these are non-negotiable architectural cornerstones. Departures require explicit consensus and constitution amendment.

Constitution changes (amendments) require:

- Clear rationale documenting why the change strengthens the project
- Migration plan for any affected code or tests
- Updated version per semantic versioning (MAJOR for principle removals, MINOR for additions, PATCH for clarifications)
- Scenario test verification that no regressions are introduced

**Version**: 1.0.0 | **Ratified**: 2026-05-02 | **Last Amended**: 2026-05-02
