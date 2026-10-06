import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { availableCriers, deliverTaskOf, listCriers, tripToBoard } from "./crierQueries";
import { CrierStatus, deliverTaskType } from "./crierTypes";
import { createCrierWorld } from "./testCrierWorld";
import { townCrierComponent } from "./townCrierComponent";

// @covers 017:SC-005
describe("listCriers and availableCriers", () => {
  it("list the fleet ascending and only the free ones", () => {
    const world = createCrierWorld();
    const near = world.spawnCrier(11);
    const far = world.spawnCrier(55);
    world.spawn("peasant", 3);
    expect(listCriers(world.engine).map((entity) => entity.id)).toEqual([near.id, far.id]);
    const data = getComponent(far, townCrierComponent);
    if (data !== undefined) {
      data.status = CrierStatus.Traveling;
    }
    expect(availableCriers(world.engine).map((entity) => entity.id)).toEqual([near.id]);
  });
});

describe("deliverTaskOf", () => {
  it("finds the unfinished delivery task and nothing else", () => {
    const world = createCrierWorld();
    const crier = world.spawnCrier(55);
    expect(deliverTaskOf(world.engine, crier.id)).toBeUndefined();
    world.engine.tasks.enqueue(crier.id, {
      type: deliverTaskType,
      data: { boardId: world.boardId },
    });
    expect(deliverTaskOf(world.engine, crier.id)?.type).toBe(deliverTaskType);
  });
});

describe("tripToBoard", () => {
  it("is longer for a farther crier and counts ticks at the walking speed", () => {
    const world = createCrierWorld();
    const near = world.spawnCrier(11);
    const far = world.spawnCrier(99);
    const nearTrip = tripToBoard(world.engine, near, world.boardId);
    const farTrip = tripToBoard(world.engine, far, world.boardId);
    expect(nearTrip).not.toBeNull();
    expect(farTrip?.cost).toBeGreaterThan(nearTrip?.cost ?? 0);
    expect(farTrip?.ticks).toBeGreaterThan(nearTrip?.ticks ?? 0);
    expect(farTrip?.ticks).toBe(Math.ceil((farTrip?.cost ?? 0) / 10));
  });

  it("is zero on the board's cell and null without a board or a path", () => {
    const world = createCrierWorld();
    const there = world.spawnCrier(0);
    expect(tripToBoard(world.engine, there, world.boardId)).toEqual({ cost: 0, ticks: 0 });
    expect(tripToBoard(world.engine, there, 9999)).toBeNull();
    const walled = world.spawnCrier(99);
    world.engine.maps.require(world.mapId).setTerrain(0, "rock_wall");
    expect(tripToBoard(world.engine, walled, world.boardId)).toBeNull();
  });
});
