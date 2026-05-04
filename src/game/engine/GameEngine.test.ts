import { describe, it, expect } from "vitest";
import { createGame, tickGame, dispatchCommand, subscribeToState, saveGame, defaultGameConfig } from "./GameEngine.js";
import { getEntitiesWithComponent } from "./EntityManager.js";
import { getEntitiesByTag } from "./EntityManager.js";

describe("GameEngine", () => {
  it("creates a new game with default config", () => {
    const instance = createGame();
    expect(instance.state.tick).toBe(0);
    expect(instance.maps.size).toBeGreaterThanOrEqual(2);
    expect(instance.content.materials.entries.size).toBeGreaterThan(0);
  });

  it("spawns initial colonists", () => {
    const instance = createGame();
    const colonists = getEntitiesByTag(instance.state.entities, "colonist");
    expect(colonists.length).toBe(defaultGameConfig.initialColonists);
  });

  it("spawns animals", () => {
    const instance = createGame();
    const animals = getEntitiesByTag(instance.state.entities, "animal");
    expect(animals.length).toBe(15);
  });

  it("ticks the game and advances state", () => {
    const instance = createGame();
    tickGame(instance);
    expect(instance.state.tick).toBe(1);
    tickGame(instance);
    expect(instance.state.tick).toBe(2);
  });

  it("notifies subscribers on tick", () => {
    const instance = createGame();
    let notified = false;
    subscribeToState(instance, () => { notified = true; });
    tickGame(instance);
    expect(notified).toBe(true);
  });

  it("handles pause/resume commands", () => {
    const instance = createGame();
    dispatchCommand(instance, { type: "pause", payload: {} });
    expect(instance.state.paused).toBe(true);
    tickGame(instance);
    expect(instance.state.tick).toBe(0); // should not tick when paused
    dispatchCommand(instance, { type: "resume", payload: {} });
    tickGame(instance);
    expect(instance.state.tick).toBe(1);
  });

  it("saves game state to JSON", () => {
    const instance = createGame();
    tickGame(instance);
    const json = saveGame(instance);
    expect(json).toBeTruthy();
    const parsed = JSON.parse(json);
    expect(parsed.tick).toBe(1);
    expect(parsed.version).toBe(1);
  });

  it("generates deterministic world for same seed", () => {
    const instance1 = createGame({ ...defaultGameConfig, seed: 99 });
    const instance2 = createGame({ ...defaultGameConfig, seed: 99 });
    const colonists1 = getEntitiesByTag(instance1.state.entities, "colonist");
    const colonists2 = getEntitiesByTag(instance2.state.entities, "colonist");
    expect(colonists1.length).toBe(colonists2.length);
  });
});
