import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { factionComponent } from "../factions/factionComponent";
import { createDiplomacyWorld } from "./testDiplomacyWorld";

describe("createDiplomacyWorld", () => {
  it("has a government with a leader, a treasury and three NPC factions", () => {
    const world = createDiplomacyWorld();
    const government = getComponent(world.engine.store.require(world.government), factionComponent);
    expect(government?.leaderId).not.toBeNull();
    expect(world.treasury()).toBe(world.engine.content.constants.startingTreasury);
    expect(["merchant_caravans", "ashford_barony", "wulfric_abbey"].map(world.npc)).toHaveLength(3);
  });

  it("puts the market at cell 55 unless asked otherwise, and finds NPC factions by content id", () => {
    const world = createDiplomacyWorld();
    expect(world.engine.store.require(world.boardId).components["Position"]).toMatchObject({
      cellIndex: 55,
    });
    expect(() => world.npc("guild_bakers")).toThrow("no faction guild_bakers");
    expect(createDiplomacyWorld({ boardCell: 44 }).engine.store.require(2).prototype).toBeDefined();
  });
});
