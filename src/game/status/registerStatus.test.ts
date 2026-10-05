import { describe, expect, it } from "vitest";
import { ticksPerDay } from "../time/GameTime";
import { makeReason } from "./reasons";
import { registerStatus } from "./registerStatus";
import { getStatusService } from "./statusServiceRegistry";
import {
  BlockedReasonKind,
  FlowDirection,
  FlowSource,
  ledgerWindowDays,
  statusGraceTicks,
  StatusState,
  StatusSubjectKind,
} from "./statusTypes";
import type { SubjectStatus } from "./statusTypes";
import { createStatusWorld } from "./testStatusWorld";
import type { StatusTestWorld } from "./testStatusWorld";

const stalled: SubjectStatus = {
  state: StatusState.Blocked,
  activity: null,
  reasons: [makeReason(BlockedReasonKind.MissingInput, { materialId: "flour" })],
};

function query(
  world: StatusTestWorld,
  name: string,
  args: { [field: string]: string | number | boolean },
) {
  const registration = world.engine.getQuery(name);
  if (registration === undefined) {
    throw new Error(`no query ${name}`);
  }
  return registration.run(args, world.engine);
}

describe("registerStatus", () => {
  it("is idempotent and the engine already did it", () => {
    const world = createStatusWorld();
    expect(registerStatus(world.engine)).toBe(getStatusService(world.engine));
  });

  it("registers the providers of every subject kind that exists in 3.x", () => {
    const world = createStatusWorld();
    const kinds = getStatusService(world.engine)
      .providers()
      .map((provider) => provider.kind);
    expect(kinds).toEqual([
      StatusSubjectKind.Citizen,
      StatusSubjectKind.Workstation,
      StatusSubjectKind.ProductionOrder,
      StatusSubjectKind.ConstructionSite,
      StatusSubjectKind.Zone,
      StatusSubjectKind.JobBoard,
      StatusSubjectKind.JobPosting,
      StatusSubjectKind.LoosePile,
      StatusSubjectKind.StandingOrder,
    ]);
  });

  it("answers the explain query by subject kind or by entity id, and null for the unknown", () => {
    const world = createStatusWorld();
    const settler = world.spawn("peasant", 55, { AiState: { treeId: null } });
    const byEntity = query(world, "explain", { id: settler.id });
    expect(byEntity).toMatchObject({
      subject: { kind: StatusSubjectKind.Citizen, id: settler.id },
      state: StatusState.Idle,
    });
    expect(query(world, "explain", { id: settler.id, kind: StatusSubjectKind.Citizen })).toEqual(
      byEntity,
    );
    expect(query(world, "explain", { id: 999 })).toBeNull();
    expect(query(world, "explain", { id: 999, kind: StatusSubjectKind.JobPosting })).toBeNull();
  });

  it("answers idle-blocked with filters, and flow and flow-of from the ledger", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, stalled);
    world.run(statusGraceTicks + 2);
    expect(query(world, "idle-blocked", {})).toHaveLength(1);
    expect(query(world, "idle-blocked", { kind: StatusSubjectKind.Citizen })).toEqual([]);
    expect(query(world, "flow", {})).toEqual([]);
    expect(query(world, "flow-of", { materialId: "bread" })).toBeNull();
    getStatusService(world.engine).ledger.record(0, {
      materialId: "bread",
      direction: FlowDirection.Produced,
      source: FlowSource.Recipe,
      subject: null,
      quantity: 2,
    });
    expect(query(world, "flow", {})).toHaveLength(1);
    expect(query(world, "flow-of", { materialId: "bread" })).toMatchObject({
      materialId: "bread",
      windowProduced: 2,
    });
  });

  it("drops ledger days that left the window at slot 19", () => {
    const world = createStatusWorld();
    getStatusService(world.engine).ledger.record(0, {
      materialId: "bread",
      direction: FlowDirection.Produced,
      source: FlowSource.Recipe,
      subject: null,
      quantity: 1,
    });
    world.run(ticksPerDay * ledgerWindowDays);
    expect(getStatusService(world.engine).ledger.dayList()).toHaveLength(1);
    world.run(ticksPerDay);
    expect(getStatusService(world.engine).ledger.dayList()).toHaveLength(0);
  });

  it("saves and loads the settle state and the ledger: same hash, no spurious events", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, stalled);
    world.run(statusGraceTicks + 4);
    const service = getStatusService(world.engine);
    service.ledger.record(0, {
      materialId: "bread",
      direction: FlowDirection.Consumed,
      source: FlowSource.NeedConsumption,
      subject: null,
      quantity: 3,
    });
    const before = world.engine.getStateHash();
    const records = service.tracker.records();
    const text = world.engine.saveGame();
    expect(text).toContain('"productionLedger"');
    expect(text).toContain('"statuses"');
    world.run(7);
    world.engine.loadGame(text);
    expect(world.engine.getStateHash()).toBe(before);
    expect(service.tracker.records()).toEqual(records);
    const seen = world.statusEvents.length;
    world.run(5);
    expect(world.statusEvents.length).toBe(seen);
  });

  it("purges records of subjects that no longer exist when a game is loaded", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, stalled);
    world.run(statusGraceTicks + 2);
    const text = world.engine.saveGame();
    world.removeSynthetic(1);
    world.engine.loadGame(text);
    expect(
      getStatusService(world.engine)
        .tracker.records()
        .filter((record) => record.subject.kind === StatusSubjectKind.StandingOrder),
    ).toEqual([]);
    const seen = world.statusEvents.length;
    world.run(2);
    expect(world.statusEvents.length).toBe(seen);
  });
});
