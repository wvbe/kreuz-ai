import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { VillageLayout } from "./layoutVillage";

/**
 * Prototype id of the settlement anchor entity spawned at the village center.
 */
export const jobBoardPrototypeId = "job_board";

/**
 * Prototypes of the starting settlers, in spawn order (DECISIONS D-06, spec 007/027): two farmers,
 * a carpenter, a baker and two peasants. Prototypes the content pack lacks are skipped.
 */
export const startingSettlerPrototypes: readonly string[] = [
  "farmer",
  "farmer",
  "carpenter",
  "baker",
  "peasant",
  "peasant",
];

/**
 * What {@link spawnSettlers} created.
 */
export type SpawnedSettlement = {
  /**
   * Entity id of the job board at the village center, or null when the pack has no such prototype.
   */
  jobBoardId: EntityId | null;
  /**
   * Settler entity ids in spawn order.
   */
  settlerIds: EntityId[];
};

/**
 * Spawns the settlement kit on the village clearing: the job board on the center cell and the
 * starting settlers on distinct clearing cells (nearest to the center first, never a starter
 * plot). Cells are registered with the map occupant index and written to `Position`.
 *
 * @param engine - The engine whose store and maps are used.
 * @param mapId - Id of the generated outdoor map.
 * @param village - Layout of that map's village.
 * @returns The created entity ids.
 */
export function spawnSettlers(
  engine: GameEngine,
  mapId: number,
  village: VillageLayout,
): SpawnedSettlement {
  const place = (prototypeId: string, cell: number): EntityId => {
    const entity = engine.store.spawn(prototypeId, { Position: { mapId, cellIndex: cell } });
    engine.maps.placeEntity(entity.id, mapId, cell);
    return entity.id;
  };
  const jobBoardId = engine.prototypes.has(jobBoardPrototypeId)
    ? place(jobBoardPrototypeId, village.center)
    : null;
  const cells = village.clearing.filter(
    (cell) => cell !== village.center && !village.plots.includes(cell),
  );
  const settlerIds: EntityId[] = [];
  for (const prototypeId of startingSettlerPrototypes) {
    if (engine.prototypes.has(prototypeId)) {
      settlerIds.push(place(prototypeId, cells[settlerIds.length % cells.length] as number));
    }
  }
  return { jobBoardId, settlerIds };
}
