import { getEntitiesByProperty } from "../ecs/EntityQuery";
import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "./citizenComponent";
import { factionComponent } from "./factionComponent";
import { FactionError, FactionErrorKind } from "./FactionError";
import { factionMembershipChangedEvent } from "./factionTypes";
import type { FactionMembershipChanged } from "./factionTypes";

function requireCitizen(engine: GameEngine, entityId: EntityId): Entity {
  const entity = engine.store.require(entityId);
  if (getComponent(entity, citizenComponent) === undefined) {
    throw new FactionError(FactionErrorKind.NotCitizen, `entity ${entityId} is not a citizen`);
  }
  return entity;
}

function requireFaction(engine: GameEngine, factionId: EntityId): void {
  const faction = engine.store.get(factionId);
  if (faction === undefined || getComponent(faction, factionComponent) === undefined) {
    throw new FactionError(FactionErrorKind.UnknownFaction, `entity ${factionId} is not a faction`);
  }
}

/**
 * Adds a citizen to a faction (spec 021 FR-002). Every write to `Citizen.factions` goes through
 * this helper and {@link leaveFaction}, which keep the list ascending and unique and queue
 * `faction.membership.changed` (DECISIONS D-14). Joining twice does nothing.
 *
 * @param engine - The engine that owns the entities.
 * @param entityId - The citizen.
 * @param factionId - The faction entity.
 * @returns True when the membership changed.
 */
export function joinFaction(engine: GameEngine, entityId: EntityId, factionId: EntityId): boolean {
  const citizen = getComponent(requireCitizen(engine, entityId), citizenComponent);
  requireFaction(engine, factionId);
  if (citizen === undefined || citizen.factions.includes(factionId)) {
    return false;
  }
  citizen.factions = [...citizen.factions, factionId].sort((left, right) => left - right);
  const payload: FactionMembershipChanged = { entityId, factionId, joined: true };
  engine.bus.emit(factionMembershipChangedEvent, payload);
  return true;
}

/**
 * Removes a citizen from a faction; see {@link joinFaction}. Leaving a faction one is not in does
 * nothing. A faction's leader who leaves stays leader until the caller changes it.
 *
 * @param engine - The engine that owns the entities.
 * @param entityId - The citizen.
 * @param factionId - The faction entity.
 * @returns True when the membership changed.
 */
export function leaveFaction(engine: GameEngine, entityId: EntityId, factionId: EntityId): boolean {
  const citizen = getComponent(requireCitizen(engine, entityId), citizenComponent);
  if (citizen === undefined || !citizen.factions.includes(factionId)) {
    return false;
  }
  citizen.factions = citizen.factions.filter((id) => id !== factionId);
  const payload: FactionMembershipChanged = { entityId, factionId, joined: false };
  engine.bus.emit(factionMembershipChangedEvent, payload);
  return true;
}

/**
 * Faction ids a citizen belongs to.
 *
 * @param engine - The engine that owns the entities.
 * @param entityId - The entity; unknown entities and non-citizens have none.
 * @returns Ids ascending.
 */
export function factionsOf(engine: GameEngine, entityId: EntityId): EntityId[] {
  const entity = engine.store.get(entityId);
  const citizen = entity === undefined ? undefined : getComponent(entity, citizenComponent);
  return citizen === undefined ? [] : [...citizen.factions];
}

/**
 * The members of a faction, derived by scanning `Citizen.factions` (spec 021 FR-015); nothing
 * about members is stored on the faction.
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - The faction entity.
 * @returns The member entities, ascending by id (live objects, entities pending deletion excluded).
 */
export function membersOf(engine: GameEngine, factionId: EntityId): Entity[] {
  return getEntitiesByProperty(engine.store, "Citizen.factions", { contains: factionId });
}

/**
 * Tells whether an entity belongs to a faction.
 *
 * @param engine - The engine that owns the entities.
 * @param entityId - The entity.
 * @param factionId - The faction entity.
 * @returns True for a member.
 */
export function isMember(engine: GameEngine, entityId: EntityId, factionId: EntityId): boolean {
  return factionsOf(engine, entityId).includes(factionId);
}
