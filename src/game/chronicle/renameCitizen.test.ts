import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { IdentityError, IdentityErrorKind } from "../identity/IdentityError";
import { maxNameLength, renameCitizen } from "./renameCitizen";
import { createChronicleWorld } from "./testChronicleWorld";

function kindOf(action: () => void): IdentityErrorKind | null {
  try {
    action();
  } catch (failure) {
    return failure instanceof IdentityError ? failure.kind : null;
  }
  return null;
}

describe("renameCitizen", () => {
  // @covers 028:FR-005
  it("replaces the names, queues identity.named and records Renamed with the previous name", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    const named: JsonValue[] = [];
    world.engine.bus.subscribe("identity.named", (payload) => named.push(payload));
    expect(renameCitizen(world.engine, citizen.id, "  Ansel ", " atte Brook ")).toBe(true);
    world.flush();
    const identity = world.identityOf(citizen.id);
    expect([identity.givenName, identity.byname, identity.nameOrdinal]).toEqual([
      "Ansel",
      "atte Brook",
      0,
    ]);
    expect(named).toEqual([
      { entityId: citizen.id, givenName: "Ansel", byname: "atte Brook", nameOrdinal: 0 },
    ]);
    const renamed = world.ofKind("renamed");
    expect(renamed).toHaveLength(1);
    expect(renamed[0]?.nameSnapshot).toContain("Ansel");
    expect(renamed[0]?.params["previousName"]).not.toContain("Ansel");
  });

  it("keeps old journal entries under the old name", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    const oldName = world.identityOf(citizen.id).journal[0]?.nameSnapshot;
    renameCitizen(world.engine, citizen.id, "Odo", null);
    expect(world.identityOf(citizen.id).journal[0]?.nameSnapshot).toBe(oldName);
    expect(world.identityOf(citizen.id).byname).toBeNull();
  });

  it("gives a name that a living member has the lowest free ordinal and does not redraw", () => {
    const world = createChronicleWorld();
    const first = world.addCitizen();
    const second = world.addCitizen();
    renameCitizen(world.engine, first.id, "Odo", "Thorne");
    renameCitizen(world.engine, second.id, "odo", "thorne");
    expect(world.identityOf(second.id).nameOrdinal).toBe(2);
    expect(renameCitizen(world.engine, second.id, "odo", "thorne")).toBe(false);
  });

  // @covers 028:FR-020
  it("rejects bad names with InvalidName and strangers with UnknownEntity", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    const outsider = world.engine.store.spawn("peasant");
    const rename = (given: string, byname: string | null) => () =>
      renameCitizen(world.engine, citizen.id, given, byname);
    expect(kindOf(rename("", null))).toBe(IdentityErrorKind.InvalidName);
    expect(kindOf(rename("   ", null))).toBe(IdentityErrorKind.InvalidName);
    expect(kindOf(rename("x".repeat(maxNameLength + 1), null))).toBe(IdentityErrorKind.InvalidName);
    expect(kindOf(rename("Odo", "y".repeat(maxNameLength + 1)))).toBe(
      IdentityErrorKind.InvalidName,
    );
    expect(kindOf(rename("Od\no", null))).toBe(IdentityErrorKind.InvalidName);
    expect(kindOf(rename("Odo", "T\u0007"))).toBe(IdentityErrorKind.InvalidName);
    expect(kindOf(rename("x".repeat(maxNameLength), "y".repeat(maxNameLength)))).toBeNull();
    expect(kindOf(() => renameCitizen(world.engine, outsider.id, "Odo", null))).toBe(
      IdentityErrorKind.UnknownEntity,
    );
    expect(kindOf(() => renameCitizen(world.engine, 9999, "Odo", null))).toBe(
      IdentityErrorKind.UnknownEntity,
    );
    expect(() => renameCitizen(world.engine, outsider.id, "Odo", null)).toThrow(/^UnknownEntity:/);
  });
});
