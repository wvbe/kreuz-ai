import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { ConstructionService } from "./ConstructionService";
import { bindConstructionService, getConstructionService } from "./constructionServiceRegistry";
import { createConstructionWorld } from "./testConstructionWorld";

describe("bindConstructionService and getConstructionService", () => {
  it("finds the service the engine registered for itself", () => {
    const world = createConstructionWorld();
    expect(getConstructionService(world.engine)).toBeInstanceOf(ConstructionService);
  });

  it("binds a replacement and throws for an engine that never registered", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    const replacement = new ConstructionService();
    bindConstructionService(engine, replacement);
    expect(getConstructionService(engine)).toBe(replacement);
    const stray = Object.create(GameEngine.prototype) as GameEngine;
    expect(() => getConstructionService(stray)).toThrow("not registered");
  });
});
