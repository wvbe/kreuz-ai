import { describe, expect, it } from "vitest";
import { NotableMomentKind } from "../content/contentTypes";
import { MomentProminence } from "./chronicleTypes";
import type { MomentRecord } from "./chronicleTypes";
import { appendToJournal, recordMoment } from "./recordMoment";
import { createChronicleWorld } from "./testChronicleWorld";

function record(momentId: number, kind: NotableMomentKind): MomentRecord {
  return {
    momentId,
    tick: momentId,
    kind,
    prominence: MomentProminence.Minor,
    entityId: 1,
    nameSnapshot: null,
    params: {},
  };
}

describe("appendToJournal", () => {
  // @covers 028:FR-017
  it("drops the oldest entry other than Arrived when the journal is full", () => {
    const journal = [
      record(1, NotableMomentKind.Arrived),
      record(2, NotableMomentKind.FirstWork),
      record(3, NotableMomentKind.JoinedGuild),
    ];
    appendToJournal(journal, record(4, NotableMomentKind.TitleEarned), 3);
    expect(journal.map((entry) => entry.momentId)).toEqual([1, 3, 4]);
  });

  it("drops the oldest entry of a journal that holds nothing but Arrived", () => {
    const journal = [record(1, NotableMomentKind.Arrived), record(2, NotableMomentKind.Arrived)];
    appendToJournal(journal, record(3, NotableMomentKind.Arrived), 2);
    expect(journal.map((entry) => entry.momentId)).toEqual([2, 3]);
  });
});

describe("recordMoment", () => {
  it("records a Minor moment in the journal only, with the styled name, and queues the event", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    const before = world.recorded.length;
    const made = recordMoment(world.engine, {
      kind: NotableMomentKind.FirstWork,
      entityId: citizen.id,
      params: { skillId: "baking" },
    });
    world.flush();
    expect(made).toMatchObject({
      kind: "first_work",
      prominence: "minor",
      entityId: citizen.id,
      params: { skillId: "baking" },
    });
    expect(made?.nameSnapshot).toEqual(
      expect.stringContaining(world.identityOf(citizen.id).givenName),
    );
    expect(world.identityOf(citizen.id).journal.at(-1)).toEqual(made);
    expect(world.chronicle()).toEqual([]);
    expect(world.recorded).toHaveLength(before + 1);
  });

  // @covers 028:FR-014
  it("records a Major moment in the journal and the chronicle and keeps the ids monotonic", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    const first = recordMoment(world.engine, {
      kind: NotableMomentKind.TookOffice,
      entityId: citizen.id,
      params: { factionId: world.government, office: "Reeve" },
    });
    const second = recordMoment(world.engine, {
      kind: NotableMomentKind.TierReached,
      entityId: null,
      params: { tier: "village", previousTier: "hamlet" },
    });
    expect(world.chronicle()).toEqual([first, second]);
    expect(second?.nameSnapshot).toBeNull();
    expect((second?.momentId ?? 0) - (first?.momentId ?? 0)).toBe(1);
    expect(world.identityOf(citizen.id).journal.map((entry) => entry.kind)).toEqual([
      "arrived",
      "took_office",
    ]);
  });

  // @covers 028:FR-014
  it("records nothing about an entity that is no named settlement citizen", () => {
    const world = createChronicleWorld();
    const outsider = world.engine.store.spawn("peasant");
    expect(
      recordMoment(world.engine, {
        kind: NotableMomentKind.FirstWork,
        entityId: outsider.id,
        params: { skillId: "baking" },
      }),
    ).toBeNull();
    expect(
      recordMoment(world.engine, {
        kind: NotableMomentKind.FirstWork,
        entityId: 9999,
        params: { skillId: "baking" },
      }),
    ).toBeNull();
    expect(world.recorded).toEqual([]);
  });

  // @covers 028:FR-018
  it("keeps the 200 newest Major moments of the chronicle, oldest evicted first", () => {
    const world = createChronicleWorld();
    for (let index = 0; index < 205; index += 1) {
      recordMoment(world.engine, {
        kind: NotableMomentKind.SettlementMilestone,
        entityId: null,
        params: { milestone: `m${index}` },
      });
    }
    const moments = world.chronicle();
    expect(moments).toHaveLength(200);
    expect(moments[0]?.params["milestone"]).toBe("m5");
    expect(moments[199]?.params["milestone"]).toBe("m204");
  });

  it("keeps Arrived and the newest 15 entries of a journal of 16", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    for (let index = 0; index < 25; index += 1) {
      recordMoment(world.engine, {
        kind: NotableMomentKind.FirstWork,
        entityId: citizen.id,
        params: { skillId: `skill_${index}` },
      });
    }
    const journal = world.identityOf(citizen.id).journal;
    expect(journal).toHaveLength(16);
    expect(journal[0]?.kind).toBe("arrived");
    expect(journal[1]?.params["skillId"]).toBe("skill_10");
    expect(journal[15]?.params["skillId"]).toBe("skill_24");
  });

  it("mirrors the next moment id into the chronicle component", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    const made = recordMoment(world.engine, {
      kind: NotableMomentKind.Renamed,
      entityId: citizen.id,
      params: { previousName: "A" },
    });
    expect((made?.momentId ?? 0) + 1).toBe(
      (
        world.engine.store.require(world.government).components["SettlementChronicle"] as {
          nextMomentId: number;
        }
      ).nextMomentId,
    );
  });
});
