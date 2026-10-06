import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { factionComponent } from "../factions/factionComponent";
import { membersOf } from "../factions/factionMembership";
import { getStanding } from "../factions/factionStanding";
import { styledName } from "../identity/styledName";
import { spawnNpcFactions, spawnNpcMember } from "./npcFactions";
import { createDiplomacyWorld } from "./testDiplomacyWorld";

// @covers 021:FR-012 021:SC-007
describe("spawnNpcFactions", () => {
  it("seeds every content faction with an npc block: seat, members, leader and standing", () => {
    const world = createDiplomacyWorld();
    const ids = ["merchant_caravans", "ashford_barony", "wulfric_abbey"].map(world.npc);
    for (const id of ids) {
      const faction = getComponent(world.engine.store.require(id), factionComponent);
      expect(faction?.seat?.mapId).toBe(world.mapId);
      expect(membersOf(world.engine, id)).toHaveLength(2);
      expect(faction?.leaderId).not.toBeNull();
    }
    expect(getStanding(world.engine, ids[1] as number, world.government).value).toBe(-5);
    expect(getStanding(world.engine, world.government, ids[1] as number).value).toBe(-5);
    expect(getStanding(world.engine, ids[2] as number, world.government).value).toBe(25);
    expect(getStanding(world.engine, world.government, ids[2] as number).value).toBe(20);
  });

  it("names the leaders and styles them with their office", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const leaderId = getComponent(world.engine.store.require(abbey), factionComponent)?.leaderId;
    const name = styledName(world.engine, world.engine.store.require(leaderId ?? 0));
    expect(name).toContain("Abbot of the Abbey of St Wulfric");
    expect(name?.length).toBeGreaterThan(" Abbot of the Abbey of St Wulfric".length);
  });

  it("returns the faction ids in content order and does nothing without a map", () => {
    const world = createDiplomacyWorld();
    expect(["merchant_caravans", "ashford_barony", "wulfric_abbey"].map(world.npc)).toEqual(
      [...["merchant_caravans", "ashford_barony", "wulfric_abbey"].map(world.npc)].sort(
        (left, right) => left - right,
      ),
    );
    const bare = createDiplomacyWorld();
    bare.engine.store.requestDelete(bare.boardId);
    bare.engine.store.flushDeletions();
    expect(spawnNpcFactions(bare.engine)).toEqual([]);
  });

  it("is deterministic: the same seed gives the same leaders", () => {
    const names = (seed: number): (string | null)[] => {
      const world = createDiplomacyWorld({ seed });
      return ["merchant_caravans", "ashford_barony", "wulfric_abbey"].map((id) => {
        const faction = getComponent(world.engine.store.require(world.npc(id)), factionComponent);
        return styledName(world.engine, world.engine.store.require(faction?.leaderId ?? 0));
      });
    };
    expect(names(5)).toEqual(names(5));
    expect(names(5)).not.toEqual(names(6));
  });
});

describe("spawnNpcMember", () => {
  it("adds a named citizen without a position to the faction", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    const member = spawnNpcMember(world.engine, baron);
    expect(membersOf(world.engine, baron).map((entity) => entity.id)).toContain(member.id);
    expect(member.components["Position"]).toBeUndefined();
    expect((member.components["Identity"] as { givenName: string }).givenName).not.toBe("");
  });
});
