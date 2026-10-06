import { describe, expect, it } from "vitest";
import { findSeat } from "./findSeat";
import { createStandingWorld } from "./testStandingWorld";

describe("findSeat", () => {
  // @covers 026:FR-013
  it("is null without an active throne room", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    expect(findSeat(world.engine)).toBeNull();
  });

  it("is the throne room, with its lowest tile as the place to stand", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    const zoneId = world.throneRoom(5, 5);
    const seat = findSeat(world.engine);
    expect(seat).toMatchObject({ zoneId, mapId: world.mapId, cellIndex: 5 * 20 + 5 });
    expect(seat?.tiles).toHaveLength(9);
  });

  it("takes the lowest active throne room of several", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    const first = world.throneRoom(2, 2);
    world.throneRoom(10, 10);
    expect(findSeat(world.engine)?.zoneId).toBe(first);
  });

  it("is null again when the room is broken", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.throneRoom(5, 5);
    const wall = world.engine.store.entities().find((entity) => entity.prototype === "wall");
    world.engine.store.requestDelete((wall as NonNullable<typeof wall>).id);
    world.run(2);
    expect(findSeat(world.engine)).toBeNull();
  });
});
