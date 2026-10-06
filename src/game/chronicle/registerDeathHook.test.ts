import { describe, expect, it } from "vitest";
import { NotableMomentKind } from "../content/contentTypes";
import { setFactionLeader } from "../factions/factionLeader";
import { MomentProminence } from "./chronicleTypes";
import type { MomentRecord } from "./chronicleTypes";
import { journalExcerpt, journalExcerptLength } from "./registerDeathHook";
import { createChronicleWorld } from "./testChronicleWorld";

function entry(kind: NotableMomentKind, params: MomentRecord["params"] = {}): MomentRecord {
  return {
    momentId: 1,
    tick: 0,
    kind,
    prominence: MomentProminence.Minor,
    entityId: 1,
    nameSnapshot: null,
    params,
  };
}

describe("journalExcerpt", () => {
  it("lists the kinds of the last entries, with the skill where there is one", () => {
    expect(journalExcerpt([])).toBe("");
    const journal = [
      entry(NotableMomentKind.Arrived),
      entry(NotableMomentKind.FirstWork, { skillId: "baking" }),
      entry(NotableMomentKind.JoinedGuild),
      entry(NotableMomentKind.TitleEarned, { skillId: "baking" }),
      entry(NotableMomentKind.Renamed),
    ];
    expect(journalExcerptLength).toBe(4);
    expect(journalExcerpt(journal)).toBe(
      "first_work:baking,joined_guild,title_earned:baking,renamed",
    );
  });
});

describe("registerDeathHook", () => {
  it("records Died once, Major, with the last styled name and an excerpt of the journal", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    setFactionLeader(world.engine, world.government, citizen.id);
    world.flush();
    const deleted: { name: string | null }[] = [];
    world.engine.bus.subscribe<{ name: string | null }>("entity.deleted", (payload) =>
      deleted.push(payload),
    );
    world.engine.store.requestDelete(citizen.id);
    world.engine.store.flushDeletions();
    world.flush();
    const died = world.ofKind("died");
    expect(died).toHaveLength(1);
    expect(died[0]).toMatchObject({ prominence: "major", entityId: citizen.id });
    expect(died[0]?.nameSnapshot).toBe(deleted[0]?.name);
    expect(died[0]?.nameSnapshot).toContain(", Reeve of the Settlement");
    expect(died[0]?.params["journalExcerpt"]).toBe("arrived,took_office");
    expect(world.chronicle().at(-1)).toEqual(died[0]);
  });

  it("keeps the earlier chronicle entries of the dead and records nothing for outsiders", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    const outsider = world.engine.store.spawn("peasant");
    setFactionLeader(world.engine, world.government, citizen.id);
    world.flush();
    world.engine.store.requestDelete(citizen.id);
    world.engine.store.requestDelete(outsider.id);
    world.engine.store.flushDeletions();
    world.flush();
    expect(world.chronicle().map((record) => record.kind)).toEqual(["took_office", "died"]);
    expect(world.ofKind("died")).toHaveLength(1);
    expect(world.ofKind("lost_office")).toEqual([]);
  });
});
