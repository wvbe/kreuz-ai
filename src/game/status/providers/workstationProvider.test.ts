import { describe, expect, it } from "vitest";
import { noAiOverride } from "../../jobs/testJobWorld";
import { createStatusContext } from "../statusContext";
import { evaluateSubject, explain } from "../explain";
import {
  ActivityKind,
  BlockedReasonKind,
  ChainEnd,
  StatusState,
  StatusSubjectKind,
} from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import { workstationProvider } from "./workstationProvider";

const station = (id: number) => ({ kind: StatusSubjectKind.Workstation, id });

describe("workstationProvider", () => {
  it("lists the workstations and returns null for other entities", () => {
    const world = createStatusWorld();
    const oven = world.station("oven", 22);
    const chest = world.chest(40);
    expect(workstationProvider.subjects(world.engine)).toEqual([station(oven.id)]);
    expect(
      workstationProvider.evaluate(
        world.engine,
        station(chest.id),
        createStatusContext(world.engine),
      ),
    ).toBeNull();
  });

  it("is Idle with NoOrders without an active order", () => {
    const world = createStatusWorld();
    const oven = world.station("oven", 22);
    const status = evaluateSubject(world.engine, station(oven.id));
    expect(status?.state).toBe(StatusState.Idle);
    expect(status?.reasons.map((reason) => reason.kind)).toEqual([BlockedReasonKind.NoOrders]);
  });

  it("is Blocked with MissingInput and follows the producer chain to the mill", () => {
    const world = createStatusWorld();
    const { oven } = world.bakery();
    const mill = world.station("grinding_mill", 33);
    world.spawn("peasant", 55, noAiOverride);
    world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    expect(evaluateSubject(world.engine, station(oven.id))?.reasons[0]).toEqual({
      kind: BlockedReasonKind.MissingInput,
      params: { materialId: "flour", required: 1, available: 0, noProducer: true },
      causeRef: null,
    });
    world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 1 });
    const explanation = explain(world.engine, station(oven.id));
    expect(explanation?.reasons[0]?.causeRef).toEqual(station(mill.id));
    expect(explanation?.chain.map((link) => link.subject)).toEqual([
      station(oven.id),
      station(mill.id),
    ]);
    expect(explanation?.chain[1]?.reason).toMatchObject({
      kind: BlockedReasonKind.MissingInput,
      params: { materialId: "wheat", noProducer: true },
    });
    expect(explanation?.end).toBe(ChainEnd.Complete);
  });

  it("explains an oven outside a bakery with the zone as cause: MissingRoom, then the zone's unmet requirements", () => {
    const world = createStatusWorld();
    world.spawn("peasant", 55, noAiOverride);
    const cells = world.rect(2, 2, 2, 2);
    const oven = world.station("oven", cells[0] ?? 0);
    const [zoneId] = world.designate("bakery", cells);
    world.run(2);
    world.give(oven, "flour", 1);
    world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    const explanation = explain(world.engine, station(oven.id));
    expect(explanation?.reasons[0]).toEqual({
      kind: BlockedReasonKind.MissingRoom,
      params: { zoneTypeId: "bakery" },
      causeRef: { kind: StatusSubjectKind.Zone, id: zoneId ?? 0 },
    });
    expect(explanation?.chain[1]).toMatchObject({
      subject: { kind: StatusSubjectKind.Zone, id: zoneId ?? 0 },
      state: StatusState.Blocked,
    });
    expect(explanation?.chain[1]?.reason?.kind).toBe(BlockedReasonKind.ZoneRequirementsUnmet);
  });

  it("is Blocked with AwaitingWorker while its craft job waits on the board", () => {
    const world = createStatusWorld();
    const { oven } = world.bakery();
    world.spawn("peasant", 55, noAiOverride);
    world.give(oven, "flour", 1);
    world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    world.run(6);
    const status = evaluateSubject(world.engine, station(oven.id));
    expect(status?.state).toBe(StatusState.Blocked);
    const reason = status?.reasons[0];
    expect(reason?.kind).toBe(BlockedReasonKind.AwaitingWorker);
    expect(reason?.causeRef?.kind).toBe(StatusSubjectKind.JobPosting);
    const explanation = explain(world.engine, station(oven.id));
    expect(explanation?.chain).toHaveLength(2);
    expect(explanation?.chain[1]?.reason?.kind).toBe(BlockedReasonKind.AwaitingWorker);
  });

  it("is Active and shows the crafter while it crafts", () => {
    const world = createStatusWorld();
    const { oven } = world.bakery();
    world.give(oven, "flour", 1);
    const orderId = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    world.data(oven).craft = {
      orderId,
      crafterId: 77,
      postingId: 1,
      recipeId: "bake_bread",
      startedTick: 0,
      durationTicks: 20,
      reservationIds: [],
    };
    const status = evaluateSubject(world.engine, station(oven.id));
    expect(status?.state).toBe(StatusState.Active);
    expect(status?.activity).toEqual({
      kind: ActivityKind.Crafting,
      params: { recipeId: "bake_bread", crafterId: 77 },
    });
  });
});
