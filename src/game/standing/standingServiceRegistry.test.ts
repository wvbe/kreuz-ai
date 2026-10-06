import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { StandingService } from "./StandingService";
import { bindStandingService, getStandingService } from "./standingServiceRegistry";

describe("standingServiceRegistry", () => {
  it("finds the service the engine registered for itself", () => {
    const world = createAiWorld();
    expect(getStandingService(world.engine)).toBeInstanceOf(StandingService);
  });

  it("binds a service to an engine and keeps engines apart", () => {
    const first = new GameEngine(loadContent(), { entropy: () => 1 });
    const second = new GameEngine(loadContent(), { entropy: () => 1 });
    const own = new StandingService();
    bindStandingService(first, own);
    expect(getStandingService(first)).toBe(own);
    expect(getStandingService(second)).not.toBe(own);
  });

  it("throws for an engine that never registered the system", () => {
    expect(() => getStandingService(Object.create(GameEngine.prototype) as GameEngine)).toThrow(
      /not registered/,
    );
  });
});
