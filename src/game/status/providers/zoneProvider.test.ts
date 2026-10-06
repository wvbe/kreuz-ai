import { describe, expect, it } from "vitest";
import { createStatusContext } from "../statusContext";
import { evaluateSubject } from "../explain";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import { zoneProvider } from "./zoneProvider";

const zone = (id: number) => ({ kind: StatusSubjectKind.Zone, id });

describe("zoneProvider", () => {
  it("lists zones and returns null for a missing one", () => {
    const world = createStatusWorld();
    const [zoneId] = world.designate("bakery", world.rect(2, 2, 2, 2));
    expect(zoneProvider.subjects(world.engine)).toEqual([zone(zoneId ?? 0)]);
    expect(
      zoneProvider.evaluate(world.engine, zone(999), createStatusContext(world.engine)),
    ).toBeNull();
  });

  // @covers 025:FR-005
  it("is Blocked with ZoneRequirementsUnmet and the gaps while the room is open", () => {
    const world = createStatusWorld();
    const [zoneId] = world.designate("bakery", world.rect(2, 2, 2, 2));
    world.run(2);
    const status = evaluateSubject(world.engine, zone(zoneId ?? 0));
    expect(status?.state).toBe(StatusState.Blocked);
    const reason = status?.reasons[0];
    expect(reason?.kind).toBe(BlockedReasonKind.ZoneRequirementsUnmet);
    expect(reason?.params["zoneTypeId"]).toBe("bakery");
    const gaps = reason?.params["gaps"];
    expect(Array.isArray(gaps)).toBe(true);
    expect(JSON.stringify(gaps)).toContain("not-enclosed");
    expect(JSON.stringify(gaps)).toContain("missing-furniture");
  });

  it("is Active once the zone is a working room", () => {
    const world = createStatusWorld();
    const { zoneId } = world.bakery();
    const status = evaluateSubject(world.engine, zone(zoneId));
    expect(status?.state).toBe(StatusState.Active);
    expect(status?.reasons).toEqual([]);
  });
});
