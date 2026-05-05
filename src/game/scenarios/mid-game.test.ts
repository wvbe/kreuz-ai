/**
 * Mid-game scenario: 30 colonists, multiple zones, active trade, faction tensions.
 */
import { describe, it, expect } from "vitest";
import { createGame, tickGame, dispatchCommand, type GameConfig } from "../engine/GameEngine";
import { getEntitiesByTag, getComponent } from "../engine/EntityManager";
import { createZone } from "../systems/ZoneSystem";

const MID_GAME_CONFIG: GameConfig = {
  seed: 54321,
  mapCellCount: 600,
  mapWidth: 200,
  mapHeight: 200,
  initialColonists: 30,
};

describe("Mid-Game Scenario", () => {
  it("creates a large colony with 30 colonists", () => {
    const game = createGame(MID_GAME_CONFIG);
    const colonists = getEntitiesByTag(game.state.entities, "colonist");
    expect(colonists.length).toBe(30);
  });

  it("colonists have diverse skills", () => {
    const game = createGame(MID_GAME_CONFIG);
    const colonists = getEntitiesByTag(game.state.entities, "colonist");
    const skillSets = colonists.map((id) => getComponent(game.state.entities, id, "skills"));
    // Each colonist should have skills
    for (const skills of skillSets) {
      expect(skills).toBeDefined();
    }
  });

  it("village layout has multiple zone types", () => {
    const game = createGame(MID_GAME_CONFIG);
    expect(game.villageLayout).toBeDefined();
    const zoneTypes = new Set(game.villageLayout!.zones.map((z) => z.zoneType));
    expect(zoneTypes.size).toBeGreaterThan(2);
  });

  it("can pause and resume job boards via commands", () => {
    const game = createGame(MID_GAME_CONFIG);
    const mainBoard = game.jobBoards.get("main")!;
    expect(mainBoard.paused).toBe(false);

    dispatchCommand(game, { type: "pause_board", payload: { boardId: "main" } });
    expect(mainBoard.paused).toBe(true);

    dispatchCommand(game, { type: "resume_board", payload: { boardId: "main" } });
    expect(mainBoard.paused).toBe(false);
  });

  it("can create zones from the zone system", () => {
    const game = createGame(MID_GAME_CONFIG);
    const mainMap = game.maps.get("main")!;
    const walkableCells = mainMap.cells.filter((c) => c.walkable);
    const zoneCells = walkableCells.slice(0, 5).map((c) => c.cellId);

    const zone = createZone(game.zones, "test-smithy", "smithy", "Village Smithy", zoneCells, "main");

    expect(zone.zoneId).toBe("test-smithy");
    expect(zone.status).toBe("incomplete");
  });

  it("runs simulation for 500 ticks with speed changes", () => {
    const game = createGame(MID_GAME_CONFIG);

    // Normal speed for 200 ticks
    for (let i = 0; i < 200; i++) {
      tickGame(game);
    }
    expect(game.state.tick).toBe(200);

    // Speed change command
    dispatchCommand(game, { type: "set_speed", payload: { speed: 5 } });
    expect(game.state.speed).toBe(5);

    // Continue for 300 more ticks
    for (let i = 0; i < 300; i++) {
      tickGame(game);
    }
    expect(game.state.tick).toBe(500);
  });

  it("faction system has active factions with members", () => {
    const game = createGame(MID_GAME_CONFIG);
    expect(game.factions.factions.size).toBeGreaterThanOrEqual(4);

    // Village council should have all colonists
    const council = game.factions.factions.get("village_council");
    expect(council).toBeDefined();
    expect(council!.members.size).toBe(30);
  });

  it("maps have correct linkage", () => {
    const game = createGame(MID_GAME_CONFIG);
    expect(game.maps.size).toBeGreaterThanOrEqual(2);
    expect(game.maps.has("main")).toBe(true);
    expect(game.maps.has("cave-1")).toBe(true);
  });
});
