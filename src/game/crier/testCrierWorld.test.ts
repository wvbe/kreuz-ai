import { describe, expect, it } from "vitest";
import { requireBoard } from "../jobs/jobBoards";
import { JobBoardMode } from "../jobs/jobTypes";
import { getComponent } from "../ecs/Entity";
import { townCrierComponent } from "./townCrierComponent";
import { createCrierWorld } from "./testCrierWorld";

describe("createCrierWorld", () => {
  it("makes the board user-managed and appoints criers on demand", () => {
    const world = createCrierWorld();
    expect(requireBoard(world.engine, world.boardId).data.mode).toBe(JobBoardMode.UserManaged);
    const crier = world.spawnCrier(55);
    expect(getComponent(crier, townCrierComponent)).toMatchObject({ status: "available" });
  });

  it("runs commands and queries by name and fails on unknown ones", () => {
    const world = createCrierWorld();
    expect(world.query("town-criers")).toEqual([]);
    expect(() => world.command("Nope", {})).toThrow(/no command/);
    expect(() => world.query("nope")).toThrow(/no query/);
  });
});
