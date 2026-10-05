import { describe, expect, it } from "vitest";
import { getBoard } from "./jobBoards";
import { createJobWorld, noAiOverride } from "./testJobWorld";

describe("createJobWorld", () => {
  it("has a board on the chosen cell and posts jobs on forest cells", () => {
    const world = createJobWorld({ boardCell: 3 });
    expect(getBoard(world.engine, world.boardId)).not.toBeNull();
    const posting = world.postFell(15, { priority: 70 });
    expect(world.engine.maps.require(world.mapId).terrainAt(15)).toBe("forest_oak");
    expect(posting.priority).toBe(70);
    expect(posting.boardId).toBe(world.boardId);
    expect(noAiOverride.AiState.treeId).toBeNull();
  });
});
