import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { outdoorGeneratorName } from "./generateWorld";
import { jobBoardPrototypeId, startingSettlerPrototypes } from "./spawnSettlers";
import { WorldTerrain } from "./WorldTerrain";

/**
 * Where the pieces of a generated world are, derived from saved state only (so it also works
 * after `loadGame`).
 */
export type WorldLayout = {
  /**
   * Id of the main outdoor map (generator `outdoor`).
   */
  mapId: number;
  /**
   * Settlement anchor: the cell of the job board, or null when the pack spawned none.
   */
  villageCell: number | null;
  /**
   * Cells of the iron ore deposit, ascending.
   */
  oreCells: number[];
  /**
   * Starting-settler entities on the map, ascending id.
   */
  settlerIds: EntityId[];
};

/**
 * Finds the generated world of the engine's current game.
 *
 * @param engine - Engine with a game.
 * @returns The layout, or null when the game has no generated outdoor map (no `mapSize`).
 */
export function readWorldLayout(engine: GameEngine): WorldLayout | null {
  const map = engine.maps.list().find((entry) => entry.params.generator === outdoorGeneratorName);
  if (map === undefined) {
    return null;
  }
  const oreCells: number[] = [];
  for (let cell = 0; cell < map.cellCount; cell += 1) {
    if (map.terrainAt(cell) === WorldTerrain.IronOreDeposit) {
      oreCells.push(cell);
    }
  }
  let villageCell: number | null = null;
  const settlerIds: EntityId[] = [];
  for (const entity of engine.store.entities()) {
    const position = getComponent(entity, positionComponent);
    if (position === undefined || position.mapId !== map.id) {
      continue;
    }
    if (entity.prototype === jobBoardPrototypeId && villageCell === null) {
      villageCell = position.cellIndex;
    } else if (startingSettlerPrototypes.includes(entity.prototype)) {
      settlerIds.push(entity.id);
    }
  }
  return { mapId: map.id, villageCell, oreCells, settlerIds };
}
