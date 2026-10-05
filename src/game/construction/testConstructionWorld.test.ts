import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { createConstructionWorld } from "./testConstructionWorld";

describe("createConstructionWorld", () => {
  it("places blueprints and finds their sites", () => {
    const world = createConstructionWorld();
    const id = world.place("wall", 30, { priority: 60 });
    expect(world.hasSite(id)).toBe(true);
    expect(world.site(id).data.priority).toBe(60);
    expect(world.built.map((event) => event.name)).toEqual([]);
    world.run(1);
    expect(world.built.map((event) => event.name)).toEqual(["construction.job.queued"]);
    world.command("CancelConstructionJob", { jobId: id });
    expect(world.hasSite(id)).toBe(false);
    expect(() => world.site(id)).toThrow("no live site");
  });

  it("stocks a chest with the materials of a definition and runs until a condition", () => {
    const world = createConstructionWorld();
    const chest = world.chest(55);
    world.stockFor(chest, "door", 2);
    expect(getTotal(chest, "oak_plank")).toBe(4);
    expect(getTotal(chest, "nails")).toBe(4);
    expect(world.runUntil(() => world.engine.time.tickCount >= 5, 50)).toBe(5);
    expect(world.runUntil(() => false, 3)).toBe(3);
  });
});
