import { governmentFactionPrototypeId } from "../content/ContentRegistries";
import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "./factionComponent";
import { FactionError, FactionErrorKind } from "./FactionError";
import { factionPrototypeId } from "./factionTypes";

/**
 * All faction entities, ascending by id.
 *
 * @param engine - The engine that owns the entities.
 * @returns Live entities that carry `Faction`.
 */
export function listFactions(engine: GameEngine): Entity[] {
  return engine.store
    .entities()
    .filter((entity) => getComponent(entity, factionComponent) !== undefined);
}

/**
 * The player government faction entity that `newGame` spawns (DECISIONS D-06).
 *
 * @param engine - The engine that owns the entities.
 * @returns Its id, or null when there is no game.
 */
export function governmentFactionId(engine: GameEngine): EntityId | null {
  return (
    engine.store.entities().find((entity) => entity.prototype === governmentFactionPrototypeId)
      ?.id ?? null
  );
}

/**
 * The faction entity bound to a content faction (`factions.json`).
 *
 * @param engine - The engine that owns the entities.
 * @param contentId - Content faction id.
 * @returns The lowest-id entity bound to it, or null when none was spawned yet.
 */
export function findFactionByContentId(engine: GameEngine, contentId: string): Entity | null {
  return (
    listFactions(engine).find(
      (entity) => getComponent(entity, factionComponent)?.contentId === contentId,
    ) ?? null
  );
}

/**
 * Spawns the faction entity of a content faction: name, type, leader title and disposition are
 * copied from the record, the leader is empty and standing is default. Several entities per
 * content faction are allowed; callers that want one use {@link ensureContentFaction}.
 *
 * @param engine - The engine that owns the entities.
 * @param contentId - Content faction id; unknown ids throw `FactionError`.
 * @returns The new entity.
 */
export function spawnContentFaction(engine: GameEngine, contentId: string): Entity {
  const record = engine.content.factions.find(contentId);
  if (record === undefined) {
    throw new FactionError(
      FactionErrorKind.UnknownFaction,
      `the content pack has no faction "${contentId}"`,
    );
  }
  return engine.store.spawn(factionPrototypeId, {
    Faction: {
      contentId: record.id,
      name: record.name,
      factionType: record.factionType,
      leaderTitle: record.leaderTitle,
      disposition: record.disposition,
    },
  });
}

/**
 * The faction entity of a content faction, spawned when it does not exist yet.
 *
 * @param engine - The engine that owns the entities.
 * @param contentId - Content faction id.
 * @returns The existing or new entity.
 */
export function ensureContentFaction(engine: GameEngine, contentId: string): Entity {
  return findFactionByContentId(engine, contentId) ?? spawnContentFaction(engine, contentId);
}
