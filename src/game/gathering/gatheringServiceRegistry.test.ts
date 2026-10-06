import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { GatheringService } from "./GatheringService";
import { bindGatheringService, getGatheringService } from "./gatheringServiceRegistry";

describe("gatheringServiceRegistry", () => {
  it("finds the service the engine registered for itself", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(getGatheringService(engine)).toBeInstanceOf(GatheringService);
  });

  it("binds a replacement service", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    const service = new GatheringService();
    bindGatheringService(engine, service);
    expect(getGatheringService(engine)).toBe(service);
  });
});
