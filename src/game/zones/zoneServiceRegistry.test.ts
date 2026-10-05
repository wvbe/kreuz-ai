import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { ZoneService } from "./ZoneService";
import { bindZoneService, getZoneService } from "./zoneServiceRegistry";
import { createZoneWorld } from "./testZoneWorld";

describe("bindZoneService and getZoneService", () => {
  it("finds the service the engine registered for itself", () => {
    const world = createZoneWorld();
    expect(getZoneService(world.engine)).toBeInstanceOf(ZoneService);
  });

  it("binds a replacement and throws for an engine that never registered", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    const replacement = new ZoneService(engine);
    bindZoneService(engine, replacement);
    expect(getZoneService(engine)).toBe(replacement);
    const stray = Object.create(GameEngine.prototype) as GameEngine;
    expect(() => getZoneService(stray)).toThrow("not registered");
  });
});
