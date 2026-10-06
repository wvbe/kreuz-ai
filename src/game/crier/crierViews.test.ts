import { describe, expect, it } from "vitest";
import {
  buildCrierViews,
  buildPendingUpdateViews,
  PendingUpdateState,
  WaitingReason,
} from "./crierViews";
import { CrierStatus } from "./crierTypes";
import { createCrierWorld } from "./testCrierWorld";
import type { CrierTestWorld } from "./testCrierWorld";

function post(world: CrierTestWorld): void {
  world.command("PostJob", {
    boardId: world.boardId,
    jobTypeId: "fell.trees",
    mapId: world.mapId,
    cellIndex: 15,
  });
}

// @covers 017:FR-019
describe("buildPendingUpdateViews", () => {
  it("reports a queued update with the reason nobody is on the way", () => {
    const world = createCrierWorld();
    post(world);
    expect(buildPendingUpdateViews(world.engine)).toMatchObject([
      {
        updateId: 1,
        state: PendingUpdateState.Queued,
        crierId: null,
        etaTicks: null,
        progressPermille: 0,
        waitingFor: WaitingReason.NoTownCrier,
      },
    ]);
  });

  it("says all criers are busy when the only one is out", () => {
    const world = createCrierWorld();
    world.spawnCrier(99);
    post(world);
    world.run(1);
    post(world);
    expect(buildPendingUpdateViews(world.engine)[1]).toMatchObject({
      state: PendingUpdateState.Queued,
      waitingFor: WaitingReason.AllCriersBusy,
    });
  });

  it("says the board is unreachable when a free crier cannot get there", () => {
    const world = createCrierWorld();
    world.spawnCrier(99);
    world.engine.maps.require(world.mapId).setTerrain(0, "rock_wall");
    post(world);
    world.run(1);
    expect(buildPendingUpdateViews(world.engine)[0]?.waitingFor).toBe(
      WaitingReason.BoardUnreachable,
    );
  });

  it("shows a carried update with a shrinking ETA and growing progress", () => {
    const world = createCrierWorld();
    const crier = world.spawnCrier(99);
    post(world);
    world.run(1);
    const early = buildPendingUpdateViews(world.engine)[0];
    expect(early).toMatchObject({ state: PendingUpdateState.Carried, crierId: crier.id });
    world.run(6);
    const later = buildPendingUpdateViews(world.engine)[0];
    expect(later?.etaTicks).toBeLessThan(early?.etaTicks ?? 0);
    expect(later?.remainingCost).toBeLessThan(early?.remainingCost ?? 0);
    expect(later?.progressPermille).toBeGreaterThan(early?.progressPermille ?? 0);
    expect(later?.waitingFor).toBeNull();
  });
});

describe("buildCrierViews", () => {
  it("lists the fleet with status, position and load", () => {
    const world = createCrierWorld();
    const crier = world.spawnCrier(99);
    expect(buildCrierViews(world.engine)).toEqual([
      {
        crierId: crier.id,
        status: CrierStatus.Available,
        mapId: world.mapId,
        cellIndex: 99,
        boardQueue: [],
        carrying: [],
      },
    ]);
    post(world);
    world.run(1);
    expect(buildCrierViews(world.engine)[0]).toMatchObject({
      status: CrierStatus.Traveling,
      boardQueue: [world.boardId],
      carrying: [1],
    });
  });
});
