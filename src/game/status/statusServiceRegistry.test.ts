import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import { GameEngine } from "../engine/GameEngine";
import { loadContent } from "../content/ContentLoader";
import { StatusService } from "./StatusService";
import { bindStatusService, getStatusService } from "./statusServiceRegistry";

describe("getStatusService", () => {
  it("finds the service the engine registered for itself", () => {
    const world = createAiWorld();
    expect(getStatusService(world.engine)).toBeInstanceOf(StatusService);
    expect(getStatusService(world.engine).providers().length).toBeGreaterThanOrEqual(8);
  });
});

describe("bindStatusService", () => {
  it("replaces the service of an engine", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    const replacement = new StatusService();
    bindStatusService(engine, replacement);
    expect(getStatusService(engine)).toBe(replacement);
  });
});
