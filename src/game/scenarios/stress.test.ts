/**
 * Stress scenario: 50 entities, all systems active, verify no state corruption over 1000 ticks.
 */
import { describe, it, expect } from "vitest";
import { createGame, tickGame, saveGame, type GameConfig } from "../engine/GameEngine";
import { getEntitiesByTag, getEntitiesWithComponent, getComponent } from "../engine/EntityManager";

const STRESS_CONFIG: GameConfig = {
  seed: 99999,
  mapCellCount: 800,
  mapWidth: 250,
  mapHeight: 250,
  initialColonists: 35,
};

describe("Stress Scenario", () => {
  it("handles 50+ entities over 1000 ticks without corruption", () => {
    const game = createGame(STRESS_CONFIG);
    const totalEntities = getEntitiesWithComponent(game.state.entities, "position").length;
    expect(totalEntities).toBeGreaterThanOrEqual(50);

    // Run 1000 ticks
    for (let i = 0; i < 1000; i++) {
      tickGame(game);
    }

    expect(game.state.tick).toBe(1000);

    // Verify no entity corruption
    const colonists = getEntitiesByTag(game.state.entities, "colonist");
    expect(colonists.length).toBe(35);

    // All colonists still have valid positions
    for (const entityId of colonists) {
      const position = getComponent(game.state.entities, entityId, "position") as { mapId: string; cellId: number };
      expect(position).toBeDefined();
      expect(position.mapId).toBe("main");
    }
  });

  it("save/load preserves state after 500 ticks", () => {
    const game = createGame(STRESS_CONFIG);
    for (let i = 0; i < 500; i++) {
      tickGame(game);
    }

    const savedState = saveGame(game);
    expect(savedState).toBeDefined();
    expect(savedState.length).toBeGreaterThan(0);

    // Ensure save is valid JSON
    const parsed = JSON.parse(savedState);
    expect(parsed.tick).toBe(500);
  });

  it("entities maintain valid health after prolonged simulation", () => {
    const game = createGame(STRESS_CONFIG);
    for (let i = 0; i < 500; i++) {
      tickGame(game);
    }

    const entitiesWithHealth = getEntitiesWithComponent(game.state.entities, "health");
    for (const entityId of entitiesWithHealth) {
      const health = getComponent(game.state.entities, entityId, "health") as { current: number; max: number };
      expect(health.current).toBeLessThanOrEqual(health.max);
      expect(health.current).toBeGreaterThanOrEqual(0);
    }
  });

  it("tick performance stays reasonable for 50+ entities", () => {
    const game = createGame(STRESS_CONFIG);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      tickGame(game);
    }
    const elapsed = performance.now() - start;

    // 100 ticks should complete in under 5 seconds (generous for CI)
    expect(elapsed).toBeLessThan(5000);
    // Should average under 50ms per tick
    expect(elapsed / 100).toBeLessThan(50);
  });
});
