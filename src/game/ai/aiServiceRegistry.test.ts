import { describe, expect, it } from "vitest";
import { AiService } from "./AiService";
import { bindAiService, getAiService } from "./aiServiceRegistry";
import { createAiWorld } from "./testAiWorld";

describe("getAiService", () => {
  it("returns the service every engine registers for itself", () => {
    const first = createAiWorld().engine;
    const second = createAiWorld().engine;
    expect(getAiService(first)).toBeInstanceOf(AiService);
    expect(getAiService(first)).not.toBe(getAiService(second));
  });
});

describe("bindAiService", () => {
  it("replaces the service of an engine", () => {
    const world = createAiWorld();
    const original = getAiService(world.engine);
    const replacement = new AiService(world.engine.content, original.pathfinding);
    bindAiService(world.engine, replacement);
    expect(getAiService(world.engine)).toBe(replacement);
  });
});
