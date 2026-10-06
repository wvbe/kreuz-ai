import { AnimalKind } from "../content/contentTypes";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { FaunaStream } from "../fauna/faunaTypes";
import type { CellPoint } from "../map/mapTypes";
import { distanceSquared } from "./distanceSquared";
import { cellSpacing } from "./generateOutdoorTerrain";

/**
 * Habitat cells per animal by threat level (index 0..4): a wild species gets one animal per this
 * many cells of its habitat that are free, so prey is common and predators are rare.
 */
export const habitatCellsPerAnimal: readonly number[] = [60, 120, 150, 250, 400];

/**
 * Most animals of one wild species by threat level (index 0..4).
 */
export const maxAnimalsPerSpecies: readonly number[] = [6, 2, 2, 2, 1];

/**
 * Wild species up to this threat level get at least one animal when their habitat exists at all
 * (deer, rabbit, fox); more dangerous ones only appear when the habitat is large enough.
 */
export const guaranteedThreatLevel = 1;

/**
 * Wild animals do not spawn closer to the village center than this many cell spacings.
 */
export const faunaSafeSpacings = 6;

/**
 * Places the wild animals of a new world (task 5.3 part 2b, DECISIONS D-140). It runs at the end of
 * the new-game init, after the settlers, the stockpile and the NPC factions exist (so no entity id
 * of the starting world changes) and draws only from the stream `world.fauna`, so adding
 * animals changes neither the terrain nor any other stream. For every wild prototype in content
 * order, the free traversable cells of its habitat terrains that lie at least
 * {@link faunaSafeSpacings} cell spacings from the village center are candidates; the species
 * gets `floor(candidates / habitatCellsPerAnimal[threat])` animals (at most
 * `maxAnimalsPerSpecies[threat]`, at least one up to {@link guaranteedThreatLevel}), each on a
 * cell chosen uniformly from the candidates left (no two on one cell). Livestock is not spawned:
 * it arrives by trade (spec 022 edge cases).
 *
 * @param engine - The engine in `NewGame` init.
 * @param mapId - Id of the generated outdoor map.
 * @param villageCell - The settlement anchor cell (the job board).
 * @returns The ids of the animals, in spawn order.
 */
export function spawnFauna(engine: GameEngine, mapId: number, villageCell: number): EntityId[] {
  const map = engine.maps.require(mapId);
  const stream = engine.prng.stream(FaunaStream.World);
  const spacing = cellSpacing(map.geometry.cellCount);
  const origin = map.centroid(villageCell) as CellPoint;
  const safe = faunaSafeSpacings * faunaSafeSpacings * spacing * spacing;
  const taken = new Set<number>([villageCell]);
  const ids: EntityId[] = [];
  for (const animal of engine.content.animals.all()) {
    if (animal.kind !== AnimalKind.Wild || !engine.prototypes.has(animal.id)) {
      continue;
    }
    const candidates: number[] = [];
    for (let cell = 0; cell < map.geometry.cellCount; cell += 1) {
      if (
        !taken.has(cell) &&
        map.isTraversable(cell) &&
        animal.habitatTerrainIds.includes(map.terrainAt(cell)) &&
        distanceSquared(map.centroid(cell), origin) >= safe
      ) {
        candidates.push(cell);
      }
    }
    const level = Math.min(animal.threatLevel, habitatCellsPerAnimal.length - 1);
    const wanted = Math.min(
      maxAnimalsPerSpecies[level] as number,
      Math.max(
        level <= guaranteedThreatLevel && candidates.length > 0 ? 1 : 0,
        Math.floor(candidates.length / (habitatCellsPerAnimal[level] as number)),
      ),
    );
    for (let placed = 0; placed < wanted && candidates.length > 0; placed += 1) {
      const index = stream.nextInt(0, candidates.length - 1);
      const cell = candidates.splice(index, 1)[0] as number;
      taken.add(cell);
      const entity = engine.store.spawn(animal.id, { Position: { mapId, cellIndex: cell } });
      engine.maps.placeEntity(entity.id, mapId, cell);
      ids.push(entity.id);
    }
  }
  return ids;
}
