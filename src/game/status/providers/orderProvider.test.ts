import { describe, expect, it } from "vitest";
import { noAiOverride } from "../../jobs/testJobWorld";
import { createStatusContext } from "../statusContext";
import { evaluateSubject } from "../explain";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import { orderProvider } from "./orderProvider";

const order = (id: number) => ({ kind: StatusSubjectKind.ProductionOrder, id });

describe("orderProvider", () => {
  it("lists unfinished orders and drops cancelled ones", () => {
    const world = createStatusWorld();
    const oven = world.station("oven", 22);
    const first = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    const second = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 2 });
    expect(orderProvider.subjects(world.engine)).toEqual([order(first), order(second)]);
    world.command("CancelProductionOrder", { orderId: first });
    expect(orderProvider.subjects(world.engine)).toEqual([order(second)]);
    expect(
      orderProvider.evaluate(world.engine, order(first), createStatusContext(world.engine)),
    ).toBeNull();
  });

  it("is Blocked with the missing input, naming the material and the amounts", () => {
    const world = createStatusWorld();
    const { oven } = world.bakery();
    world.spawn("peasant", 55, noAiOverride);
    const id = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    const status = evaluateSubject(world.engine, order(id));
    expect(status?.state).toBe(StatusState.Blocked);
    expect(status?.reasons[0]).toEqual({
      kind: BlockedReasonKind.MissingInput,
      params: { materialId: "flour", required: 1, available: 0, noProducer: true },
      causeRef: null,
    });
  });

  it("reports a paused order as Paused and an order that can start as Active", () => {
    const world = createStatusWorld();
    const { oven } = world.bakery();
    world.spawn("peasant", 55, noAiOverride);
    world.give(oven, "flour", 1);
    const id = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    expect(evaluateSubject(world.engine, order(id))?.state).toBe(StatusState.Active);
    world.command("SetProductionOrderPaused", { orderId: id, paused: true });
    expect(evaluateSubject(world.engine, order(id))?.reasons[0]?.kind).toBe(
      BlockedReasonKind.Paused,
    );
  });

  it("reports AwaitingWorker once the craft job is posted and unclaimed", () => {
    const world = createStatusWorld();
    const { oven } = world.bakery();
    world.spawn("peasant", 55, noAiOverride);
    world.give(oven, "flour", 1);
    const id = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    world.run(6);
    expect(evaluateSubject(world.engine, order(id))?.reasons[0]?.kind).toBe(
      BlockedReasonKind.AwaitingWorker,
    );
  });
});
