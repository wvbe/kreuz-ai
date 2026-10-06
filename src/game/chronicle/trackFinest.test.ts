import { describe, expect, it } from "vitest";
import { chronicleOf } from "./chronicleOf";
import { createChronicleWorld } from "./testChronicleWorld";
import { refreshFinest, trackFinest } from "./trackFinest";

function raise(
  world: ReturnType<typeof createChronicleWorld>,
  entityId: number,
  level: number,
): void {
  world.setLevel(entityId, "baking", level);
  trackFinest(world.engine, entityId, "baking", level);
  world.flush();
}

function table(world: ReturnType<typeof createChronicleWorld>) {
  return chronicleOf(world.engine)?.finest ?? [];
}

describe("trackFinest", () => {
  it("ignores levels below the minimum and non-members", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    const outsider = world.engine.store.spawn("peasant");
    raise(world, citizen.id, 39);
    world.setLevel(outsider.id, "baking", 60);
    trackFinest(world.engine, outsider.id, "baking", 60);
    expect(table(world)).toEqual([]);
    expect(world.ofKind("became_finest")).toEqual([]);
  });

  // @covers 028:FR-015
  it("announces the first holder with a Major BecameFinest", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    raise(world, citizen.id, 41);
    expect(world.ofKind("became_finest")).toHaveLength(1);
    expect(world.ofKind("became_finest")[0]).toMatchObject({
      prominence: "major",
      entityId: citizen.id,
      params: { skillId: "baking", noun: "Baker", level: 41 },
    });
    expect(world.chronicle().map((record) => record.kind)).toContain("became_finest");
    expect(table(world)).toEqual([
      { skillId: "baking", entityId: citizen.id, level: 41, sinceTick: 0, lastAnnouncedTick: 0 },
    ]);
  });

  it("keeps the holder on a tie and follows the holder's own growth", () => {
    const world = createChronicleWorld();
    const first = world.addCitizen();
    const second = world.addCitizen();
    raise(world, first.id, 41);
    raise(world, second.id, 41);
    expect(table(world)[0]?.entityId).toBe(first.id);
    raise(world, first.id, 44);
    expect(table(world)[0]?.level).toBe(44);
    expect(world.ofKind("became_finest")).toHaveLength(1);
  });

  // @covers 028:FR-015
  it("changes the holder silently within the cooldown and announces after it", () => {
    const world = createChronicleWorld();
    const first = world.addCitizen();
    const second = world.addCitizen();
    raise(world, first.id, 41);
    raise(world, second.id, 42);
    expect(table(world)[0]).toMatchObject({ entityId: second.id, level: 42, lastAnnouncedTick: 0 });
    expect(world.ofKind("became_finest")).toHaveLength(1);
    expect(world.ofKind("lost_finest")).toEqual([]);
    world.engine.runTicks(3 * 288);
    raise(world, first.id, 43);
    expect(world.ofKind("became_finest").map((record) => record.entityId)).toEqual([
      first.id,
      first.id,
    ]);
    expect(world.ofKind("lost_finest")).toHaveLength(1);
    expect(world.ofKind("lost_finest")[0]).toMatchObject({
      prominence: "minor",
      entityId: second.id,
      params: { level: 42 },
    });
    expect(table(world)[0]?.lastAnnouncedTick).toBe(3 * 288);
  });

  it("enters a citizen who started better silently and does not displace it on a tie", () => {
    const world = createChronicleWorld();
    const veteran = world.addCitizen();
    const apprentice = world.addCitizen();
    world.setLevel(veteran.id, "baking", 45);
    raise(world, apprentice.id, 41);
    expect(table(world)).toEqual([
      { skillId: "baking", entityId: veteran.id, level: 45, sinceTick: 0, lastAnnouncedTick: 0 },
    ]);
    expect(world.ofKind("became_finest")).toEqual([]);
  });
});

describe("refreshFinest", () => {
  it("re-elects the best member silently when the holder dies, then drops the entry", () => {
    const world = createChronicleWorld();
    const first = world.addCitizen();
    const second = world.addCitizen();
    raise(world, first.id, 50);
    world.setLevel(second.id, "baking", 45);
    const announced = world.ofKind("became_finest").length;
    world.engine.store.requestDelete(first.id);
    world.engine.store.flushDeletions();
    world.flush();
    expect(table(world)).toEqual([expect.objectContaining({ entityId: second.id, level: 45 })]);
    expect(world.ofKind("became_finest")).toHaveLength(announced);
    world.setLevel(second.id, "baking", 10);
    refreshFinest(world.engine);
    expect(table(world)).toHaveLength(1);
    world.engine.store.requestDelete(second.id);
    world.engine.store.flushDeletions();
    world.flush();
    expect(table(world)).toEqual([]);
  });
});
