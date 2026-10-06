import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "./factionComponent";
import { factionsOf, membersOf } from "./factionMembership";
import type { FactionSeat, StandingEntry } from "./factionTypes";

/**
 * Plain view of one faction (query `factions`).
 */
export type FactionView = {
  readonly id: EntityId;
  readonly contentId: string | null;
  readonly name: string;
  readonly factionType: string;
  readonly leaderTitle: string;
  readonly disposition: string;
  readonly leaderId: EntityId | null;
  readonly memberIds: readonly EntityId[];
  readonly standing: readonly StandingEntry[];
  readonly seat: FactionSeat | null;
};

/**
 * Plain view of one citizen's memberships (query `faction-of`).
 */
export type MembershipView = {
  readonly entityId: EntityId;
  readonly factions: readonly { readonly id: EntityId; readonly name: string }[];
};

/**
 * Builds the view of a faction entity; members are derived by scanning `Citizen.factions`.
 *
 * @param engine - The engine that owns the entities.
 * @param entity - An entity with the `Faction` component.
 * @returns The view, or null when the entity is not a faction.
 */
export function buildFactionView(engine: GameEngine, entity: Entity): FactionView | null {
  const faction = getComponent(entity, factionComponent);
  if (faction === undefined) {
    return null;
  }
  return {
    id: entity.id,
    contentId: faction.contentId,
    name: faction.name,
    factionType: faction.factionType,
    leaderTitle: faction.leaderTitle,
    disposition: faction.disposition,
    leaderId: faction.leaderId,
    memberIds: membersOf(engine, entity.id).map((member) => member.id),
    standing: faction.standing.map((entry) => ({ ...entry })),
    seat: faction.seat === null ? null : { ...faction.seat },
  };
}

/**
 * Builds the membership view of an entity.
 *
 * @param engine - The engine that owns the entities.
 * @param entityId - The entity; non-citizens have no factions.
 * @returns Faction ids with names, ascending.
 */
export function buildMembershipView(engine: GameEngine, entityId: EntityId): MembershipView {
  return {
    entityId,
    factions: factionsOf(engine, entityId).map((id) => {
      const entity = engine.store.get(id);
      return {
        id,
        name:
          (entity === undefined ? undefined : getComponent(entity, factionComponent))?.name ?? "",
      };
    }),
  };
}
