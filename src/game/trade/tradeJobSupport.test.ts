import { describe, expect, it } from "vitest";
import { activePostingsOfType } from "../jobs/jobBoards";
import { postJob } from "../jobs/jobPostings";
import { PostingStatus } from "../jobs/jobTypes";
import { ReservationKind, haulJobId } from "../storage/storageTypes";
import { createTradeWorld } from "./testTradeWorld";
import {
  handInCoins,
  orderOfJob,
  placeOf,
  postDeliveryHaul,
  traderOfJob,
  walkTo,
} from "./tradeJobSupport";
import { createTradeOrder } from "./tradeOrders";
import { getTradeService } from "./tradeServiceRegistry";
import { OrderDirection, TraderPhase, tradeSellJobId } from "./tradeTypes";
import { traderComponent } from "./traderComponent";
import { treasuryBalance } from "./treasury";
import { getComponent } from "../ecs/Entity";
import { TaskStatus } from "../task/taskTypes";
import type { TaskContext } from "../task/taskTypes";
import type { ActiveJob } from "../jobs/jobExecutor";

function jobFor(world: ReturnType<typeof createTradeWorld>, traderId: number): ActiveJob {
  const posting = postJob(
    world.engine,
    world.boardId,
    {
      jobTypeId: tradeSellJobId,
      target: { mapId: world.mapId, cellIndex: 1, entityId: traderId, materialId: "iron_ore" },
    },
    0,
  );
  return { posting, jobType: world.engine.content.jobs.require(tradeSellJobId) };
}

describe("orderOfJob and traderOfJob", () => {
  it("finds the open order of a posting and the trader that is present", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    const order = createTradeOrder(world.engine, trader.id, OrderDirection.Sell, "iron_ore", 2, 0);
    const job = jobFor(world, trader.id);
    expect(orderOfJob(world.engine, job)).toBeNull();
    getTradeService(world.engine).putOrder({ ...order, postingId: job.posting.id });
    expect(orderOfJob(world.engine, job)?.orderId).toBe(order.orderId);
    expect(traderOfJob(world.engine, job)?.id).toBe(trader.id);
    const data = getComponent(trader, traderComponent);
    if (data !== undefined) {
      data.phase = TraderPhase.Leaving;
    }
    expect(traderOfJob(world.engine, job)).toBeNull();
    expect(
      traderOfJob(world.engine, {
        ...job,
        posting: { ...job.posting, target: { ...job.posting.target, entityId: null } },
      }),
    ).toBeNull();
  });
});

describe("placeOf", () => {
  it("reads the position of an entity", () => {
    const world = createTradeWorld();
    expect(placeOf(world.settler(5))).toEqual({ mapId: world.mapId, cellIndex: 5 });
    expect(placeOf(world.engine.store.require(world.boardId))).not.toBeNull();
    expect(placeOf({ id: 1, prototype: "x", components: {} })).toBeNull();
  });
});

describe("walkTo", () => {
  it("stores the phase and waits for a move child", () => {
    const world = createTradeWorld();
    const settler = world.settler(2);
    const spawned: string[] = [];
    const context: TaskContext = {
      entityId: settler.id,
      entity: settler,
      tick: 0,
      task: {
        id: 1,
        type: tradeSellJobId,
        priority: 50,
        status: TaskStatus.Running,
        phase: "",
        data: null,
        parentId: null,
        waitFor: null,
        wake: null,
        createdTick: 0,
        token: null,
      },
      store: world.engine.store,
      bus: world.engine.bus,
      spawnChild: (type) => {
        spawned.push(type);
        return 9;
      },
    };
    const step = walkTo(context, "to-trader", 1, 4);
    expect(context.task.phase).toBe("to-trader");
    expect(spawned).toEqual(["move"]);
    expect(step.kind).toBe("wait");
  });
});

describe("postDeliveryHaul", () => {
  it("posts one haul job for goods a worker carries, not twice, not for nothing", () => {
    const world = createTradeWorld();
    const worker = world.settler(5);
    postDeliveryHaul(world.engine, worker, "nails", 3);
    expect(activePostingsOfType(world.engine, haulJobId)).toHaveLength(0);
    world.give(worker, "nails", 4);
    postDeliveryHaul(world.engine, worker, "nails", 3);
    postDeliveryHaul(world.engine, worker, "nails", 4);
    const hauls = activePostingsOfType(world.engine, haulJobId);
    expect(hauls).toHaveLength(1);
    expect(hauls[0]).toMatchObject({
      status: PostingStatus.Open,
      target: { entityId: worker.id, materialId: "nails" },
    });
    expect(ReservationKind.Haul).toBe("haul");
  });
});

describe("handInCoins", () => {
  it("brings back at most what the worker carries", () => {
    const world = createTradeWorld();
    const worker = world.settler(5);
    world.give(worker, "silver_penny", 6);
    const start = treasuryBalance(world.engine);
    expect(handInCoins(world.engine, worker, 4)).toBe(4);
    expect(handInCoins(world.engine, worker, 9)).toBe(2);
    expect(handInCoins(world.engine, worker, 3)).toBe(0);
    expect(treasuryBalance(world.engine)).toBe(start + 6);
  });
});
