import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { JobError, JobErrorKind } from "../jobs/JobError";
import { appointCrier, dismissCrier, loseCrierLoad } from "./crierFleet";
import { deliverTaskOf, listCriers } from "./crierQueries";
import { getCrierService } from "./crierServiceRegistry";
import { createCrierWorld } from "./testCrierWorld";
import { townCrierComponent } from "./townCrierComponent";

function post(world: ReturnType<typeof createCrierWorld>): void {
  world.command("PostJob", {
    boardId: world.boardId,
    jobTypeId: "fell.trees",
    mapId: world.mapId,
    cellIndex: 15,
  });
}

describe("appointCrier", () => {
  it("makes a citizen a crier once", () => {
    const world = createCrierWorld();
    const settler = world.spawn("peasant", 55);
    expect(appointCrier(world.engine, settler.id)).toBe(true);
    expect(appointCrier(world.engine, settler.id)).toBe(false);
    expect(listCriers(world.engine).map((entity) => entity.id)).toEqual([settler.id]);
  });

  it("refuses entities that are not citizens or do not exist", () => {
    const world = createCrierWorld();
    let kind: JobErrorKind | null = null;
    try {
      appointCrier(world.engine, world.boardId);
    } catch (failure) {
      kind = failure instanceof JobError ? failure.kind : null;
    }
    expect(kind).toBe(JobErrorKind.IneligibleCrier);
    expect(() => appointCrier(world.engine, 9999)).toThrow(/cannot be a Town Crier/);
  });
});

describe("dismissCrier", () => {
  it("removes the role, returns the load to the queue and cancels the walk", () => {
    const world = createCrierWorld();
    const crier = world.spawnCrier(99);
    post(world);
    world.run(2);
    expect(getCrierService(world.engine).find(1)?.crierId).toBe(crier.id);
    expect(dismissCrier(world.engine, crier.id)).toBe(true);
    expect(getComponent(crier, townCrierComponent)).toBeUndefined();
    expect(getCrierService(world.engine).find(1)?.crierId).toBeNull();
    world.run(2);
    expect(deliverTaskOf(world.engine, crier.id)).toBeUndefined();
    expect(dismissCrier(world.engine, crier.id)).toBe(false);
  });
});

describe("loseCrierLoad", () => {
  it("abandons what a deleted crier carried and keeps the waiting updates", () => {
    const world = createCrierWorld();
    const crier = world.spawnCrier(99);
    const abandoned: JsonValue[] = [];
    world.engine.bus.subscribe("jobboard.update.abandoned", (payload) => abandoned.push(payload));
    post(world);
    world.run(2);
    post(world);
    loseCrierLoad(world.engine, crier.id);
    world.run(1);
    expect(abandoned).toEqual([{ updateId: 1, boardId: world.boardId, reason: "crier_lost" }]);
    expect(
      getCrierService(world.engine)
        .updates()
        .map((update) => update.updateId),
    ).toEqual([2]);
    loseCrierLoad(world.engine, world.boardId);
  });
});
