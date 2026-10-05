import { describe, expect, it } from "vitest";
import { ticksPerDay } from "../../time/GameTime";
import { getStatusService } from "../statusServiceRegistry";
import { FlowDirection, FlowSource, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import { recordFlow } from "./recordFlow";

describe("recordFlow", () => {
  it("counts units on the day of the current tick", () => {
    const world = createStatusWorld();
    const entry = {
      materialId: "bread",
      direction: FlowDirection.Produced,
      source: FlowSource.Trade,
      subject: { kind: StatusSubjectKind.Citizen, id: 3 },
      quantity: 2,
    };
    recordFlow(world.engine, entry);
    world.run(ticksPerDay);
    recordFlow(world.engine, { ...entry, quantity: 5 });
    const days = getStatusService(world.engine).ledger.dayList();
    expect(days.map((day) => [day.day, day.entries[0]?.quantity])).toEqual([
      [0, 2],
      [1, 5],
    ]);
  });
});
