/**
 * Early colony scenario: 10 colonists, basic production chains, verify replay determinism.
 */
import { describe, it, expect } from "vitest";
import { createGame, tickGame, saveGame, type GameInstance, type GameConfig } from "../engine/GameEngine";
import { getEntitiesByTag } from "../engine/EntityManager";
import { getComponent } from "../engine/EntityManager";

const SCENARIO_CONFIG: GameConfig = {
  seed: 12345,
  mapCellCount: 300,
  mapWidth: 100,
  mapHeight: 100,
  initialColonists: 10,
};

describe("Early Colony Scenario", () => {
  it("creates a colony with 10 colonists and animals", () => {
    const game = createGame(SCENARIO_CONFIG);
    const colonists = getEntitiesByTag(game.state.entities, "colonist");
    const animals = getEntitiesByTag(game.state.entities, "animal");

    expect(colonists.length).toBe(10);
    expect(animals.length).toBe(15);
  });

  it("has a valid village layout with zones and roads", () => {
    const game = createGame(SCENARIO_CONFIG);
    expect(game.villageLayout).toBeDefined();
    expect(game.villageLayout!.townCenter).toBeGreaterThanOrEqual(0);
    expect(game.villageLayout!.roads.length).toBeGreaterThan(0);
    expect(game.villageLayout!.zones.length).toBeGreaterThan(0);
  });

  it("advances simulation deterministically for 100 ticks", () => {
    const game1 = createGame(SCENARIO_CONFIG);
    const game2 = createGame(SCENARIO_CONFIG);

    for (let i = 0; i < 100; i++) {
      tickGame(game1);
      tickGame(game2);
    }

    expect(game1.state.tick).toBe(100);
    expect(game2.state.tick).toBe(100);

    // Both games should produce identical states from the same seed
    const save1 = saveGame(game1);
    const save2 = saveGame(game2);
    expect(save1).toBe(save2);
  });

  it("needs decay over time", () => {
    const game = createGame(SCENARIO_CONFIG);
    const colonists = getEntitiesByTag(game.state.entities, "colonist");
    const firstColonist = colonists[0]!;

    const needsBefore = getComponent(game.state.entities, firstColonist, "needs") as { needs: Array<{ value: number }> };
    const initialValues = needsBefore.needs.map((n) => n.value);

    // Tick 50 times
    for (let i = 0; i < 50; i++) {
      tickGame(game);
    }

    const needsAfter = getComponent(game.state.entities, firstColonist, "needs") as { needs: Array<{ value: number }> };
    // At least some needs should have decayed
    const decayed = needsAfter.needs.some((n, i) => n.value < initialValues[i]!);
    expect(decayed).toBe(true);
  });

  it("all colonists have valid positions on the main map", () => {
    const game = createGame(SCENARIO_CONFIG);
    const mainMap = game.maps.get("main")!;
    const colonists = getEntitiesByTag(game.state.entities, "colonist");

    for (const entityId of colonists) {
      const position = getComponent(game.state.entities, entityId, "position") as { mapId: string; cellId: number };
      expect(position.mapId).toBe("main");
      expect(position.cellId).toBeGreaterThanOrEqual(0);
      expect(position.cellId).toBeLessThan(mainMap.cells.length);
    }
  });

  it("content registries are populated", () => {
    const game = createGame(SCENARIO_CONFIG);
    expect(game.content.materials.entries.size).toBeGreaterThan(20);
    expect(game.content.recipes.entries.size).toBeGreaterThan(10);
    expect(game.content.furniture.entries.size).toBeGreaterThan(10);
    expect(game.content.skills.entries.size).toBeGreaterThan(10);
  });

  it("factions are initialized", () => {
    const game = createGame(SCENARIO_CONFIG);
    expect(game.factions.factions.size).toBeGreaterThan(0);
  });

  it("cave sub-map is generated and linked", () => {
    const game = createGame(SCENARIO_CONFIG);
    const caveMap = game.maps.get("cave-1");
    expect(caveMap).toBeDefined();
    expect(caveMap!.cells.length).toBeGreaterThan(0);
  });
});
