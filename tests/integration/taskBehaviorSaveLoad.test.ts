import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aiStateComponent } from "../../src/game/behavior/aiStateComponent";
import type { AiStateData } from "../../src/game/behavior/aiStateComponent";
import { BehaviorHandlerRegistry } from "../../src/game/behavior/BehaviorHandlerRegistry";
import { BehaviorInterpreter } from "../../src/game/behavior/BehaviorInterpreter";
import { BehaviorTreeRegistry } from "../../src/game/behavior/BehaviorTreeRegistry";
import { BehaviorNodeType, NodeStatus } from "../../src/game/behavior/behaviorTypes";
import { ComponentRegistry, defineComponent } from "../../src/game/ecs/ComponentRegistry";
import { requireComponent } from "../../src/game/ecs/Entity";
import { EntityStore } from "../../src/game/ecs/EntityStore";
import { PrototypeRegistry } from "../../src/game/ecs/PrototypeRegistry";
import { EventBus } from "../../src/game/engine/EventBus";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { IdCounters } from "../../src/game/engine/IdCounters";
import { Prng } from "../../src/game/engine/Prng";
import { TickPipeline, TickSlot } from "../../src/game/engine/TickPipeline";
import {
  childWait,
  continueStep,
  doneStep,
  eventWait,
  tickWait,
  waitStep,
} from "../../src/game/task/stepResults";
import { TaskHandlerRegistry } from "../../src/game/task/TaskHandlerRegistry";
import { TaskSystem } from "../../src/game/task/TaskSystem";
import { taskQueueComponent } from "../../src/game/task/taskQueueComponent";
import { TaskStatus, WaitKind } from "../../src/game/task/taskTypes";
import type { TaskQueueData } from "../../src/game/task/taskTypes";
import { GameTime } from "../../src/game/time/GameTime";

// A miniature world that uses every serialized piece of the task runtime and the behavior-tree
// interpreter: child tasks, tick waits, event waits, PRNG draws inside steps, a priority
// interrupt and a behavior tree whose running action is waiting for a task.

const errandsComponent = defineComponent(
  "Errands",
  z.object({ taskId: z.number().int().nullable(), done: z.number().int() }).strict(),
  () => ({ taskId: null, done: 0 }),
);

const totalTicks = 160;

function stableStringify(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] as JsonValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function numberField(data: JsonValue, key: string): number {
  return Number((data as { [field: string]: JsonValue })[key]);
}

function createWorld() {
  const bus = new EventBus();
  const time = new GameTime(bus);
  const counters = new IdCounters();
  const holder = { prng: Prng.create({ seed: 42 }) };
  const components = new ComponentRegistry();
  components.register(taskQueueComponent);
  components.register(aiStateComponent);
  components.register(errandsComponent);
  const prototypes = new PrototypeRegistry(components);
  prototypes.register({
    id: "villager",
    components: { TaskQueue: {}, AiState: {}, Errands: {} },
  });
  const store = new EntityStore({ components, prototypes, counters, bus });
  const handlers = new TaskHandlerRegistry();
  const tasks = new TaskSystem({ store, bus, counters, time, handlers });
  const pipeline = new TickPipeline({ time, bus });
  tasks.registerWith(pipeline);

  handlers.register({
    type: "errand.walk",
    start: (context, data) => {
      context.task.phase = "walking";
      context.task.data = { left: numberField(data, "left") };
      return continueStep();
    },
    step: (context) => {
      const left =
        numberField(context.task.data, "left") - holder.prng.stream("walk").nextInt(1, 2);
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
        left: holder.prng.stream("plan").nextInt(4, 8),
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

  for (let index = 0; index < 3; index += 1) {
    const entity = store.spawn("villager");
    interpreter.setTree(entity.id, "villager");
  }
  return { bus, time, counters, holder, store, tasks, pipeline, components };
}

type World = ReturnType<typeof createWorld>;

function snapshot(world: World): string {
  return stableStringify({
    time: world.time.serialize(),
    prng: world.holder.prng.serialize(),
    counters: world.counters.serialize(),
    eventQueue: world.bus.serialize(),
    entities: world.store.serialize(),
  } as unknown as JsonValue);
}

function loadWorld(saved: string): World {
  const world = createWorld();
  const parsed = JSON.parse(saved) as { [key: string]: JsonValue };
  world.counters.restore(parsed["counters"] as JsonValue);
  world.time.restore(parsed["time"] as JsonValue);
  world.holder.prng = Prng.fromState(parsed["prng"] as never);
  world.bus.restore(parsed["eventQueue"] as never);
  world.store.restore(parsed["entities"] as JsonValue);
  world.tasks.rebuildWaitIndex();
  return world;
}

function describeState(world: World): {
  waitingOnEvent: boolean;
  running: boolean;
  behaviorRunning: boolean;
} {
  let waitingOnEvent = false;
  let running = false;
  let behaviorRunning = false;
  for (const entity of world.store.entities()) {
    const queue = entity.components["TaskQueue"] as unknown as TaskQueueData;
    const aiState = entity.components["AiState"] as unknown as AiStateData;
    waitingOnEvent ||= queue.tasks.some(
      (task) => task.status === TaskStatus.Waiting && task.waitFor?.kind === WaitKind.Event,
    );
    running ||= queue.tasks.some((task) => task.status === TaskStatus.Running);
    behaviorRunning ||= aiState.running && aiState.currentNode.length > 0;
  }
  return { waitingOnEvent, running, behaviorRunning };
}

describe("task runtime and behavior trees survive save and load", () => {
  const reference = createWorld();
  reference.pipeline.runTicks(totalTicks);
  const finalState = snapshot(reference);

  it("finishes the errands (the scenario is not vacuous)", () => {
    const done = reference.store
      .entities()
      .map((entity) => requireComponent(entity, errandsComponent).done);
    expect(done).toEqual([2, 2, 2]);
    expect(finalState).toContain('"tick"');
  });

  it("is deterministic: two uninterrupted runs end byte-identical", () => {
    const again = createWorld();
    again.pipeline.runTicks(totalTicks);
    expect(snapshot(again)).toBe(finalState);
  });

  it("saving at every tick, loading into a fresh world and continuing ends byte-identical", () => {
    const seen = { waitingOnEvent: false, running: false, behaviorRunning: false };
    for (let split = 1; split < totalTicks; split += 1) {
      const world = createWorld();
      world.pipeline.runTicks(split);
      const saved = snapshot(world);
      const state = describeState(world);
      seen.waitingOnEvent ||= state.waitingOnEvent;
      seen.running ||= state.running;
      seen.behaviorRunning ||= state.behaviorRunning;
      const loaded = loadWorld(saved);
      expect(snapshot(loaded)).toBe(saved);
      loaded.pipeline.runTicks(totalTicks - split);
      expect(snapshot(loaded)).toBe(finalState);
    }
    expect(seen).toEqual({ waitingOnEvent: true, running: true, behaviorRunning: true });
  });

  it("everything saved is plain JSON that round-trips unchanged", () => {
    const world = createWorld();
    world.pipeline.runTicks(40);
    const saved = snapshot(world);
    expect(stableStringify(JSON.parse(saved) as JsonValue)).toBe(saved);
  });

  it("saves an interrupted run identically: the priority task at tick 30 cancels a running errand", () => {
    const world = createWorld();
    world.pipeline.runTicks(31);
    const queue = world.tasks.getQueue(2) as TaskQueueData;
    expect(queue.history.some((entry) => entry.outcome === TaskStatus.Cancelled)).toBe(true);
  });
});
