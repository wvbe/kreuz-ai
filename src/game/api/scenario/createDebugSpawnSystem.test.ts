import { describe, expect, it } from "vitest";
import { GameEngine } from "../../engine/GameEngine";
import { loadContent } from "../../content/ContentLoader";
import { MapSize } from "../../map/mapSize";
import { createDebugSpawnSystem, debugSpawnCommandKind } from "./createDebugSpawnSystem";

describe("createDebugSpawnSystem", () => {
  it("defines the DebugSpawn command only", () => {
    const system = createDebugSpawnSystem();
    expect(Object.keys(system.commandHandlers ?? {})).toEqual([debugSpawnCommandKind]);
    expect(system.run).toBeUndefined();
  });

  it("spawns one entity per cell with overrides and items, returning the ids", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.registerSystem(createDebugSpawnSystem());
    engine.newGame({ seed: 42, mapSize: MapSize.Small });
    const handler = engine.getCommandHandler(debugSpawnCommandKind);
    const result = handler?.handler(
      {
        prototypeId: "oven",
        mapId: 1,
        cells: [300, 301],
        overrides: { Inventory: { slotCount: 3 } },
        inventory: [{ materialId: "flour", quantity: 2 }],
      },
      engine,
    );
    const ids = (result as { entityIds: number[] }).entityIds;
    expect(ids).toHaveLength(2);
    const oven = engine.store.require(ids[0] ?? 0);
    expect(oven.components["Position"]).toEqual({ mapId: 1, cellIndex: 300 });
    expect(oven.components["Inventory"]).toMatchObject({ slotCount: 3 });
    expect(oven.components["ProductionOrders"]).toBeDefined();
    expect(() =>
      handler?.handler({ prototypeId: "oven", mapId: 1, cells: [-1] }, engine),
    ).toThrow();
  });
});
