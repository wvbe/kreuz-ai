import { z } from "zod";
import { aiStateComponent } from "../behavior/aiStateComponent";
import { BehaviorHandlerRegistry } from "../behavior/BehaviorHandlerRegistry";
import { BehaviorInterpreter } from "../behavior/BehaviorInterpreter";
import { BehaviorTreeRegistry } from "../behavior/BehaviorTreeRegistry";
import { BehaviorNodeType, NodeStatus } from "../behavior/behaviorTypes";
import { ComponentRegistry, defineComponent } from "../ecs/ComponentRegistry";
import { requireComponent } from "../ecs/Entity";
import { EntityStore } from "../ecs/EntityStore";
import { PrototypeRegistry } from "../ecs/PrototypeRegistry";
import { EventBus } from "../engine/EventBus";
import type { JsonValue } from "../engine/EventBus";
import { IdCounters } from "../engine/IdCounters";
import { Prng } from "../engine/Prng";
import { TickPipeline, TickSlot } from "../engine/TickPipeline";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { credit } from "../inventory/inventoryMoney";
import { storeUpTo } from "../inventory/inventoryOperations";
import { createTestMaterials } from "../inventory/testInventories";
import { MapRegistry } from "../map/MapRegistry";
import { BlockReason, GridType, MoveCostClass } from "../map/mapTypes";
import { positionComponent } from "../map/positionComponent";
import { TerrainRegistry } from "../map/TerrainRegistry";
import {
  childWait,
  continueStep,
  doneStep,
  eventWait,
  tickWait,
  waitStep,
} from "../task/stepResults";
import { TaskHandlerRegistry } from "../task/TaskHandlerRegistry";
import { TaskSystem } from "../task/TaskSystem";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { GameTime } from "../time/GameTime";
import { Difficulty } from "./initOptions";
import { SaveSectionLocation, SaveSectionRegistry } from "./SaveSectionRegistry";
import type { GameSnapshotParts } from "./saveTypes";

/**
 * Number of ticks the standard scenario runs for.
 */
export const worldTotalTicks = 160;

const errandsComponent = defineComponent(
  "Errands",
  z.object({ taskId: z.number().int().nullable(), done: z.number().int() }).strict(),
  () => ({ taskId: null, done: 0 }),
);

const statusesSchema = z.object({ ticksSeen: z.number().int().min(0) }).strict();
const tradeSchema = z.object({ bells: z.number().int().min(0) }).strict();

/**
 * A complete miniature game assembled from the real modules: clock, PRNG, bus, counters, entity
 * store with task queues, behavior trees, positions and inventories, a square and a Voronoi
 * sub-map, a task system, and two registered save sections (root `statuses`, `systems.trade`).
 */
export type SaveWorld = {
  parts: GameSnapshotParts;
  pipeline: TickPipeline;
  /**
   * Mutable section data, as a later system would keep it.
   */
  ledger: { ticksSeen: number; bells: number };
};

function numberField(data: JsonValue, key: string): number {
  return Number((data as { [field: string]: JsonValue })[key]);
}

/**
 * Builds the standard save-test world and spawns three villagers with errands, a priority
 * interrupt at tick 30, wandering on the main map and a terrain edit at tick 20.
 *
 * @param seed - PRNG seed.
 * @returns The assembled world; run it with `world.pipeline.runTicks`.
 */
export function createSaveWorld(seed = 42): SaveWorld {
  const bus = new EventBus();
  const time = new GameTime(bus);
  const counters = new IdCounters();
  const prng = { prng: Prng.create({ seed }) };
  const components = new ComponentRegistry();
  for (const definition of [
    taskQueueComponent,
    aiStateComponent,
    errandsComponent,
    positionComponent,
    inventoryComponent,
  ]) {
    components.register(definition);
  }
  const prototypes = new PrototypeRegistry(components);
  prototypes.register({
    id: "villager",
    components: { TaskQueue: {}, AiState: {}, Errands: {}, Position: {}, Inventory: {} },
  });
  const store = new EntityStore({ components, prototypes, counters, bus });
  const terrain = new TerrainRegistry();
  terrain.registerAll([
    { id: "grass", moveCost: MoveCostClass.Normal, passable: true, blockReason: null },
    { id: "road", moveCost: MoveCostClass.Fastest, passable: true, blockReason: null },
    { id: "river", moveCost: MoveCostClass.Slow, passable: false, blockReason: BlockReason.Water },
  ]);
  const maps = new MapRegistry({ terrain, counters, bus });
  const handlers = new TaskHandlerRegistry();
  const tasks = new TaskSystem({ store, bus, counters, time, handlers });
  const pipeline = new TickPipeline({ time, bus });
  tasks.registerWith(pipeline);

  const sections = new SaveSectionRegistry();
  const ledger = { ticksSeen: 0, bells: 0 };
  sections.register({
    key: "statuses",
    location: SaveSectionLocation.Root,
    schema: statusesSchema,
    serialize: () => ({ ticksSeen: ledger.ticksSeen }),
    restore: (saved) => {
      ledger.ticksSeen = statusesSchema.parse(saved).ticksSeen;
    },
  });
  sections.register({
    key: "trade",
    location: SaveSectionLocation.Systems,
    schema: tradeSchema,
    defaultForOlderSaves: () => ({ bells: 0 }),
    serialize: () => ({ bells: ledger.bells }),
    restore: (saved) => {
      ledger.bells = tradeSchema.parse(saved).bells;
    },
  });
  bus.subscribe("bell.rung", () => {
    ledger.bells += 1;
  });

  handlers.register({
    type: "errand.walk",
    start: (context, data) => {
      context.task.phase = "walking";
      context.task.data = { left: numberField(data, "left") };
      return continueStep();
    },
    step: (context) => {
      const left = numberField(context.task.data, "left") - prng.prng.stream("walk").nextInt(1, 2);
      context.task.data = { left };
      return left <= 0 ? doneStep() : continueStep();
    },
    cancel: () => undefined,
  });
  handlers.register({
    type: "errand.work",
    start: (context) => {
      context.task.phase = "working";
      return waitStep(tickWait(context.tick + 3));
    },
    step: () => doneStep(),
    cancel: () => undefined,
  });
  handlers.register({
    type: "errand.fetch",
    start: (context) => {
      context.task.phase = "walk";
      const walk = context.spawnChild("errand.walk", {
        left: prng.prng.stream("plan").nextInt(4, 8),
      });
      return waitStep(childWait(walk));
    },
    step: (context) => {
      if (context.task.phase === "walk") {
        context.task.phase = "wait_bell";
        return waitStep(eventWait("bell.rung"));
      }
      if (context.task.phase === "wait_bell") {
        context.task.phase = "work";
        return waitStep(childWait(context.spawnChild("errand.work", null)));
      }
      return doneStep();
    },
    cancel: () => undefined,
  });

  const behaviorHandlers = new BehaviorHandlerRegistry();
  behaviorHandlers.registerCondition("wants_errand", (context) =>
    requireComponent(context.entity, errandsComponent).done < 2
      ? NodeStatus.Success
      : NodeStatus.Failure,
  );
  behaviorHandlers.registerAction("start_errand", (context) => {
    const errands = requireComponent(context.entity, errandsComponent);
    if (errands.taskId === null) {
      errands.taskId = tasks.enqueue(context.entityId, { type: "errand.fetch", priority: 1 });
      return NodeStatus.Running;
    }
    const queue = requireComponent(context.entity, taskQueueComponent);
    if (queue.tasks.some((task) => task.id === errands.taskId)) {
      return NodeStatus.Running;
    }
    errands.taskId = null;
    errands.done += 1;
    return NodeStatus.Success;
  });
  behaviorHandlers.registerAction("rest", () => NodeStatus.Success);
  const trees = new BehaviorTreeRegistry(behaviorHandlers);
  trees.register({
    id: "villager",
    root: {
      type: BehaviorNodeType.Selector,
      children: [
        {
          type: BehaviorNodeType.Sequence,
          children: [
            { type: BehaviorNodeType.Condition, id: "wants_errand" },
            { type: BehaviorNodeType.Action, id: "start_errand" },
          ],
        },
        { type: BehaviorNodeType.Action, id: "rest" },
      ],
    },
  });
  const interpreter = new BehaviorInterpreter({ store, bus, trees, handlers: behaviorHandlers });

  pipeline.registerSystem({
    id: "script.world",
    slot: TickSlot.Commands,
    order: 0,
    run: (context) => {
      if (context.tick % 17 === 0) {
        bus.emit("bell.rung", { tick: context.tick });
      }
      if (context.tick === 30) {
        tasks.enqueue(2, { type: "errand.work", priority: 10 });
      }
      if (context.tick === 20) {
        maps.require(1).setTerrain(5, "road");
      }
    },
  });
  pipeline.registerSystem({
    id: "script.wander",
    slot: TickSlot.World,
    order: 0,
    run: (context) => {
      ledger.ticksSeen += 1;
      if (context.tick % 7 !== 0) {
        return;
      }
      for (const entity of store.entities()) {
        const position = requireComponent(entity, positionComponent);
        const map = maps.require(position.mapId);
        const cell =
          (position.cellIndex + prng.prng.stream("wander").nextInt(1, 40)) % map.cellCount;
        if (map.blockReason(cell) === null) {
          maps.moveEntity(entity.id, cell);
          position.cellIndex = cell;
        }
      }
    },
  });
  pipeline.registerSystem({
    id: "ai.behavior",
    slot: TickSlot.AiDecision,
    order: 0,
    run: (context) => {
      for (const entity of store.entities()) {
        interpreter.tick(entity.id, context.tick);
      }
    },
  });

  maps.createMap({ gridType: GridType.Square, terrainId: "grass", width: 12, height: 8 });
  maps.createMap({
    gridType: GridType.Voronoi,
    terrainId: "grass",
    cellCount: 40,
    seed: 9,
    parentId: 1,
  });
  maps.require(1).setTerrain(30, "river");
  maps.linkMaps({ mapId: 1, cell: 2, targetMapId: 2, targetCell: 0, bidirectional: true });
  const materials = createTestMaterials();
  const inventoryContext = { materials, actor: null, bus };
  for (let index = 0; index < 3; index += 1) {
    const entity = store.spawn("villager", { Inventory: { slotCount: 4 } });
    interpreter.setTree(entity.id, "villager");
    const cell = 10 + index * 3;
    maps.placeEntity(entity.id, 1, cell);
    requireComponent(entity, positionComponent).cellIndex = cell;
    requireComponent(entity, positionComponent).mapId = 1;
    credit(inventoryContext, entity, 50 + index);
    storeUpTo(inventoryContext, entity, "wood", 7 * (index + 1));
  }

  return {
    parts: {
      time,
      prng,
      bus,
      counters,
      store,
      maps,
      tasks,
      initOptions: {
        options: { seed, difficulty: Difficulty.Steady, startingTier: null, mapSize: null },
      },
      sections,
    },
    pipeline,
    ledger,
  };
}
