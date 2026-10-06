import { describe, expect, it } from "vitest";
import { explain } from "../status/explain";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../status/statusTypes";
import { evaluateSubject } from "../status/explain";
import { createStatusContext } from "../status/statusContext";
import { dwellingProvider } from "./dwellingProvider";
import { assignHome } from "./household";
import { contentWithLevels, createHousingWorld } from "./testHousingWorld";
import type { HousingTestWorld } from "./testHousingWorld";

const options = { width: 16, height: 12 };

function statusOf(world: HousingTestWorld, id: number) {
  return evaluateSubject(world.engine, { kind: StatusSubjectKind.Dwelling, id });
}

describe("dwellingProvider", () => {
  it("lists the dwellings as subjects", () => {
    const world = createHousingWorld({ width: 20, height: 12 });
    const first = world.dwelling(1, 2);
    const second = world.dwelling(6, 2);
    expect(dwellingProvider.subjects(world.engine)).toEqual([
      { kind: StatusSubjectKind.Dwelling, id: first },
      { kind: StatusSubjectKind.Dwelling, id: second },
    ]);
  });

  it("reports ZoneInactive with the zone as cause when the dwelling is inactive", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 1 });
    const door = world.engine.store.entities().find((entity) => entity.prototype === "door");
    world.engine.store.requestDelete(door?.id ?? 0);
    world.run(2);
    const status = statusOf(world, zone);
    expect(status?.state).toBe(StatusState.Blocked);
    expect(status?.reasons[0]).toMatchObject({
      kind: BlockedReasonKind.ZoneInactive,
      params: { zoneId: zone },
      causeRef: { kind: StatusSubjectKind.Zone, id: zone },
    });
  });

  it("is Active while nobody lives there and null for no dwelling", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 1 });
    expect(statusOf(world, zone)?.state).toBe(StatusState.Active);
    expect(
      dwellingProvider.evaluate(
        world.engine,
        { kind: StatusSubjectKind.Dwelling, id: 9999 },
        createStatusContext(world.engine),
      ),
    ).toBeNull();
  });

  it("is Idle with DwellingRequirementsUnmet and LockedByTier for the next level (FR-019a)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const settler = world.settler(170);
    assignHome(world.engine, settler.id, zone, 0);
    const status = statusOf(world, zone);
    expect(status?.state).toBe(StatusState.Idle);
    const kinds = status?.reasons.map((reason) => reason.kind);
    expect(kinds).toContain(BlockedReasonKind.LockedByTier);
    expect(kinds).toContain(BlockedReasonKind.DwellingRequirementsUnmet);
    expect(kinds).toContain(BlockedReasonKind.NoHouseholdStorage);
    const locked = status?.reasons.find((reason) => reason.kind === BlockedReasonKind.LockedByTier);
    expect(locked?.params).toEqual({ requiredTier: "village" });
    const unmet = status?.reasons.find(
      (reason) => reason.kind === BlockedReasonKind.DwellingRequirementsUnmet,
    );
    expect(unmet?.params["targetLevel"]).toBe("cottage");
  });

  it("is Blocked when a current-level requirement is unmet and names it", () => {
    const world = createHousingWorld({
      ...options,
      content: contentWithLevels({ hovel: { furniture: [{ kind: "tag", ref: "bed", count: 3 }] } }),
    });
    const zone = world.dwelling(2, 2, { beds: 1 });
    const settler = world.settler(170);
    assignHome(world.engine, settler.id, zone, 0);
    const status = statusOf(world, zone);
    expect(status?.state).toBe(StatusState.Blocked);
    expect(
      status?.reasons.find(
        (reason) =>
          reason.kind === BlockedReasonKind.DwellingRequirementsUnmet &&
          reason.params["targetLevel"] === "hovel",
      ),
    ).toMatchObject({ params: { unmet: ["Furniture:3x tag:bed"] } });
  });

  it("reports MissingInput when the household is short of a good that no storage holds (US3.3)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.chest(world.tiles(zone)[3] as number);
    const settler = world.settler(170);
    assignHome(world.engine, settler.id, zone, 0);
    const missing = statusOf(world, zone)?.reasons.find(
      (reason) => reason.kind === BlockedReasonKind.MissingInput,
    );
    expect(missing?.params).toMatchObject({ materialId: "bread", required: 1, available: 0 });
    expect(typeof missing?.params["noProducer"]).toBe("boolean");
    world.give(world.chest(171), "bread", 5);
    const reasons = statusOf(world, zone)?.reasons.map((reason) => reason.kind);
    expect(reasons).not.toContain(BlockedReasonKind.MissingInput);
  });

  it("can be explained through the status service", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    assignHome(world.engine, world.settler(170).id, zone, 0);
    const explanation = explain(world.engine, { kind: StatusSubjectKind.Dwelling, id: zone });
    expect(explanation?.subject).toEqual({ kind: StatusSubjectKind.Dwelling, id: zone });
    expect(explanation?.reasons.length).toBeGreaterThan(0);
  });
});
