import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { townCrierComponent } from "../crier/townCrierComponent";
import { JobBoardMode } from "../jobs/jobTypes";
import { getBoard } from "../jobs/jobBoards";
import { findOrder } from "../production/productionQueries";
import { OrderStatus } from "../production/productionTypes";
import { runStewardReview } from "./runStewardReview";
import { createStandingWorld } from "./testStandingWorld";

describe("createStandingWorld", () => {
  it("makes the board user-managed, appoints criers and the Steward", () => {
    const world = createStandingWorld();
    expect(getBoard(world.engine, world.boardId)?.data.mode).toBe(JobBoardMode.SystemManaged);
    expect(world.userBoard()).toBe(world.boardId);
    expect(getBoard(world.engine, world.boardId)?.data.mode).toBe(JobBoardMode.UserManaged);
    const crier = world.crier(11);
    expect(getComponent(crier, townCrierComponent)).toBeDefined();
    const steward = world.steward(12);
    expect(world.state().stewardEntityId).toBe(steward.id);
  });

  it("creates orders and reads them back, with a zone helper and stock counting", () => {
    const world = createStandingWorld();
    const id = world.standing({ targetQuantity: 8 });
    expect(world.orderOf(id).targetQuantity).toBe(8);
    expect(() => world.orderOf(99)).toThrow(/no standing order/);
    expect(world.zone("stockpile", [30])).toBeGreaterThan(0);
    world.give(world.chest(40), "oak_plank", 3);
    expect(world.stock("oak_plank")).toBe(3);
  });

  it("runs to the review tick, claims and finishes runs", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.userBoard();
    world.throneRoom(5, 5);
    world.steward(2);
    world.spawn("sawmill", 30);
    world.crier(1);
    world.standing();
    world.runToReview();
    expect(world.engine.time.tickCount).toBe(72);
    runStewardReview(world.engine, 73);
    world.run(150);
    const run = world.state().runs[0];
    const orderId = run?.productionOrderId ?? 0;
    world.claim(run?.runId ?? 0);
    expect(findOrder(world.engine, orderId)?.data.craft?.orderId).toBe(orderId);
    world.finish(run?.runId ?? 0);
    expect(findOrder(world.engine, orderId)?.order.status).toBe(OrderStatus.Completed);
    expect(() => world.claim(9999)).toThrow(/no production order/);
  });
});
