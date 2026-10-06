import { describe, expect, it } from "vitest";
import { AiTaskType } from "../ai/aiTypes";
import { createAiWorld } from "../ai/testAiWorld";
import type { AiTestWorld } from "../ai/testAiWorld";
import { NodeStatus } from "../behavior/behaviorTypes";
import type { BehaviorContext, BehaviorParams } from "../behavior/behaviorTypes";
import { getComponent } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import type { Entity } from "../ecs/Entity";
import { noAiOverride } from "../jobs/testJobWorld";
import { taskQueueComponent } from "../task/taskQueueComponent";
import {
  goToZone,
  registerZoneVisitHandlers,
  zoneAvailable,
  zoneStandTicks,
} from "./zoneVisitHandlers";

function contextOf(world: AiTestWorld, entity: Entity, params: BehaviorParams): BehaviorContext {
  return {
    entityId: entity.id,
    entity,
    tick: world.engine.time.tickCount,
    params,
    store: world.engine.store,
    bus: world.engine.bus,
  };
}

function addZone(world: AiTestWorld, zoneTypeId: string, tiles: number[], active = true): void {
  world.engine.store.spawn("zone", { Zone: { zoneTypeId, mapId: world.mapId, tiles, active } });
}

function tasksOf(entity: Entity): { type: string; data: JsonValue }[] {
  return (getComponent(entity, taskQueueComponent)?.tasks ?? []).map((task) => ({
    type: task.type,
    data: task.data,
  }));
}

describe("zone visit handlers", () => {
  it("zone_available needs an active zone of a named type on the map", () => {
    const world = createAiWorld();
    const merchant = world.spawn("merchant", 0, noAiOverride);
    const params = { zoneTypes: "market" };
    expect(zoneAvailable(world.engine, contextOf(world, merchant, params))).toBe(
      NodeStatus.Failure,
    );
    addZone(world, "market", [44, 45], false);
    expect(zoneAvailable(world.engine, contextOf(world, merchant, params))).toBe(
      NodeStatus.Failure,
    );
    addZone(world, "market", [54, 55]);
    expect(zoneAvailable(world.engine, contextOf(world, merchant, params))).toBe(
      NodeStatus.Success,
    );
    expect(zoneAvailable(world.engine, contextOf(world, merchant, { zoneTypes: "chapel" }))).toBe(
      NodeStatus.Failure,
    );
    expect(
      zoneAvailable(world.engine, contextOf(world, merchant, { zoneTypes: "chapel,market" })),
    ).toBe(NodeStatus.Success);
    expect(zoneAvailable(world.engine, contextOf(world, merchant, {}))).toBe(NodeStatus.Failure);
  });

  it("go_to_zone walks to the nearest zone cell", () => {
    const world = createAiWorld();
    const merchant = world.spawn("merchant", 0, noAiOverride);
    addZone(world, "market", [77, 14, 15]);
    expect(goToZone(world.engine, contextOf(world, merchant, { zoneTypes: "market" }))).toBe(
      NodeStatus.Success,
    );
    expect(tasksOf(merchant)).toEqual([
      { type: AiTaskType.Move, data: { mapId: world.mapId, target: 14 } },
    ]);
  });

  it("go_to_zone stands in the zone once there, and leaves a busy entity alone", () => {
    const world = createAiWorld();
    const merchant = world.spawn("merchant", 14, noAiOverride);
    addZone(world, "market", [14, 15]);
    const context = contextOf(world, merchant, { zoneTypes: "market" });
    expect(goToZone(world.engine, context)).toBe(NodeStatus.Success);
    expect(tasksOf(merchant)).toEqual([{ type: AiTaskType.Idle, data: { ticks: zoneStandTicks } }]);
    expect(goToZone(world.engine, context)).toBe(NodeStatus.Success);
    expect(tasksOf(merchant)).toHaveLength(1);
  });

  it("go_to_zone fails when no zone cell can be reached", () => {
    const world = createAiWorld();
    const merchant = world.spawn("merchant", 0, noAiOverride);
    const map = world.engine.maps.require(world.mapId);
    for (const cell of [1, 10, 11]) {
      map.setTerrain(cell, "water_shallow");
    }
    addZone(world, "market", [55]);
    expect(goToZone(world.engine, contextOf(world, merchant, { zoneTypes: "market" }))).toBe(
      NodeStatus.Failure,
    );
  });

  it("is registered by the engine already (a second registration is a duplicate)", () => {
    const world = createAiWorld();
    expect(() => registerZoneVisitHandlers(world.engine)).toThrow();
  });
});
