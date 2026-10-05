import { describe, expect, it } from "vitest";
import { getAiService } from "./aiServiceRegistry";
import { aiDecisionSystemId, aiNeedsSystemId, registerAi } from "./registerAi";
import { createAiWorld } from "./testAiWorld";

describe("registerAi", () => {
  it("is done by the engine: components, task types, handlers and systems exist", () => {
    const { engine } = createAiWorld();
    for (const name of ["Needs", "Mood", "Health", "Relationships"]) {
      expect(engine.components.has(name)).toBe(true);
    }
    expect(engine.taskHandlers.types()).toEqual(
      expect.arrayContaining(["move", "ai.satisfy", "ai.idle"]),
    );
    const systems = engine.pipeline.getSystemOrder();
    expect(systems.find((system) => system.id === aiNeedsSystemId)?.slot).toBe(4);
    expect(systems.find((system) => system.id === aiDecisionSystemId)?.slot).toBe(5);
  });

  it("is idempotent and returns the same service", () => {
    const { engine } = createAiWorld();
    expect(registerAi(engine)).toBe(getAiService(engine));
  });

  it("answers the needs-of query and returns null for unknown or need-less entities", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 3);
    const query = world.engine.getQuery("needs-of");
    const view = query?.run({ entityId: farmer.id }, world.engine);
    expect(view).toMatchObject({ entityId: farmer.id, role: "worker" });
    expect(query?.run({ entityId: 9999 }, world.engine)).toBeNull();
    const board = world.engine.store.spawn("job_board");
    expect(query?.run({ entityId: board.id }, world.engine)).toBeNull();
    expect(() => query?.schema.parse({ entityId: 0 })).toThrow();
  });

  it("decays needs at slot 4 and decides at slot 5 as the tick runs", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 44);
    world.run(1);
    const needs = world.engine.store.require(farmer.id).components["Needs"] as {
      values: { needId: string; valueMilli: number }[];
    };
    expect(needs.values.find((value) => value.needId === "hunger")?.valueMilli).toBe(79_850);
    const queue = world.engine.tasks.getQueue(farmer.id);
    expect((queue?.tasks.length ?? 0) + (queue?.history.length ?? 0)).toBe(1);
  });
});
