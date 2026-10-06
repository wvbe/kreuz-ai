import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { requireBoard } from "../../src/game/jobs/jobBoards";
import { postJob } from "../../src/game/jobs/jobPostings";
import { createJobWorld } from "../../src/game/jobs/testJobWorld";
import type { JobTestWorld } from "../../src/game/jobs/testJobWorld";
import { BlockReason } from "../../src/game/map/mapTypes";

// Spec 017 acceptance (task 3.1 a, b, e): racing settlers never double claim, a paused board offers
// nothing, an abandoned job is released and not retried at once by the same settler.

function record(world: JobTestWorld, name: string): { entityId: number; postingId: number }[] {
  const seen: { entityId: number; postingId: number }[] = [];
  world.engine.bus.subscribe(name, (payload: JsonValue) => {
    seen.push(payload as (typeof seen)[number]);
  });
  return seen;
}

// @covers 017:FR-002 017:FR-007 017:FR-014 017:SC-002 017:SC-008
describe("job claiming with settlers", () => {
  it("lets exactly one of six racing settlers claim a single job", () => {
    const world = createJobWorld({ boardCell: 0 });
    for (const cell of [44, 45, 46, 54, 55, 56]) {
      world.spawn("peasant", cell);
    }
    const claims = record(world, "jobboard.job.claimed");
    const completed = record(world, "jobboard.job.completed");
    world.postFell(99);
    for (let tick = 0; tick < 120; tick += 1) {
      world.run(1);
      const holders = requireBoard(world.engine, world.boardId)
        .data.postings.filter((posting) => posting.claimantId !== null)
        .map((posting) => posting.claimantId);
      expect(holders.length).toBeLessThanOrEqual(1);
    }
    expect(claims).toHaveLength(1);
    expect(completed).toHaveLength(1);
  });

  it("claims in ascending entity id order when several settlers arrive in the same tick", () => {
    const world = createJobWorld({ boardCell: 55 });
    const first = world.spawn("peasant", 55);
    world.spawn("peasant", 55);
    world.postFell(99);
    const claims = record(world, "jobboard.job.claimed");
    world.run(5);
    expect(claims.map((claim) => claim.entityId)).toEqual([first.id]);
  });

  it("offers nothing on a paused board and everything again after the resume", () => {
    const world = createJobWorld({ boardCell: 0 });
    for (const cell of [44, 55]) {
      world.spawn("peasant", cell);
    }
    const claims = record(world, "jobboard.job.claimed");
    requireBoard(world.engine, world.boardId).data.pausedByPlayer = true;
    world.postFell(99);
    world.run(60);
    expect(claims).toEqual([]);
    requireBoard(world.engine, world.boardId).data.pausedByPlayer = false;
    world.run(60);
    expect(claims.length).toBeGreaterThan(0);
  });

  it("releases an abandoned job and keeps the same settler away from it for a while", () => {
    const world = createJobWorld({ boardCell: 55 });
    const worker = world.spawn("peasant", 55);
    const claims = record(world, "jobboard.job.claimed");
    const abandoned = record(world, "jobboard.job.abandoned");
    const posting = world.postFell(99);
    world.run(3);
    expect(claims).toHaveLength(1);
    const map = world.engine.maps.require(world.mapId);
    for (const cell of [88, 89, 98]) {
      map.setObstruction(cell, BlockReason.Wall);
    }
    world.run(80);
    expect(abandoned.length).toBeGreaterThan(0);
    expect(abandoned[0]).toMatchObject({ entityId: worker.id, postingId: posting.id });
    expect(claims).toHaveLength(1);
    expect(requireBoard(world.engine, world.boardId).data.postings[0]?.status).toBe("open");
  });
});

describe("many boards with recurring jobs (spec 017 SC-008, SC-002, SC-003)", () => {
  it("runs 24 boards with continuous claiming and recurrence, one claimant per posting", () => {
    const world = createJobWorld({ width: 40, height: 40, boardCell: 0 });
    const boardCells = Array.from({ length: 24 }, (_, index) => 41 + index * 60);
    const boards = boardCells.map((cell) => world.spawn("job_board", cell));
    for (const [index, board] of boards.entries()) {
      const cell = (boardCells[index] as number) + 2;
      world.forest(cell);
      postJob(
        world.engine,
        board.id,
        {
          jobTypeId: "fell.trees",
          target: { mapId: world.mapId, cellIndex: cell, entityId: null, materialId: null },
          recurring: true,
        },
        0,
      );
      world.spawn("peasant", cell - 1);
    }
    const claims = record(world, "jobboard.job.claimed");
    const completed = record(world, "jobboard.job.completed");
    const started = performance.now();
    for (let tick = 0; tick < 150; tick += 1) {
      world.run(1);
      for (const board of boards) {
        const claimed = requireBoard(world.engine, board.id).data.postings.filter(
          (posting) => posting.claimantId !== null,
        );
        expect(claimed.length).toBeLessThanOrEqual(1);
      }
    }
    const perTick = (performance.now() - started) / 150;
    expect(claims.length).toBeGreaterThan(24);
    expect(completed.length).toBeGreaterThan(0);
    expect(new Set(claims.map((claim) => claim.postingId)).size).toBe(claims.length);
    expect(perTick).toBeLessThan(100);
  });
});
