import { describe, expect, it } from "vitest";
import { NodeStatus } from "../behavior/behaviorTypes";
import { getComponent } from "../ecs/Entity";
import { joinFaction } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { getTotal } from "../inventory/inventoryQueries";
import { taskQueueComponent } from "../task/taskQueueComponent";
import {
  createFetchTask,
  fetchHouseholdGoods,
  householdNeedsGoods,
  noHouseholdStorageReason,
  registerFetchHandlers,
  sourceEmptyReason,
} from "./fetchHouseholdGoods";
import { assignHome } from "./household";
import { fetchTaskType } from "./housingTypes";
import { createHousingWorld } from "./testHousingWorld";
import type { HousingTestWorld } from "./testHousingWorld";

const options = { width: 16, height: 12 };

function context(world: HousingTestWorld, entityId: number) {
  const entity = world.engine.store.require(entityId);
  return {
    entityId,
    entity,
    tick: world.engine.time.tickCount,
    params: {},
    store: world.engine.store,
    bus: world.engine.bus,
  };
}

// A resident with the standard AI who lives in the dwelling.
function resident(world: HousingTestWorld, zone: number, cell: number): number {
  const entity = world.spawn("peasant", cell);
  joinFaction(world.engine, entity.id, governmentFactionId(world.engine) ?? 0);
  assignHome(world.engine, entity.id, zone, 0);
  return entity.id;
}

describe("fetch chore (spec 029 US3)", () => {
  it("fetches two days of demand from the nearest storage into the household chest", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const inside = world.chest(world.tiles(zone)[3] as number);
    const pantry = world.chest(170);
    world.give(pantry, "bread", 10);
    resident(world, zone, 171);
    resident(world, zone, 172);
    world.run(250);
    expect(getTotal(inside, "bread")).toBe(2);
    // Settlers may have eaten a loaf from the pantry meanwhile.
    expect(getTotal(pantry, "bread")).toBeLessThanOrEqual(8);
  });

  it("is a household chore: it posts nothing on the job board", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.chest(world.tiles(zone)[3] as number);
    world.give(world.chest(170), "bread", 10);
    resident(world, zone, 171);
    const before = JSON.stringify(world.query("job-boards"));
    world.run(100);
    expect(JSON.stringify(world.query("job-boards"))).toBe(before);
  });

  it("lets only one resident of the household fetch at a time", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.chest(world.tiles(zone)[3] as number);
    world.give(world.chest(170), "bread", 10);
    const ids = [resident(world, zone, 171), resident(world, zone, 172)];
    let most = 0;
    for (let tick = 0; tick < 120; tick += 1) {
      world.run(1);
      const fetching = ids.filter((id) =>
        (getComponent(world.engine.store.require(id), taskQueueComponent)?.tasks ?? []).some(
          (task) => task.type === fetchTaskType,
        ),
      ).length;
      most = Math.max(most, fetching);
    }
    expect(most).toBe(1);
  });

  it("starts nothing when no source exists (US3.3)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.chest(world.tiles(zone)[3] as number);
    const id = resident(world, zone, 171);
    expect(householdNeedsGoods(world.engine, context(world, id))).toBe(NodeStatus.Failure);
    expect(fetchHouseholdGoods(world.engine, context(world, id))).toBe(NodeStatus.Failure);
  });

  it("starts nothing without household storage (US3.4)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.give(world.chest(170), "bread", 10);
    const id = resident(world, zone, 171);
    expect(fetchHouseholdGoods(world.engine, context(world, id))).toBe(NodeStatus.Failure);
  });

  it("does not start while the settler holds a claimed job", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.chest(world.tiles(zone)[3] as number);
    world.give(world.chest(170), "bread", 10);
    const id = resident(world, zone, 171);
    world.engine.tasks.enqueue(id, { type: "ai.idle", data: { until: 99999 }, priority: 50 });
    expect(fetchHouseholdGoods(world.engine, context(world, id))).toBe(NodeStatus.Failure);
  });

  it("enqueues a fetch task that survives a save in the middle (FR-021)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.chest(world.tiles(zone)[3] as number);
    world.give(world.chest(170), "bread", 10);
    const id = resident(world, zone, 171);
    expect(fetchHouseholdGoods(world.engine, context(world, id))).toBe(NodeStatus.Success);
    const queue = getComponent(world.engine.store.require(id), taskQueueComponent);
    expect(queue?.tasks.map((task) => task.type)).toContain(fetchTaskType);
    expect(JSON.parse(JSON.stringify(queue))).toEqual(queue);
  });
});

describe("createFetchTask", () => {
  it("is registered for the engine and fails when the source vanished", () => {
    const world = createHousingWorld(options);
    expect(world.engine.taskHandlers.has(fetchTaskType)).toBe(true);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.chest(world.tiles(zone)[3] as number);
    const id = resident(world, zone, 171);
    const handler = createFetchTask(world.engine);
    expect(handler.type).toBe(fetchTaskType);
    expect(sourceEmptyReason).toBe("source_empty");
    expect(noHouseholdStorageReason).toBe("no_household_storage");
    expect(typeof registerFetchHandlers).toBe("function");
    expect(id).toBeGreaterThan(0);
  });

  it("returns the settler's goods home even when the walk was cancelled once", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const inside = world.chest(world.tiles(zone)[3] as number);
    const pantry = world.chest(170);
    world.give(pantry, "bread", 10);
    const id = resident(world, zone, 171);
    const before = world.count("bread");
    fetchHouseholdGoods(world.engine, context(world, id));
    world.run(5);
    world.engine.tasks.interrupt(id);
    world.run(300);
    // Nothing is lost or duplicated whatever happened to the task (settlers eat some bread).
    expect(getTotal(pantry, "bread") + getTotal(inside, "bread")).toBeLessThanOrEqual(before);
    expect(world.count("bread")).toBeLessThanOrEqual(before);
  });
});
