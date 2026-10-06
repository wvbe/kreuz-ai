import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { GridType } from "../map/mapTypes";
import type { VillageLayout } from "./layoutVillage";
import { getTotal } from "../inventory/inventoryQueries";
import { getComponent } from "../ecs/Entity";
import { jobBoardComponent } from "../jobs/jobBoardComponent";
import { JobBoardMode } from "../jobs/jobTypes";
import { townCrierComponent } from "../crier/townCrierComponent";
import {
  jobBoardPrototypeId,
  spawnSettlers,
  startingCrierPrototype,
  startingSettlerPrototypes,
  startingStockpileKit,
  startingStockpileWeightMilli,
} from "./spawnSettlers";

const layout: VillageLayout = {
  center: 10,
  clearing: [10, 11, 12, 13, 14, 15, 16, 17],
  roads: [10, 11],
  plots: [17],
};

function setup(): { engine: GameEngine; mapId: number } {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 1 });
  const map = engine.maps.createMap({
    gridType: GridType.Square,
    terrainId: "grassland",
    width: 5,
    height: 5,
  });
  return { engine, mapId: map.id };
}

describe("spawnSettlers", () => {
  it("places the job board on the center and settlers on distinct clearing cells", () => {
    const { engine, mapId } = setup();
    const spawned = spawnSettlers(engine, mapId, layout);
    expect(spawned.jobBoardId).not.toBeNull();
    expect(spawned.settlerIds).toHaveLength(startingSettlerPrototypes.length);
    const board = engine.store.require(spawned.jobBoardId ?? 0);
    expect(board.prototype).toBe(jobBoardPrototypeId);
    expect(board.components["Position"]).toEqual({ mapId, cellIndex: 10 });
    const cells = spawned.settlerIds.map(
      (id) => (engine.store.require(id).components["Position"] as { cellIndex: number }).cellIndex,
    );
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells).not.toContain(10);
    expect(cells).not.toContain(17);
    expect(engine.maps.queryCell(mapId, cells[0] ?? 0).occupants).toContain(spawned.settlerIds[0]);
  });

  it("starts with a farming, building and baking mix", () => {
    const { engine, mapId } = setup();
    const spawned = spawnSettlers(engine, mapId, layout);
    const kinds = spawned.settlerIds.map((id) => engine.store.require(id).prototype);
    expect(kinds).toEqual(["farmer", "farmer", "carpenter", "baker", "peasant", "peasant"]);
  });

  it("makes the settlers named members of the government, led by the most skilled one", () => {
    const { engine, mapId } = setup();
    const spawned = spawnSettlers(engine, mapId, layout);
    const government = engine.store.require(1).components["Faction"] as { leaderId: number | null };
    for (const id of spawned.settlerIds) {
      const components = engine.store.require(id).components;
      expect((components["Citizen"] as { factions: number[] }).factions).toEqual([1]);
      expect((components["Identity"] as { givenName: string }).givenName).not.toBe("");
    }
    expect(government.leaderId).toBe(spawned.settlerIds[2]);
    const board = engine.store.require(spawned.jobBoardId ?? 0);
    expect(board.components["Citizen"]).toBeUndefined();
  });

  it("shares cells when the clearing is smaller than the settler count", () => {
    const { engine, mapId } = setup();
    const tiny: VillageLayout = { center: 10, clearing: [10, 11, 12], roads: [10], plots: [] };
    expect(spawnSettlers(engine, mapId, tiny).settlerIds).toHaveLength(6);
  });

  it("makes the board user-managed and appoints the first peasant Town Crier", () => {
    const { engine, mapId } = setup();
    const spawned = spawnSettlers(engine, mapId, layout);
    const board = engine.store.require(spawned.jobBoardId ?? 0);
    expect(getComponent(board, jobBoardComponent)?.mode).toBe(JobBoardMode.UserManaged);
    const crier = engine.store.require(spawned.crierId ?? 0);
    expect(crier.prototype).toBe(startingCrierPrototype);
    expect(getComponent(crier, townCrierComponent)).toBeDefined();
    expect(
      spawned.settlerIds.filter(
        (id) =>
          id !== spawned.crierId &&
          getComponent(engine.store.require(id), townCrierComponent) !== undefined,
      ),
    ).toEqual([]);
  });

  it("stocks the storehouse chest with the founders' kit and a roomier weight limit", () => {
    const { engine, mapId } = setup();
    const spawned = spawnSettlers(engine, mapId, layout);
    const chest = engine.store.require(spawned.stockpileId ?? 0);
    for (const item of startingStockpileKit) {
      expect(getTotal(chest, item.materialId)).toBe(item.quantity);
    }
    expect((chest.components["Inventory"] as { weightLimitMilli: number }).weightLimitMilli).toBe(
      startingStockpileWeightMilli,
    );
  });
});
