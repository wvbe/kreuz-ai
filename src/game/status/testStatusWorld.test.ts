import { describe, expect, it } from "vitest";
import { StatusState, StatusSubjectKind } from "./statusTypes";
import { createStatusWorld } from "./testStatusWorld";

describe("createStatusWorld", () => {
  it("adds, replaces and removes synthetic subjects", () => {
    const world = createStatusWorld();
    const ref = world.setSynthetic(3, { state: StatusState.Active, activity: null, reasons: [] });
    expect(ref).toEqual({ kind: StatusSubjectKind.StandingOrder, id: 3 });
    world.run(1);
    expect(world.statusEvents).toEqual([]);
    world.removeSynthetic(3);
    world.run(1);
    expect(world.statusEvents).toEqual([]);
  });

  it("builds an active bakery room", () => {
    const world = createStatusWorld();
    const { oven, zoneId } = world.bakery();
    expect(world.zoneData(zoneId).active).toBe(true);
    expect(world.engine.store.get(oven.id)).toBeDefined();
  });
});
