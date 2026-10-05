# scenarios

Scenario files (JSON) that drive the game headlessly: `{name, seed, options?, steps[]}`. The format is documented in [docs/CLI.md](../docs/CLI.md) and implemented in `src/game/api/scenario/`.

- `kernel-smoke.json` - new game, 200 ticks, pause/resume, speed, save/load round trip, command-log replay.
- `world-gen.json` - seed 42 small world: terrain classes (water, fertile, forest, stone, iron ore, road), job board and six settlers, save/load and replay.
- `living-world.json` - Checkpoint B: new game seed 42 Small, two game days (576 ticks) with a save/load in the middle: all six settlers alive, hunger above zero (they ate), full health, every settler has done tasks (wandered), command-log replay.
- `first-jobs.json` - task 3.1: seed 42 Small, one day of settlers claiming and finishing `fell.trees` jobs from the village board (history, logs and wages in inventories), save/load in the middle and command-log replay.
- `determinism.json` - mixed commands and steps with state-hash checks, replay before and after a save/load.

Run one with `npm run cli -- --script scenarios/kernel-smoke.json`. `tests/e2e/scenarios.test.ts` runs every `*.json` file in this folder in-process, so a new scenario is picked up automatically: later phases add their acceptance scenarios here (for example the Checkpoint C bakery scenario). Deliberately failing fixtures belong in `tests/e2e/fixtures/`, not here.
