import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import { registerRoles } from "./registerRoles";

describe("registerRoles", () => {
  it("is registered by every engine and registering again is harmless", () => {
    const world = createAiWorld();
    expect(() => registerRoles(world.engine)).not.toThrow();
    const handlers = world.engine.behaviorHandlers;
    expect(handlers.hasCondition("zone_available")).toBe(true);
    expect(handlers.hasAction("go_to_zone")).toBe(true);
    expect(handlers.hasCondition("hostile_animal_near")).toBe(true);
    expect(handlers.hasAction("engage_threat")).toBe(true);
  });
});
