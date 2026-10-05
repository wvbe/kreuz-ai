import { describe, expect, it } from "vitest";
import { createJobWorld } from "../jobs/testJobWorld";
import { createStatusContext } from "./statusContext";

describe("createStatusContext", () => {
  it("returns the reach costs of a citizen, the same object while nothing changes", () => {
    const world = createJobWorld();
    const settler = world.spawn("peasant", 11);
    const context = createStatusContext(world.engine);
    const first = context.reachCosts(settler);
    expect(first?.get(11)).toBe(0);
    expect(first?.size).toBe(100);
    expect(createStatusContext(world.engine).reachCosts(settler)).toBe(first);
  });

  it("recomputes after the map changed", () => {
    const world = createJobWorld();
    const settler = world.spawn("peasant", 11);
    const before = createStatusContext(world.engine).reachCosts(settler);
    world.engine.maps.require(world.mapId).setTerrain(12, "rock_wall");
    const after = createStatusContext(world.engine).reachCosts(settler);
    expect(after).not.toBe(before);
    expect(after?.has(12)).toBe(false);
  });

  it("returns null for an entity without a position", () => {
    const world = createJobWorld();
    const settler = world.spawn("peasant", 11);
    world.engine.maps.removeEntity(settler.id);
    delete settler.components["Position"];
    expect(createStatusContext(world.engine).reachCosts(settler)).toBeNull();
  });

  it("lists the citizens once per pass, leaving out entities pending deletion", () => {
    const world = createJobWorld();
    const first = world.spawn("peasant", 11);
    const second = world.spawn("peasant", 12);
    world.spawn("job_board", 20);
    const context = createStatusContext(world.engine);
    expect(context.citizens().map((entity) => entity.id)).toEqual([first.id, second.id]);
    expect(context.citizens()).toBe(context.citizens());
    world.engine.store.requestDelete(second.id);
    expect(
      createStatusContext(world.engine)
        .citizens()
        .map((entity) => entity.id),
    ).toEqual([first.id]);
  });
});
