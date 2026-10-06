import { describe, expect, it } from "vitest";
import { createScenarioSession } from "../api/scenario/createScenarioSession";
import { NotableMomentKind } from "../content/contentTypes";
import type { JsonValue } from "../engine/EventBus";
import { recordMoment } from "./recordMoment";
import { createChronicleWorld } from "./testChronicleWorld";

function started() {
  const session = createScenarioSession();
  session.newGame({ seed: 42, mapSize: 0 });
  return session;
}

function data(result: { ok: boolean; data?: JsonValue }): JsonValue {
  if (!result.ok || result.data === undefined) {
    throw new Error("query failed");
  }
  return result.data;
}

describe("registerChronicle", () => {
  it("answers the queries chronicle, journal and moments-since", () => {
    const session = started();
    session.step(600);
    const chronicle = data(session.query.run("chronicle", {})) as {
      total: number;
      moments: { kind: string; text: string; nameSnapshot: string }[];
    };
    expect(chronicle.moments.map((moment) => moment.kind)).toEqual(["took_office"]);
    expect(chronicle.moments[0]?.text).toBe(`${chronicle.moments[0]?.nameSnapshot} took office.`);
    const journal = data(session.query.run("journal", { entityId: 3 })) as {
      entries: { kind: string }[];
    };
    expect(journal.entries[0]?.kind).toBe("arrived");
    const since = data(session.query.run("moments-since", { tick: 0 })) as { kind: string }[];
    expect(since.filter((moment) => moment.kind === "arrived")).toHaveLength(6);
    expect(
      data(session.query.run("chronicle", { kind: "tier_reached", entityId: 5, limit: 3 })),
    ).toMatchObject({ total: 0, moments: [] });
    expect(session.query.run("chronicle", { limit: 0 }).ok).toBe(false);
  });

  it("renames a citizen by command and rejects a bad name at the next tick", () => {
    const session = started();
    const result = session.dispatch({
      kind: "RenameCitizen",
      entityId: 3,
      givenName: "Ansel",
      byname: "atte Brook",
    });
    expect(result.ok).toBe(true);
    session.step(1);
    const journal = data(session.query.run("journal", { entityId: 3 })) as {
      entries: { kind: string; params: { previousName?: string } }[];
    };
    expect(journal.entries.at(-1)?.kind).toBe("renamed");
    expect(data(session.query.run("identity-of", { entityId: 3 }))).toMatchObject({
      fullName: "Ansel atte Brook",
    });
    session.dispatch({ kind: "RenameCitizen", entityId: 3, givenName: "", byname: null });
    session.step(1);
    expect(data(session.query.run("identity-of", { entityId: 3 }))).toMatchObject({
      fullName: "Ansel atte Brook",
    });
    const rejected = session.query
      .eventLog(100)
      .events.filter((event) => event.name === "command.rejected");
    expect(rejected).toHaveLength(1);
  });

  it("saves and loads journals, chronicle and finest table identically, then plays on the same", () => {
    const first = started();
    first.step(900);
    const saved = first.save();
    const text = String(data(saved));
    const second = createScenarioSession();
    expect(second.load(text).ok).toBe(true);
    expect(second.stateHash()).toBe(first.stateHash());
    expect(data(second.query.run("moments-since", { tick: 0 }))).toEqual(
      data(first.query.run("moments-since", { tick: 0 })),
    );
    first.step(600);
    second.step(600);
    expect(second.stateHash()).toBe(first.stateHash());
    expect(data(second.query.run("moments-since", { tick: 0 }))).toEqual(
      data(first.query.run("moments-since", { tick: 0 })),
    );
  });

  it("is deterministic: the same seed gives the same moments", () => {
    const left = started();
    const right = started();
    left.step(1200);
    right.step(1200);
    expect(JSON.stringify(data(left.query.run("moments-since", { tick: 0 })))).toBe(
      JSON.stringify(data(right.query.run("moments-since", { tick: 0 }))),
    );
  });

  it("keeps 200 full journals and a full chronicle within the 1 MB budget (SC-006, D-17)", () => {
    const world = createChronicleWorld();
    const citizens = Array.from({ length: 200 }, () => world.addCitizen());
    for (const citizen of citizens) {
      for (let index = 0; index < 24; index += 1) {
        recordMoment(world.engine, {
          kind: NotableMomentKind.HomeImproved,
          entityId: citizen.id,
          params: { dwellingId: 123456 + index, dwellingLevel: "timber_framed_house" },
        });
      }
    }
    for (let index = 0; index < 240; index += 1) {
      const citizen = citizens[index % citizens.length];
      recordMoment(world.engine, {
        kind: NotableMomentKind.MasteryAchieved,
        entityId: citizen?.id ?? 0,
        params: {
          skillId: "metalworking_mastery",
          noun: "Blacksmith",
          guildId: "guild_blacksmiths",
        },
      });
    }
    let bytes = 0;
    for (const citizen of citizens) {
      const identity = world.identityOf(citizen.id);
      expect(identity.journal).toHaveLength(16);
      bytes += JSON.stringify(identity).length;
    }
    const chronicle = world.engine.store.require(world.government).components[
      "SettlementChronicle"
    ];
    expect(world.chronicle()).toHaveLength(200);
    bytes += JSON.stringify(chronicle).length;
    expect(bytes).toBeLessThan(1024 * 1024);
  });
});
