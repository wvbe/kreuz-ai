import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { storeUpTo } from "../inventory/inventoryOperations";
import { BlockReason, GridType } from "../map/mapTypes";
import { initializeCharacter } from "../skills/traitAssignment";
import { SiteRole } from "./SiteGenerator";
import type { GeneratedSite } from "./SiteGenerator";
import { WorldTerrain } from "./WorldTerrain";

/**
 * Prototype id of wall entities (`engine-prototypes.json`).
 */
export const wallPrototypeId = "wall";

/**
 * Starter inventory of a site role (spec 009 FR-008/FR-009): material id and quantity pairs.
 * Merchants carry coins and goods to sell, customers coins, workers their tools and a little
 * bread. Fixed amounts, so inserting a site draws no random numbers.
 */
export const siteStarterKits: Record<SiteRole, readonly (readonly [string, number])[]> = {
  [SiteRole.Merchant]: [
    ["silver_penny", 80],
    ["bread", 10],
    ["oak_plank", 6],
  ],
  [SiteRole.Customer]: [["silver_penny", 40]],
  [SiteRole.Worker]: [
    ["iron_hammer", 1],
    ["saw", 1],
    ["bread", 3],
  ],
  [SiteRole.Wanderer]: [["bread", 2]],
};

/**
 * What {@link insertSite} created.
 */
export type InsertedSite = {
  mapId: number;
  wallIds: EntityId[];
  entityIds: EntityId[];
};

/**
 * Puts a generated site into a running game: a square map (`generator: site`), one `wall` entity
 * per wall cell (the cell is also marked with a wall obstruction, as the future wall system will
 * do), and the site's entities with `Position` and their role's starter kit. Site objects (furniture) are data only until
 * the furniture system (task 3.5) exists, so they are not spawned.
 *
 * @param engine - Engine with a running game.
 * @param site - Site from `SiteGenerator.generate`.
 * @returns Map id and the spawned entity ids.
 */
export function insertSite(engine: GameEngine, site: GeneratedSite): InsertedSite {
  const map = engine.maps.createMap({
    gridType: GridType.Square,
    terrainId: WorldTerrain.FloorWood,
    width: site.width,
    height: site.height,
    seed: site.params.seed,
    generator: "site",
  });
  map.assignTerrain(site.cells);
  const place = (prototypeId: string, cell: number): EntityId => {
    const entity = engine.store.spawn(prototypeId, {
      Position: { mapId: map.id, cellIndex: cell },
    });
    return entity.id;
  };
  const wallIds: EntityId[] = [];
  for (const cell of site.walls) {
    map.setObstruction(cell, BlockReason.Wall);
    wallIds.push(place(wallPrototypeId, cell));
  }
  const entityIds: EntityId[] = [];
  for (const entity of site.entities) {
    const id = place(entity.prototypeId, entity.cell);
    engine.maps.placeEntity(id, map.id, entity.cell);
    initializeCharacter(engine, id);
    for (const [materialId, quantity] of siteStarterKits[entity.role]) {
      storeUpTo(
        { materials: engine.materials, actor: null },
        engine.store.require(id),
        materialId,
        quantity,
      );
    }
    entityIds.push(id);
  }
  return { mapId: map.id, wallIds, entityIds };
}
