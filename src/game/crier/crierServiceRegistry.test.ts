import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import { GameEngine } from "../engine/GameEngine";
import { loadContent } from "../content/ContentLoader";
import { CrierService } from "./CrierService";
import { bindCrierService, getCrierService } from "./crierServiceRegistry";

describe("crierServiceRegistry", () => {
  it("finds the service the engine registered for itself", () => {
    const world = createAiWorld();
    expect(getCrierService(world.engine)).toBeInstanceOf(CrierService);
  });

  it("binds a service to an engine and keeps engines apart", () => {
    const first = new GameEngine(loadContent(), { entropy: () => 1 });
    const second = new GameEngine(loadContent(), { entropy: () => 1 });
    const own = new CrierService();
    bindCrierService(first, own);
    expect(getCrierService(first)).toBe(own);
    expect(getCrierService(second)).not.toBe(own);
  });
});
