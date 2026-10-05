import { describe, expect, it } from "vitest";
import { saveGame } from "./saveGame";
import { createSaveWorld, worldTotalTicks } from "./testSaveWorld";

describe("createSaveWorld", () => {
  it("builds a populated world: 3 villagers, 2 maps, sections registered", () => {
    const world = createSaveWorld();
    expect(world.parts.store.entities()).toHaveLength(3);
    expect(world.parts.maps.list()).toHaveLength(2);
    expect(world.parts.sections.list()).toHaveLength(2);
  });

  it("is deterministic and not vacuous", () => {
    const first = createSaveWorld();
    first.pipeline.runTicks(worldTotalTicks);
    const second = createSaveWorld();
    second.pipeline.runTicks(worldTotalTicks);
    const text = saveGame(first.parts);
    expect(saveGame(second.parts)).toBe(text);
    expect(text.split('"done":2')).toHaveLength(4);
    expect(first.ledger.ticksSeen).toBe(worldTotalTicks);
    expect(first.ledger.bells).toBeGreaterThan(0);
    expect(first.parts.maps.require(1).terrainAt(5)).toBe("road");
  });

  it("different seeds diverge", () => {
    const first = createSaveWorld(1);
    const second = createSaveWorld(2);
    first.pipeline.runTicks(40);
    second.pipeline.runTicks(40);
    expect(saveGame(first.parts)).not.toBe(saveGame(second.parts));
  });
});
