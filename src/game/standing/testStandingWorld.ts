import { createHousingWorld } from "../housing/testHousingWorld";
import type { HousingTestWorld } from "../housing/testHousingWorld";
import type { Entity, EntityId } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { findOrder } from "../production/productionQueries";
import type { OrderLocation } from "../production/productionQueries";
import { OrderStatus } from "../production/productionTypes";
import { getTotal } from "../inventory/inventoryQueries";
import { getBoard } from "../jobs/jobBoards";
import { JobBoardMode } from "../jobs/jobTypes";
import type { JobTestWorldOptions } from "../jobs/testJobWorld";
import { ticksPerDay } from "../time/GameTime";
import { getStandingService } from "./standingServiceRegistry";
import type { StandingOrder, StewardshipState } from "./standingTypes";

/**
 * A housing test world (square map, settlers who join the government, walled rooms, a throne
 * room) with the helpers of the Steward tests.
 */
export type StandingTestWorld = HousingTestWorld & {
  /**
   * Makes the board of the world (cell 0 unless `boardCell` says otherwise) user-managed, as the
   * village board of a new game is.
   */
  userBoard: () => EntityId;
  /**
   * Spawns a settler on a cell and appoints it Town Crier.
   */
  crier: (cell: number) => Entity;
  /**
   * Spawns a settler on a cell and appoints it Steward.
   */
  steward: (cell: number) => Entity;
  /**
   * Creates a standing order through the command and returns its id; the default payload keeps
   * oak planks (sawmill recipe, 2 per run) in stock.
   */
  standing: (payload?: { [field: string]: JsonValue }) => number;
  /**
   * The live record of an order.
   */
  orderOf: (orderId: number) => StandingOrder;
  /**
   * The saved state of the standing-order service.
   */
  state: () => StewardshipState;
  /**
   * Runs ticks until the next review slot has just run (`stewardReviewTickOfDay`).
   */
  runToReview: () => void;
  /**
   * Designates a zone of a type over cells of the map and returns its id.
   */
  zone: (zoneTypeId: string, cells: number[]) => EntityId;
  /**
   * Pretends a crafter works on the run's production order (a craft is recorded on the
   * workstation); the run counts as claimed.
   */
  claim: (runId: number) => void;
  /**
   * Ends the run's production order the way a finished craft does (completed, craft cleared).
   */
  finish: (runId: number) => void;
  /**
   * Counted units of a material in chests (the stock a standing order counts, settlement scope).
   */
  stock: (materialId: string) => number;
};

/**
 * Builds a {@link StandingTestWorld}.
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world.
 */
export function createStandingWorld(options: JobTestWorldOptions = {}): StandingTestWorld {
  const world = createHousingWorld(options);
  const orderOf = (orderId: number): StandingOrder => {
    const order = getStandingService(world.engine).find(orderId);
    if (order === undefined) {
      throw new Error(`no standing order ${orderId}`);
    }
    return order;
  };
  const locate = (runId: number): OrderLocation => {
    const run = getStandingService(world.engine).state.runs.find((entry) => entry.runId === runId);
    const found =
      run?.productionOrderId == null ? null : findOrder(world.engine, run.productionOrderId);
    if (found === null) {
      throw new Error(`run ${runId} has no production order`);
    }
    return found;
  };
  return {
    ...world,
    userBoard: () => {
      const found = getBoard(world.engine, world.boardId);
      if (found === null) {
        throw new Error("the test world has no board");
      }
      found.data.mode = JobBoardMode.UserManaged;
      return world.boardId;
    },
    crier: (cell) => {
      const settler = world.settler(cell);
      world.command("AppointTownCrier", { entityId: settler.id });
      return settler;
    },
    steward: (cell) => {
      const settler = world.settler(cell);
      world.command("AppointSteward", { entityId: settler.id });
      return settler;
    },
    standing: (payload = {}) => {
      const result = world.command("CreateStandingOrder", {
        materialId: "oak_plank",
        targetQuantity: 20,
        ...payload,
      }) as { orderId: number };
      return result.orderId;
    },
    orderOf,
    state: () => getStandingService(world.engine).state,
    runToReview: () => {
      const slot = world.engine.content.constants.stewardReviewTickOfDay;
      do {
        world.run(1);
      } while (world.engine.time.tickCount % ticksPerDay !== slot);
    },
    zone: (zoneTypeId, cells) => {
      const result = world.command("DesignateZone", {
        zoneTypeId,
        mapId: world.mapId,
        cells,
        reassign: false,
      }) as { zoneIds: number[] };
      return result.zoneIds[0] as number;
    },
    claim: (runId) => {
      const found = locate(runId);
      found.data.craft = {
        orderId: found.order.orderId,
        crafterId: 1,
        postingId: 1,
        recipeId: found.order.recipeId,
        startedTick: world.engine.time.tickCount,
        durationTicks: 1000,
        reservationIds: [],
      };
    },
    finish: (runId) => {
      const found = locate(runId);
      found.order.status = OrderStatus.Completed;
      found.order.remaining = 0;
      found.data.craft = null;
    },
    stock: (materialId) =>
      world.engine.store
        .entities()
        .filter((entity) => entity.prototype === "chest")
        .reduce((sum, entity) => sum + getTotal(entity, materialId), 0),
  };
}
