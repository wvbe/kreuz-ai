import { describe, expect, it } from "vitest";
import { StatusSubjectKind } from "./statusTypes";
import { subjectOfEntity } from "./subjectOfEntity";
import { createStatusWorld } from "./testStatusWorld";

describe("subjectOfEntity", () => {
  // @covers 025:FR-001
  it("recognises citizens, workstations, sites, zones, boards and loose piles", () => {
    const world = createStatusWorld();
    const settler = world.settler(11);
    const oven = world.station("oven", 22);
    const site = world.place("wall", 44);
    const [zoneId] = world.designate("bakery", world.rect(5, 5, 2, 2));
    const pile = world.pile(60, [{ materialId: "oak_log", quantity: 1 }]);
    const engine = world.engine;
    expect(subjectOfEntity(engine, settler.id)).toEqual({
      kind: StatusSubjectKind.Citizen,
      id: settler.id,
    });
    expect(subjectOfEntity(engine, oven.id)?.kind).toBe(StatusSubjectKind.Workstation);
    expect(subjectOfEntity(engine, site)?.kind).toBe(StatusSubjectKind.ConstructionSite);
    expect(subjectOfEntity(engine, zoneId ?? 0)?.kind).toBe(StatusSubjectKind.Zone);
    expect(subjectOfEntity(engine, world.boardId)?.kind).toBe(StatusSubjectKind.JobBoard);
    expect(subjectOfEntity(engine, pile.id)?.kind).toBe(StatusSubjectKind.LoosePile);
  });

  it("returns null for other entities, unknown ids and entities pending deletion", () => {
    const world = createStatusWorld();
    const chest = world.chest(55);
    const settler = world.settler(11);
    expect(subjectOfEntity(world.engine, chest.id)).toBeNull();
    expect(subjectOfEntity(world.engine, 999)).toBeNull();
    world.engine.store.requestDelete(settler.id);
    expect(subjectOfEntity(world.engine, settler.id)).toBeNull();
  });
});
