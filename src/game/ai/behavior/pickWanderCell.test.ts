import { describe, expect, it } from "vitest";
import { PathResultKind } from "../../pathfinding/pathTypes";
import { getAiService } from "../aiServiceRegistry";
import { createAiWorld } from "../testAiWorld";
import { pickWanderCell } from "./pickWanderCell";

describe("pickWanderCell", () => {
  it("picks a different cell within the wander radius of the same map", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 44);
    const pathfinding = getAiService(world.engine).pathfinding;
    for (let round = 0; round < 30; round += 1) {
      const target = pickWanderCell(world.engine, farmer);
      expect(target).not.toBeNull();
      expect(target?.mapId).toBe(world.mapId);
      expect(target?.cellIndex).not.toBe(44);
      const path = pathfinding.findPath(world.mapId, 44, target?.cellIndex ?? 0);
      expect(path.kind).toBe(PathResultKind.Found);
      expect(path.kind === PathResultKind.Found ? path.cost : 999).toBeLessThanOrEqual(60);
    }
  });

  it("is deterministic per seed and differs between seeds", () => {
    const sequence = (seed: number): number[] => {
      const world = createAiWorld({ seed });
      const farmer = world.spawn("farmer", 44);
      return Array.from(
        { length: 12 },
        () => pickWanderCell(world.engine, farmer)?.cellIndex ?? -1,
      );
    };
    expect(sequence(5)).toEqual(sequence(5));
    expect(sequence(5)).not.toEqual(sequence(6));
  });

  it("returns null when nowhere is reachable or the entity has no position", () => {
    const lonely = createAiWorld({ width: 1, height: 1 });
    expect(pickWanderCell(lonely.engine, lonely.spawn("farmer", 0))).toBeNull();
    const world = createAiWorld();
    const board = world.engine.store.spawn("job_board");
    delete board.components["Position"];
    expect(pickWanderCell(world.engine, board)).toBeNull();
  });
});
