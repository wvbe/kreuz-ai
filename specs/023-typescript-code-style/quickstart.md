# Quickstart: Kreuzvibe Development

## Prerequisites

- Node.js 20+
- pnpm (or npm)

## Setup

```bash
# Clone and install
git clone <repo-url> && cd kreuzvibe
pnpm install

# Run tests (headless engine)
pnpm test

# Start dev server (React renderer)
pnpm dev
```

## Project Structure

```
src/game/          → Headless game engine (TypeScript, no browser APIs)
src/renderers/react/ → React + ThreeJS browser application
specs/             → Feature specifications and plans
```

## Key Commands

| Command           | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `pnpm test`       | Run all Vitest tests (engine + renderer)            |
| `pnpm test:watch` | Watch mode for TDD                                  |
| `pnpm dev`        | Start Vite dev server (React app at localhost:5173) |
| `pnpm build`      | Production build                                    |
| `pnpm typecheck`  | Run tsc --noEmit on all project references          |
| `pnpm lint`       | ESLint check                                        |

## Development Workflow

1. **Engine-first**: Implement game logic in `src/game/`. Write tests. No browser needed.
2. **Run headless**: Engine tests verify all game mechanics without UI.
3. **Renderer**: Consume engine APIs in `src/renderers/react/`. Visual verification.
4. **Scenario tests**: Add JSON snapshots to `src/game/scenarios/` for integration coverage.

## Code Style (Spec 023)

- Named exports only (no `export default`)
- No barrel files (no `index.ts` re-exports)
- `type` keyword for type declarations (no `interface` unless declaration merging needed)
- Native `enum` + `z.nativeEnum()` for Zod schemas
- Co-located tests: `Foo.ts` → `Foo.test.ts` in same directory
- `README.md` in every folder explaining its purpose
- TSDoc (`/** ... */`) on all exported symbols
- Identifiers ≥ 3 characters (exceptions: `id`, `x`, `y`, `z`)

## Architecture Rules

- `src/game/` MUST NOT import from `src/renderers/`
- All randomness via seeded PRNG (no `Math.random()`)
- All state must be JSON-serializable
- State flows engine → renderer (one-way)
- Player actions are commands dispatched to engine

## Creating a New Game System

```typescript
// src/game/systems/MySystem.ts
import type { GameState } from "../engine/GameState.ts";

/** Process my system logic for one tick */
export function tickMySystem(state: GameState): GameState {
    // Pure function: takes state, returns new state
    // No side effects, no browser APIs, no randomness outside PRNG
}
```

```typescript
// src/game/systems/MySystem.test.ts
import { describe, it, expect } from "vitest";
import { tickMySystem } from "./MySystem.ts";

describe("tickMySystem", () => {
    it("does the thing", () => {
        const state = createTestState();
        const result = tickMySystem(state);
        expect(result.something).toBe(expected);
    });
});
```

## Map Generators

Each generator implements the `MapGenerator` interface:

```typescript
export type MapGenerator = {
    id: string;
    generate(options: MapGeneratorOptions, prng: Prng): TileMap;
};
```

Available generators:

- `VoronoiOutdoorGenerator` — Main world (biomes, rivers, terrain)
- `CaveGenerator` — Underground cellular automata caves
- `CellarGenerator` — Small BSP room layouts
- `VillageLayoutGenerator` — Places roads/zones on voronoi map
- `TerrainPainter` — Assigns terrain types via elevation+moisture
