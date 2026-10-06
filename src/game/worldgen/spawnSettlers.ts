import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { hasComponent } from "../ecs/Entity";
import { citizenComponent } from "../factions/citizenComponent";
import { setFactionLeader, pickLeaderCandidate } from "../factions/factionLeader";
import { joinFaction } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { appointCrier } from "../crier/crierFleet";
import { getComponent } from "../ecs/Entity";
import { assignIdentity } from "../identity/assignIdentity";
import { storeUpTo } from "../inventory/inventoryOperations";
import { jobBoardComponent } from "../jobs/jobBoardComponent";
import { JobBoardMode } from "../jobs/jobTypes";
import { initializeCharacter } from "../skills/traitAssignment";
import type { VillageLayout } from "./layoutVillage";

/**
 * Prototype id of the settlement anchor entity spawned at the village center.
 */
export const jobBoardPrototypeId = "job_board";

/**
 * Prototype id of the starting storage: a chest that is a stockpile (task 3.2).
 */
export const stockpilePrototypeId = "chest";

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
 * What the starting stockpile chest holds (DECISIONS D-54): the planks and nails that the first
 * workstations need before a sawmill or a smithy can exist (the sawmill itself costs planks and
 * nails), and a first batch of bread so the settlers live until the first harvest has been baked.
 * Materials the pack lacks are skipped.
 */
export const startingStockpileKit: readonly { materialId: string; quantity: number }[] = [
  { materialId: "oak_plank", quantity: 24 },
  { materialId: "nails", quantity: 30 },
  { materialId: "stone_block", quantity: 16 },
  { materialId: "bread", quantity: 12 },
];

/**
 * Weight limit of the starting storehouse chest in milli-kilograms: 320 kg, more than a built
 * chest (200 kg) so that the founders' kit fits with room to spare (D-54).
 */
export const startingStockpileWeightMilli = 320000;

/**
 * Prototype of the starting settler who becomes the Town Crier (DECISIONS D-12, D-53): the first
 * settler of this prototype.
 */
export const startingCrierPrototype = "peasant";

/**
 * What {@link spawnSettlers} created.
 */
export type SpawnedSettlement = {
  /**
   * Entity id of the job board at the village center, or null when the pack has no such prototype.
   */
  jobBoardId: EntityId | null;
  /**
   * Entity id of the starting stockpile chest on the clearing, or null when the pack has no such
   * prototype.
   */
  stockpileId: EntityId | null;
  /**
   * Settler entity ids in spawn order.
   */
  settlerIds: EntityId[];
  /**
   * Entity id of the starting Town Crier (one of the settlers), or null when there is none.
   */
  crierId: EntityId | null;
};

/**
 * Spawns the settlement kit on the village clearing: the job board on the center cell, the
 * starting settlers on distinct clearing cells (nearest to the center first, never a starter
 * plot) and then the stockpile chest (task 3.2) on the next clearing cell. Cells are registered
 * with the map occupant index and written to `Position`; the village board is user-managed (the
 * town square: the player edits it through a Town Crier) and the first peasant is appointed
 * Town Crier (D-12, D-53); settlers get their traits and starting skill bonuses from `initializeCharacter`, join the government faction
 * and are named by `assignIdentity`; afterwards the settler with the greatest total skill (ties:
 * lowest id) becomes the government's leader.
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
  const place = (
    prototypeId: string,
    cell: number,
    overrides: { [component: string]: { [field: string]: number } } = {},
  ): EntityId => {
    const entity = engine.store.spawn(prototypeId, {
      ...overrides,
      Position: { mapId, cellIndex: cell },
    });
    engine.maps.placeEntity(entity.id, mapId, cell);
    initializeCharacter(engine, entity.id);
    const government = governmentFactionId(engine);
    if (hasComponent(entity, citizenComponent) && government !== null) {
      joinFaction(engine, entity.id, government);
      assignIdentity(engine, entity.id);
    }
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
  const stockpileId = engine.prototypes.has(stockpilePrototypeId)
    ? place(stockpilePrototypeId, cells[settlerIds.length % cells.length] as number, {
        Inventory: { weightLimitMilli: startingStockpileWeightMilli },
      })
    : null;
  const chest = stockpileId === null ? undefined : engine.store.get(stockpileId);
  if (chest !== undefined) {
    for (const item of startingStockpileKit) {
      if (engine.materials.has(item.materialId)) {
        storeUpTo(
          { materials: engine.materials, actor: null },
          chest,
          item.materialId,
          item.quantity,
        );
      }
    }
  }
  const government = governmentFactionId(engine);
  if (government !== null) {
    setFactionLeader(engine, government, pickLeaderCandidate(engine, government));
  }
  const board = jobBoardId === null ? undefined : engine.store.get(jobBoardId);
  const boardData = board === undefined ? undefined : getComponent(board, jobBoardComponent);
  if (boardData !== undefined) {
    boardData.mode = JobBoardMode.UserManaged;
  }
  const crierId =
    settlerIds.find((id) => engine.store.get(id)?.prototype === startingCrierPrototype) ?? null;
  if (crierId !== null && hasComponent(engine.store.require(crierId), citizenComponent)) {
    appointCrier(engine, crierId);
  }
  return { jobBoardId, stockpileId, settlerIds, crierId };
}
