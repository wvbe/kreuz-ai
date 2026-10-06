import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameSession } from "../../src/game/api/GameSession";
import { createScenarioSession } from "../../src/game/api/scenario/createScenarioSession";
import { formatScenarioResult } from "../../src/game/api/scenario/formatScenarioResult";
import { runScenario } from "../../src/game/api/scenario/runScenario";
import { parseScenario } from "../../src/game/api/scenario/Scenario";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { ticksPerDay } from "../../src/game/time/GameTime";

// Task 4.6 acceptance (spec 028, DECISIONS D-17 and D-60): every moment is recorded exactly once
// with the level of its kind, SC-005 (at most two Major moments a game day on average) holds along
// the whole Hamlet to Village run, the chronicle and the journals answer the queries, and a game
// saved at any point resumes with the same chronicle.

type Moment = {
  momentId: number;
  tick: number;
  kind: string;
  prominence: string;
  entityId: number | null;
  nameSnapshot: string | null;
  params: { [name: string]: string | number };
};

type Run = { result: string; moments: Moment[]; session: GameSession };

const longTimeout = 240_000;

function play(name: string): Run {
  const parsed = parseScenario(
    readFileSync(join(__dirname, "..", "..", "scenarios", `${name}.json`), "utf8"),
  );
  if (!parsed.ok) {
    throw new Error(parsed.issues.join("; "));
  }
  const runs: { moments: Moment[]; session: GameSession }[] = [];
  const result = runScenario(parsed.scenario, {
    createSession: () => {
      const session = createScenarioSession();
      const moments: Moment[] = [];
      session.engine.bus.subscribe("chronicle.moment.recorded", (payload) => {
        moments.push(payload as unknown as Moment);
      });
      runs.push({ moments, session });
      return session;
    },
  });
  const first = runs[0] as (typeof runs)[number];
  return { result: formatScenarioResult(result), moments: first.moments, session: first.session };
}

function data(session: GameSession, query: string, args: { [name: string]: JsonValue }) {
  const result = session.query.run(query, args);
  if (!result.ok) {
    throw new Error(`${query} failed`);
  }
  return result.data as never as {
    total?: number;
    moments?: Moment[];
    entries?: Moment[];
  } & Moment[];
}

function checkEveryMomentOnce(run: Run): void {
  const ids = run.moments.map((moment) => moment.momentId);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual([...ids].sort((left, right) => left - right));
  const arrived = run.moments.filter((moment) => moment.kind === "arrived");
  expect(new Set(arrived.map((moment) => moment.entityId)).size).toBe(arrived.length);
  const firstWork = run.moments.filter((moment) => moment.kind === "first_work");
  const keys = firstWork.map((moment) => `${moment.entityId}:${moment.params["skillId"]}`);
  expect(new Set(keys).size).toBe(keys.length);
  const major = new Set([
    "mastery_achieved",
    "became_finest",
    "took_office",
    "died",
    "settlement_milestone",
    "tier_reached",
  ]);
  for (const moment of run.moments) {
    expect(moment.prominence).toBe(major.has(moment.kind) ? "major" : "minor");
  }
}

// Since D-182 the settlement of this scenario no longer starves on its own, so the death that the
// chronicle must keep is brought about here: the last settler is at hunger zero with no health left.
function starveLastSettler(run: Run): void {
  const settlers = run.session.engine.store
    .entities()
    .filter((entity) => entity.components["Needs"] !== undefined);
  const victim = settlers[settlers.length - 1];
  if (victim === undefined) {
    throw new Error("no settler to starve");
  }
  const needs = victim.components["Needs"] as { values: { needId: string; valueMilli: number }[] };
  for (const value of needs.values) {
    if (value.needId === "hunger") {
      value.valueMilli = 0;
    }
  }
  (victim.components["Health"] as { valueMilli: number }).valueMilli = 0;
  run.session.step(1);
}

describe("chronicle scenario (task 4.6, spec 028)", () => {
  const run = play("chronicle");
  starveLastSettler(run);

  it("passes its own assertions", () => {
    expect(run.result).toMatch(/^PASS chronicle/);
  });

  it("records every moment once, with the level of its kind", () => {
    checkEveryMomentOnce(run);
    const kinds = new Set(run.moments.map((moment) => moment.kind));
    for (const kind of [
      "arrived",
      "first_work",
      "took_office",
      "renamed",
      "became_finest",
      "title_earned",
      "settlement_milestone",
      "died",
    ]) {
      expect(kinds.has(kind)).toBe(true);
    }
  });

  it("answers chronicle, journal and moments-since consistently", () => {
    const chronicle = data(run.session, "chronicle", { limit: 100 });
    const major = run.moments.filter((moment) => moment.prominence === "major");
    expect(chronicle.total).toBe(major.length);
    expect(chronicle.moments?.map((moment) => moment.momentId)).toEqual(
      major.map((moment) => moment.momentId).reverse(),
    );
    const journal = data(run.session, "journal", { entityId: 3 });
    expect(journal.entries?.[0]?.kind).toBe("arrived");
    const since = data(run.session, "moments-since", { tick: 0 });
    const ids = since.map((moment) => moment.momentId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(since.some((moment) => moment.kind === "arrived")).toBe(true);
  });

  it("keeps the dead in the chronicle with their last styled name", () => {
    const died = run.moments.filter((moment) => moment.kind === "died");
    expect(died.length).toBeGreaterThan(0);
    const first = died[0] as Moment;
    const filtered = data(run.session, "chronicle", { entityId: first.entityId ?? 0 });
    expect(filtered.moments?.map((moment) => moment.kind)).toContain("died");
    expect(filtered.moments?.[0]?.nameSnapshot).toBe(first.nameSnapshot);
    expect(data(run.session, "journal", { entityId: first.entityId ?? 0 })).toBeNull();
  });

  it(
    "resumes with the same chronicle after a save at any phase",
    () => {
      const parsed = parseScenario(
        readFileSync(join(__dirname, "..", "..", "scenarios", "chronicle.json"), "utf8"),
      );
      if (!parsed.ok) {
        throw new Error("bad scenario");
      }
      const commands = parsed.scenario.steps.filter((step) => step["command"] !== undefined);
      expect(commands.length).toBeGreaterThan(5);
      for (const phase of [700, 2000]) {
        const plain = createScenarioSession();
        const saved = createScenarioSession();
        for (const session of [plain, saved]) {
          session.newGame({ seed: 42, difficulty: "steady", mapSize: 0 });
          for (const step of commands) {
            const command = step["command"];
            if (typeof command === "object" && command !== null && !Array.isArray(command)) {
              session.dispatch({ ...command, kind: String(command["kind"]) });
            }
          }
          session.step(phase);
        }
        const text = saved.save();
        const resumed = createScenarioSession();
        resumed.load(String((text as { data?: JsonValue }).data));
        plain.step(1500);
        resumed.step(1500);
        // the hash also counts the command ids that save and load consumed, so compare the records
        for (const [query, args] of [
          ["moments-since", { tick: 0 }],
          ["chronicle", { limit: 1000 }],
        ] as const) {
          expect(data(resumed, query, args)).toEqual(data(plain, query, args));
        }
      }
    },
    longTimeout,
  );
});

describe("hamlet-to-village chronicle (SC-005)", () => {
  const run = play("hamlet-to-village");

  it(
    "passes, records each moment once and never floods the chronicle with Arrived",
    () => {
      expect(run.result).toMatch(/^PASS hamlet-to-village/);
      checkEveryMomentOnce(run);
      const arrived = run.moments.filter((moment) => moment.kind === "arrived");
      expect(arrived.length).toBeGreaterThanOrEqual(8);
      expect(arrived.every((moment) => moment.prominence === "minor")).toBe(true);
    },
    longTimeout,
  );

  it("keeps the average Major moments per game day at two or fewer (SC-005)", () => {
    const days = Math.max(1, Math.ceil(run.session.engine.time.tickCount / ticksPerDay));
    const major = run.moments.filter((moment) => moment.prominence === "major");
    expect(major.length).toBeLessThanOrEqual(2 * days);
    const perDay = new Map<number, number>();
    for (const moment of major) {
      const day = Math.floor(moment.tick / ticksPerDay);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(8);
  });

  it("records the promotion and its milestones in the chronicle with their text", () => {
    const tier = data(run.session, "chronicle", { kind: "tier_reached" });
    expect(tier.total).toBe(1);
    expect(tier.moments?.[0]).toMatchObject({
      params: { tier: "village", previousTier: "hamlet" },
      text: "The village has grown.",
    });
    const milestones = data(run.session, "chronicle", { kind: "settlement_milestone" });
    expect(milestones.moments?.map((moment) => moment.params["milestone"])).toEqual(
      expect.arrayContaining(["throne-room-established", "first-master-craftsman"]),
    );
    // the milestones of the hamlet days keep saying "hamlet" after the promotion
    expect(
      milestones.moments?.every((moment) =>
        (moment as never as { text: string }).text.startsWith("The hamlet "),
      ),
    ).toBe(true);
  });

  it("gives every citizen who moved into an upgraded home a HomeImproved entry", () => {
    const improved = run.moments.filter((moment) => moment.kind === "home_improved");
    for (const moment of improved) {
      expect(moment.params["dwellingLevel"]).toBeTypeOf("string");
      expect(moment.prominence).toBe("minor");
    }
  });
});
