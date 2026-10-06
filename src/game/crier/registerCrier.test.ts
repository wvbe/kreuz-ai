import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { requireBoard } from "../jobs/jobBoards";
import { JobBoardMode } from "../jobs/jobTypes";
import { getCrierService } from "./crierServiceRegistry";
import { registerCrier } from "./registerCrier";
import { createCrierWorld } from "./testCrierWorld";
import type { CrierTestWorld } from "./testCrierWorld";
import { townCrierComponent } from "./townCrierComponent";

function postPayload(world: CrierTestWorld, cellIndex = 15) {
  return { boardId: world.boardId, jobTypeId: "fell.trees", mapId: world.mapId, cellIndex };
}

describe("registerCrier", () => {
  it("is idempotent and returns the engine's service", () => {
    const world = createCrierWorld();
    expect(registerCrier(world.engine)).toBe(getCrierService(world.engine));
  });

  it("PostJob waits for a crier: the board changes only on arrival", () => {
    const world = createCrierWorld();
    world.spawnCrier(99);
    expect(world.command("PostJob", { ...postPayload(world), priority: 80, wage: 9 })).toEqual({
      updateId: 1,
    });
    world.run(2);
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
    world.run(60);
    expect(requireBoard(world.engine, world.boardId).data.postings[0]).toMatchObject({
      jobTypeId: "fell.trees",
      priority: 80,
      wage: 9,
    });
    expect(world.query("pending-updates")).toEqual([]);
  });

  it("PostJob is only accepted on a user-managed board", () => {
    const world = createCrierWorld();
    requireBoard(world.engine, world.boardId).data.mode = JobBoardMode.SystemManaged;
    expect(() => world.command("PostJob", postPayload(world))).toThrow(/system-managed/);
  });

  it("RemovePosting and ModifyPosting travel the same way", () => {
    const world = createCrierWorld();
    world.spawnCrier(11);
    world.command("PostJob", postPayload(world));
    world.run(30);
    const posting = requireBoard(world.engine, world.boardId).data.postings[0];
    world.command("ModifyPosting", {
      boardId: world.boardId,
      postingId: posting?.id ?? 0,
      priority: 3,
    });
    world.run(30);
    expect(requireBoard(world.engine, world.boardId).data.postings[0]?.priority).toBe(3);
    world.command("RemovePosting", { boardId: world.boardId, postingId: posting?.id ?? 0 });
    world.run(30);
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
    expect(() => world.command("RemovePosting", { boardId: world.boardId, postingId: 99 })).toThrow(
      /not active/,
    );
  });

  it("CancelPendingBoardUpdate recalls the crier and the board stays unchanged", () => {
    const world = createCrierWorld();
    const crier = world.spawnCrier(99);
    world.command("PostJob", postPayload(world));
    world.run(2);
    expect(getComponent(crier, townCrierComponent)?.status).toBe("traveling");
    expect(world.command("CancelPendingBoardUpdate", { updateId: 1 })).toEqual({ cancelled: true });
    world.run(80);
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
    expect(getComponent(crier, townCrierComponent)?.status).toBe("available");
    expect(() => world.command("CancelPendingBoardUpdate", { updateId: 1 })).toThrow(/not pending/);
  });

  it("AppointTownCrier and DismissTownCrier edit the fleet", () => {
    const world = createCrierWorld();
    const settler = world.spawn("peasant", 22);
    expect(world.command("AppointTownCrier", { entityId: settler.id })).toEqual({ changed: true });
    expect(world.query("town-criers")).toHaveLength(1);
    expect(world.command("DismissTownCrier", { entityId: settler.id })).toEqual({ changed: true });
    expect(world.query("town-criers")).toEqual([]);
  });

  it("a deleted crier loses its load and queued updates survive; save and load keep both", () => {
    const world = createCrierWorld();
    const crier = world.spawnCrier(99);
    world.command("PostJob", postPayload(world));
    world.run(2);
    world.command("PostJob", postPayload(world, 16));
    world.run(1);
    const text = world.engine.saveGame();
    const copy = new GameEngine(loadContent(), { entropy: () => 1 });
    copy.loadGame(text);
    expect(copy.saveGame()).toBe(text);
    expect(
      getCrierService(copy)
        .updates()
        .map((update) => update.updateId),
    ).toEqual([1, 2]);
    world.engine.store.requestDelete(crier.id);
    world.run(1);
    expect(
      getCrierService(world.engine)
        .updates()
        .map((update) => update.updateId),
    ).toEqual([2]);
  });
});
