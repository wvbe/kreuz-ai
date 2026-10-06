import { describe, expect, it } from "vitest";
import { NotableMomentKind } from "../content/contentTypes";
import {
  buildChronicleView,
  buildJournalView,
  buildMomentsSince,
  tierAtTick,
  toMomentView,
} from "./chronicleViews";
import { setFactionLeader } from "../factions/factionLeader";
import { recordMoment } from "./recordMoment";
import { createChronicleWorld } from "./testChronicleWorld";

function populated() {
  const world = createChronicleWorld();
  const first = world.addCitizen();
  const second = world.addCitizen();
  setFactionLeader(world.engine, world.government, first.id);
  world.flush();
  world.engine.runTicks(5);
  recordMoment(world.engine, {
    kind: NotableMomentKind.MasteryAchieved,
    entityId: second.id,
    params: { skillId: "baking", noun: "Baker", guildId: "guild_bakers" },
  });
  recordMoment(world.engine, {
    kind: NotableMomentKind.TierReached,
    entityId: null,
    params: { tier: "village", previousTier: "hamlet" },
  });
  return { world, first, second };
}

describe("tierAtTick", () => {
  it("is the highest tier reached at or before the tick", () => {
    const { world } = populated();
    const progress = world.engine.store.require(world.government).components[
      "SettlementProgress"
    ] as { tierReachedAtTick: { [tier: string]: number }; tier: string };
    expect(tierAtTick(world.engine, 9999)).toBe("hamlet");
    progress.tierReachedAtTick["village"] = 500;
    expect(tierAtTick(world.engine, 499)).toBe("hamlet");
    expect(tierAtTick(world.engine, 500)).toBe("village");
  });
});

describe("toMomentView", () => {
  it("adds the day and the rendered text", () => {
    const { world } = populated();
    const view = toMomentView(world.engine, world.chronicle()[2] ?? never());
    expect(view).toMatchObject({ kind: "tier_reached", day: 1, text: "The village has grown." });
    const progress = world.engine.store.require(world.government).components[
      "SettlementProgress"
    ] as { tierReachedAtTick: { [tier: string]: number } };
    progress.tierReachedAtTick["village"] = 100;
    const mastery = world.chronicle()[1] ?? never();
    expect(toMomentView(world.engine, mastery).text).toContain("a master baker");
    const early = { ...mastery, tick: 3, kind: NotableMomentKind.BecameFinest };
    expect(toMomentView(world.engine, early).text).toContain("hamlet's finest");
    expect(toMomentView(world.engine, { ...early, tick: 300 }).text).toContain("village's finest");
  });
});

describe("buildChronicleView", () => {
  it("lists Major moments newest first and applies the limit", () => {
    const { world } = populated();
    const view = buildChronicleView(world.engine, {}, 2);
    expect(view.total).toBe(3);
    expect(view.capacity).toBe(200);
    expect(view.moments.map((moment) => moment.kind)).toEqual(["tier_reached", "mastery_achieved"]);
  });

  it("filters by citizen, also after the citizen died, and by kind", () => {
    const { world, first, second } = populated();
    world.engine.store.requestDelete(first.id);
    world.engine.store.flushDeletions();
    world.flush();
    expect(
      buildChronicleView(world.engine, { entityId: first.id }, 10).moments.map(
        (moment) => moment.kind,
      ),
    ).toEqual(["died", "took_office"]);
    expect(
      buildChronicleView(world.engine, { kind: NotableMomentKind.MasteryAchieved }, 10).moments.map(
        (moment) => moment.entityId,
      ),
    ).toEqual([second.id]);
  });
});

describe("buildJournalView", () => {
  it("returns the journal oldest first with its capacity and null without an identity", () => {
    const { world, first } = populated();
    const view = buildJournalView(world.engine, first.id);
    expect(view?.capacity).toBe(16);
    expect(view?.entries.map((entry) => entry.kind)).toEqual(["arrived", "took_office"]);
    expect(view?.entries[0]?.text).toContain("has come to the hamlet");
    expect(buildJournalView(world.engine, world.government)).toBeNull();
    expect(buildJournalView(world.engine, 9999)).toBeNull();
  });
});

describe("buildMomentsSince", () => {
  it("merges chronicle and journals once each, ascending, from a tick on", () => {
    const { world } = populated();
    const all = buildMomentsSince(world.engine, 0);
    expect(all.map((moment) => moment.kind)).toEqual([
      "arrived",
      "arrived",
      "took_office",
      "mastery_achieved",
      "tier_reached",
    ]);
    expect(new Set(all.map((moment) => moment.momentId)).size).toBe(all.length);
    expect(buildMomentsSince(world.engine, 5).map((moment) => moment.kind)).toEqual([
      "mastery_achieved",
      "tier_reached",
    ]);
  });
});

function never(): never {
  throw new Error("missing");
}
