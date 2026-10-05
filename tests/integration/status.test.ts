import { describe, expect, it } from "vitest";
import { loadContent } from "../../src/game/content/ContentLoader";
import { GameEngine } from "../../src/game/engine/GameEngine";
import { MapSize } from "../../src/game/map/mapSize";
import { evaluateSubject } from "../../src/game/status/explain";
import { buildFlowRow, buildFlowRows } from "../../src/game/status/flow/flowSummary";
import { buildIdleBlockedView } from "../../src/game/status/idleBlocked";
import { listSubjects } from "../../src/game/status/statusEvaluation";
import { getStatusService } from "../../src/game/status/statusServiceRegistry";
import {
  BlockedReasonKind,
  StatusState,
  StatusSubjectKind,
} from "../../src/game/status/statusTypes";
import { createStatusWorld } from "../../src/game/status/testStatusWorld";
import type { StatusTestWorld } from "../../src/game/status/testStatusWorld";

// Plan 3.6 acceptance (spec 025): in any state of a running game every non-working citizen has a
// primary reason, and the flow ledger agrees with the inventories.

const twoDays = 576;

type Violation = { tick: number; subject: string; problem: string };

function check(engine: GameEngine, violations: Violation[]): number {
  let checked = 0;
  for (const ref of listSubjects(engine)) {
    const status = evaluateSubject(engine, ref);
    const name = `${ref.kind}#${ref.id}`;
    const tick = engine.time.tickCount;
    if (status === null) {
      violations.push({ tick, subject: name, problem: "listed but not evaluable" });
      continue;
    }
    checked += 1;
    if (status.state === StatusState.Active) {
      if (status.reasons.length > 0) {
        violations.push({ tick, subject: name, problem: "Active with reasons" });
      }
      if (ref.kind === StatusSubjectKind.Citizen && status.activity === null) {
        violations.push({ tick, subject: name, problem: "Active citizen without activity" });
      }
    } else if (status.reasons.length === 0) {
      violations.push({ tick, subject: name, problem: "non-Active without a reason" });
    } else if (status.reasons.some((reason) => reason.kind === BlockedReasonKind.Unexplained)) {
      violations.push({ tick, subject: name, problem: "Unexplained" });
    }
  }
  return checked;
}

function soak(engine: GameEngine, ticks: number, violations: Violation[]): number {
  let checked = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    engine.runTicks(1);
    if (engine.time.tickCount % 12 === 0) {
      checked += check(engine, violations);
    }
  }
  return checked;
}

describe("invariant: every non-working citizen has a primary reason", () => {
  it("holds every 12th tick of a two-day seed-42 game", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 42, mapSize: MapSize.Small });
    const violations: Violation[] = [];
    const checked = soak(engine, twoDays, violations);
    expect(violations).toEqual([]);
    expect(checked).toBeGreaterThan(48 * 6);
    const citizens = listSubjects(engine).filter((ref) => ref.kind === StatusSubjectKind.Citizen);
    expect(citizens).toHaveLength(6);
  });

  it("holds in a busy colony: bakery orders, construction, hauling and gathering", () => {
    const world = bakeryColony();
    const violations: Violation[] = [];
    const checked = soak(world.engine, twoDays, violations);
    expect(violations).toEqual([]);
    const kinds = new Set(listSubjects(world.engine).map((ref) => ref.kind));
    expect(kinds.has(StatusSubjectKind.Workstation)).toBe(true);
    expect(kinds.has(StatusSubjectKind.Zone)).toBe(true);
    expect(checked).toBeGreaterThan(48 * 5);
  });

  it("keeps the Idle & Blocked list free of unexplained rows", () => {
    const world = bakeryColony();
    world.run(300);
    const rows = buildIdleBlockedView(world.engine, { includeUnsettled: true });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.reasons[0]?.kind).not.toBe(BlockedReasonKind.Unexplained);
    }
  });
});

function bakeryColony(): StatusTestWorld {
  const world = createStatusWorld();
  world.chest(90);
  world.give(world.chest(91), "wheat", 8);
  const { oven } = world.bakery();
  const mill = world.station("grinding_mill", 66);
  world.settler(77);
  world.settler(78);
  world.settler(79);
  world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 4 });
  world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 4 });
  world.place("wall", 16);
  world.give(world.chest(92), "stone_block", 2);
  world.postFell(59);
  return world;
}

describe("flow ledger conservation", () => {
  it("produced - consumed equals the change of the world's stock for every material in the ledger", () => {
    const world = createStatusWorld();
    const { oven } = world.bakery();
    world.chest(90);
    world.give(world.chest(91), "wheat", 8);
    const mill = world.station("grinding_mill", 66);
    world.settler(77);
    world.settler(78);
    world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 4 });
    world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 4 });
    const tracked = ["wheat", "flour", "bread", "oak_log", "oak_plank", "stone_block"];
    const start = new Map(tracked.map((id) => [id, world.count(id)]));
    world.run(600);
    const rows = buildFlowRows(world.engine);
    expect(rows.map((row) => row.materialId)).toEqual(
      expect.arrayContaining(["wheat", "flour", "bread"]),
    );
    for (const row of rows) {
      const delta = world.count(row.materialId) - (start.get(row.materialId) ?? 0);
      expect(delta, row.materialId).toBe(row.windowProduced - row.windowConsumed);
    }
    const bread = buildFlowRow(world.engine, "bread");
    expect(bread?.windowProduced).toBe(8);
    expect(buildFlowRow(world.engine, "wheat")?.windowConsumed).toBe(8);
    expect(buildFlowRow(world.engine, "flour")).toMatchObject({ windowProduced: 4 });
  });
});

describe("determinism and save/load of the status state", () => {
  it("two runs of seed 42 end with identical settle records and ledgers", () => {
    const left = new GameEngine(loadContent(), { entropy: () => 1 });
    const right = new GameEngine(loadContent(), { entropy: () => 1 });
    left.newGame({ seed: 42, mapSize: MapSize.Small });
    right.newGame({ seed: 42, mapSize: MapSize.Small });
    left.runTicks(300);
    right.runTicks(300);
    expect(getStatusService(left).tracker.records()).toEqual(
      getStatusService(right).tracker.records(),
    );
    expect(getStatusService(left).ledger.dayList()).toEqual(
      getStatusService(right).ledger.dayList(),
    );
    expect(left.getStateHash()).toBe(right.getStateHash());
  });

  it("a save in the middle gives the same end state, statuses and ledger as running on", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 42, mapSize: MapSize.Small });
    engine.runTicks(200);
    const text = engine.saveGame();
    engine.runTicks(200);
    const direct = engine.getStateHash();
    const records = getStatusService(engine).tracker.records();
    const ledger = getStatusService(engine).ledger.dayList();
    engine.loadGame(text);
    engine.runTicks(200);
    expect(engine.getStateHash()).toBe(direct);
    expect(getStatusService(engine).tracker.records()).toEqual(records);
    expect(getStatusService(engine).ledger.dayList()).toEqual(ledger);
  });
});
