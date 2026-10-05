# scenarios

Scenario files (JSON) that drive the game headlessly: `{name, seed, options?, steps[]}`. The format is documented in [docs/CLI.md](../docs/CLI.md) and implemented in `src/game/api/scenario/`.

- `kernel-smoke.json` - new game, 200 ticks, pause/resume, speed, save/load round trip, command-log replay.
- `world-gen.json` - seed 42 small world: terrain classes (water, fertile, forest, stone, iron ore, road), job board and six settlers, save/load and replay.
- `determinism.json` - mixed commands and steps with state-hash checks, replay before and after a save/load.

Run one with `npm run cli -- --script scenarios/kernel-smoke.json`. `tests/e2e/scenarios.test.ts` runs every `*.json` file in this folder in-process, so a new scenario is picked up automatically: later phases add their acceptance scenarios here (for example the Checkpoint C bakery scenario). Deliberately failing fixtures belong in `tests/e2e/fixtures/`, not here.
