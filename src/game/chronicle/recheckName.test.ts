import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { joinFaction } from "../factions/factionMembership";
import { assignIdentity } from "../identity/assignIdentity";
import { recheckName } from "./recheckName";
import { createChronicleWorld } from "./testChronicleWorld";

describe("recheckName", () => {
  it("leaves a unique name alone", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    const named: JsonValue[] = [];
    world.engine.bus.subscribe("identity.named", (payload) => named.push(payload));
    expect(recheckName(world.engine, citizen.id)).toBe(false);
    world.flush();
    expect(named).toEqual([]);
  });

  it("gives a visitor that shares a member's name the lowest free ordinal when it joins", () => {
    const world = createChronicleWorld();
    const member = world.addCitizen();
    const visitor = world.engine.store.spawn("peasant");
    assignIdentity(world.engine, visitor.id);
    const memberIdentity = world.identityOf(member.id);
    const visitorIdentity = world.identityOf(visitor.id);
    visitorIdentity.givenName = memberIdentity.givenName;
    visitorIdentity.byname = memberIdentity.byname;
    visitorIdentity.nameOrdinal = memberIdentity.nameOrdinal;
    world.flush();
    const named: JsonValue[] = [];
    world.engine.bus.subscribe("identity.named", (payload) => named.push(payload));
    joinFaction(world.engine, visitor.id, world.government);
    world.flush();
    expect(visitorIdentity.nameOrdinal).toBe(2);
    expect(named).toHaveLength(1);
    expect(world.ofKind("arrived").some((record) => record.entityId === visitor.id)).toBe(true);
  });

  it("ignores unknown and unnamed entities", () => {
    const world = createChronicleWorld();
    expect(recheckName(world.engine, 9999)).toBe(false);
    expect(recheckName(world.engine, world.government)).toBe(false);
  });
});
