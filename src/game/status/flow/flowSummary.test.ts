import { describe, expect, it } from "vitest";
import { ticksPerDay } from "../../time/GameTime";
import { getStatusService } from "../statusServiceRegistry";
import { FlowDirection, FlowSource, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import type { StatusTestWorld } from "../testStatusWorld";
import { buildFlowRow, buildFlowRows } from "./flowSummary";

const oven = { kind: StatusSubjectKind.Workstation, id: 12 };
const eater = { kind: StatusSubjectKind.Citizen, id: 3 };

function add(
  world: StatusTestWorld,
  day: number,
  materialId: string,
  direction: FlowDirection,
  source: FlowSource,
  quantity: number,
  subject = oven,
): void {
  getStatusService(world.engine).ledger.record(day, {
    materialId,
    direction,
    source,
    subject,
    quantity,
  });
}

function breadWorld(): StatusTestWorld {
  const world = createStatusWorld();
  world.run(ticksPerDay * 3 + 10);
  for (let day = 0; day <= 2; day += 1) {
    add(world, day, "bread", FlowDirection.Produced, FlowSource.Recipe, 6);
    add(world, day, "bread", FlowDirection.Consumed, FlowSource.NeedConsumption, 8, eater);
  }
  add(world, 3, "bread", FlowDirection.Produced, FlowSource.Recipe, 1);
  world.give(world.chest(55), "bread", 10);
  return world;
}

describe("buildFlowRow", () => {
  // @covers 025:FR-013
  it("averages the complete days: produced 6, consumed 8, net -2, stock 10, 5 days of supply", () => {
    const world = breadWorld();
    const row = buildFlowRow(world.engine, "bread");
    expect(row).toMatchObject({
      materialId: "bread",
      producedPerDayMilli: 6000,
      consumedPerDayMilli: 8000,
      netPerDayMilli: -2000,
      stock: 10,
      daysOfSupplyMilli: 5000,
      windowProduced: 19,
      windowConsumed: 24,
    });
    expect(row?.trend).toEqual([-2, -2, -2, 1]);
  });

  it("lists producers and consumers with their source, largest first", () => {
    const world = breadWorld();
    const row = buildFlowRow(world.engine, "bread");
    expect(row?.producers).toEqual([{ subject: oven, source: FlowSource.Recipe, quantity: 19 }]);
    expect(row?.consumers).toEqual([
      { subject: eater, source: FlowSource.NeedConsumption, quantity: 24 },
    ]);
  });

  // @covers 025:FR-013
  it("has no days of supply for a surplus and uses the current day while none is complete", () => {
    const world = createStatusWorld();
    add(world, 0, "flour", FlowDirection.Produced, FlowSource.Recipe, 4);
    const row = buildFlowRow(world.engine, "flour");
    expect(row).toMatchObject({
      producedPerDayMilli: 4000,
      consumedPerDayMilli: 0,
      netPerDayMilli: 4000,
      daysOfSupplyMilli: null,
      stock: 0,
    });
    expect(row?.trend).toEqual([4]);
  });

  it("returns null when the ledger has nothing for the material", () => {
    const world = createStatusWorld();
    expect(buildFlowRow(world.engine, "bread")).toBeNull();
  });

  it("only looks at the last ledgerWindowDays complete days", () => {
    const world = createStatusWorld();
    world.run(ticksPerDay * 10);
    add(world, 1, "bread", FlowDirection.Produced, FlowSource.Recipe, 700);
    add(world, 9, "bread", FlowDirection.Produced, FlowSource.Recipe, 7);
    const row = buildFlowRow(world.engine, "bread");
    expect(row?.producedPerDayMilli).toBe(1000);
    expect(row?.trend).toHaveLength(8);
  });
});

describe("buildFlowRows", () => {
  it("sorts the largest deficit first, then by material id", () => {
    const world = breadWorld();
    add(world, 0, "flour", FlowDirection.Produced, FlowSource.Recipe, 3);
    add(world, 1, "apple", FlowDirection.Produced, FlowSource.Recipe, 3);
    add(world, 1, "wheat", FlowDirection.Consumed, FlowSource.Recipe, 9);
    expect(buildFlowRows(world.engine).map((row) => row.materialId)).toEqual([
      "wheat",
      "bread",
      "apple",
      "flour",
    ]);
  });

  it("is empty without ledger entries", () => {
    expect(buildFlowRows(createStatusWorld().engine)).toEqual([]);
  });
});
