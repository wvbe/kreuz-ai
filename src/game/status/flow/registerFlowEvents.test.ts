import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../engine/EventBus";
import { ticksPerDay } from "../../time/GameTime";
import { getStatusService } from "../statusServiceRegistry";
import { FlowDirection, FlowSource, StatusSubjectKind } from "../statusTypes";
import type { FlowEntry } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import type { StatusTestWorld } from "../testStatusWorld";

function entries(world: StatusTestWorld): FlowEntry[] {
  return getStatusService(world.engine)
    .ledger.dayList()
    .flatMap((day) => day.entries);
}

function emit(world: StatusTestWorld, name: string, payload: JsonValue): void {
  world.engine.bus.emit(name, payload);
  world.engine.bus.processQueue();
}

describe("registerFlowEvents", () => {
  it("counts a finished craft: inputs consumed and outputs produced, attributed to the workstation (Recipe)", () => {
    const world = createStatusWorld();
    emit(world, "production.crafting.completed", {
      workstationId: 12,
      crafterId: 3,
      recipeId: "bake_bread",
      inputs: [{ materialId: "flour", quantity: 1 }],
      outputs: [{ materialId: "bread", quantity: 3 }],
    });
    const subject = { kind: StatusSubjectKind.Workstation, id: 12 };
    expect(entries(world)).toEqual([
      {
        materialId: "bread",
        direction: FlowDirection.Produced,
        source: FlowSource.Recipe,
        subject,
        quantity: 3,
      },
      {
        materialId: "flour",
        direction: FlowDirection.Consumed,
        source: FlowSource.Recipe,
        subject,
        quantity: 1,
      },
    ]);
  });

  it("counts construction consumption and deconstruction yield", () => {
    const world = createStatusWorld();
    emit(world, "construction.job.completed", {
      jobId: 20,
      kind: "Construction",
      consumed: [{ materialId: "stone_block", quantity: 4 }],
      yield: [],
    });
    emit(world, "construction.job.completed", {
      jobId: 21,
      kind: "Deconstruction",
      consumed: [],
      yield: [{ materialId: "oak_plank", quantity: 1 }],
    });
    expect(
      entries(world).map((entry) => [entry.materialId, entry.direction, entry.source]),
    ).toEqual([
      ["oak_plank", FlowDirection.Produced, FlowSource.Deconstruction],
      ["stone_block", FlowDirection.Consumed, FlowSource.Construction],
    ]);
  });

  it("counts gathering outputs of a completed job against the worker, but not what a hauler moved", () => {
    const world = createStatusWorld();
    emit(world, "jobboard.job.completed", {
      workerId: 8,
      jobTypeId: "fell.trees",
      outputs: [{ materialId: "oak_log", quantity: 3 }],
    });
    emit(world, "jobboard.job.completed", {
      workerId: 9,
      jobTypeId: "haul.deliver",
      outputs: [{ materialId: "oak_log", quantity: 3 }],
    });
    expect(entries(world)).toEqual([
      {
        materialId: "oak_log",
        direction: FlowDirection.Produced,
        source: FlowSource.Gathering,
        subject: { kind: StatusSubjectKind.Citizen, id: 8 },
        quantity: 3,
      },
    ]);
  });

  it("counts need consumption, spoilage and household consumption", () => {
    const world = createStatusWorld();
    const settler = world.settler(11);
    emit(world, "need.item.consumed", {
      entityId: settler.id,
      needId: "hunger",
      materialId: "bread",
      quantity: 1,
    });
    emit(world, "inventory.item.expired", {
      entityId: settler.id,
      materialId: "bread",
      quantity: 2,
    });
    emit(world, "inventory.item.expired", { entityId: 9999, materialId: "cheese", quantity: 5 });
    emit(world, "housing.goods.consumed", { dwellingId: 40, materialId: "bread", quantity: 4 });
    const found = entries(world).map((entry) => [
      entry.materialId,
      entry.source,
      entry.subject === null ? null : entry.subject.kind,
      entry.quantity,
    ]);
    expect(found).toContainEqual([
      "bread",
      FlowSource.NeedConsumption,
      StatusSubjectKind.Citizen,
      1,
    ]);
    expect(found).toContainEqual(["bread", FlowSource.Spoilage, StatusSubjectKind.Citizen, 2]);
    expect(found).toContainEqual(["cheese", FlowSource.Spoilage, null, 5]);
    expect(found).toContainEqual([
      "bread",
      FlowSource.HouseholdConsumption,
      StatusSubjectKind.Dwelling,
      4,
    ]);
    expect(entries(world).every((entry) => entry.direction === FlowDirection.Consumed)).toBe(true);
  });

  it("ignores payloads of the wrong shape", () => {
    const world = createStatusWorld();
    emit(world, "production.crafting.completed", { workstationId: "x" });
    emit(world, "need.item.consumed", { entityId: 1 });
    expect(entries(world)).toEqual([]);
  });

  it("rolls over at tick-of-day 0: the day of the tick being processed", () => {
    const world = createStatusWorld();
    const consumed = { entityId: 3, needId: "hunger", materialId: "bread", quantity: 1 };
    world.run(ticksPerDay - 1);
    emit(world, "need.item.consumed", consumed);
    world.run(1);
    emit(world, "need.item.consumed", consumed);
    const days = getStatusService(world.engine).ledger.dayList();
    expect(days.map((day) => day.day)).toEqual([0, 1]);
  });
});
