import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "./citizenComponent";
import { factionComponent } from "./factionComponent";
import { factionLeaderChangedEvent, factionMembershipChangedEvent } from "./factionTypes";
import type { FactionLeaderChanged, FactionMembershipChanged } from "./factionTypes";

/**
 * Dangling-reference clean-up for one entity that is about to be removed (spec 021 FR-003,
 * DECISIONS D-14), run synchronously by the before-delete hook of the entity store at pipeline
 * slot 17: a deleted faction disappears from every member's `Citizen.factions` and from every
 * other faction's standing list; a deleted leader leaves its factions leaderless. Membership and
 * leader changes are queued as `faction.membership.changed` / `faction.leader.changed`.
 *
 * @param engine - The engine that owns the entities.
 * @param removed - The entity being removed (still present in the store).
 */
export function cleanUpFactionReferences(engine: GameEngine, removed: Entity): void {
  const removedIsFaction = getComponent(removed, factionComponent) !== undefined;
  for (const holder of engine.store.entities({ includePendingDelete: true })) {
    if (holder.id === removed.id) {
      continue;
    }
    const citizen = getComponent(holder, citizenComponent);
    if (removedIsFaction && citizen?.factions.includes(removed.id) === true) {
      citizen.factions = citizen.factions.filter((id) => id !== removed.id);
      const payload: FactionMembershipChanged = {
        entityId: holder.id,
        factionId: removed.id,
        joined: false,
      };
      engine.bus.emit(factionMembershipChangedEvent, payload);
    }
    const faction = getComponent(holder, factionComponent);
    if (faction === undefined) {
      continue;
    }
    if (removedIsFaction) {
      faction.standing = faction.standing.filter((entry) => entry.factionId !== removed.id);
    }
    if (faction.leaderId === removed.id) {
      faction.leaderId = null;
      const payload: FactionLeaderChanged = {
        factionId: holder.id,
        oldLeaderId: removed.id,
        newLeaderId: null,
      };
      engine.bus.emit(factionLeaderChangedEvent, payload);
    }
  }
}
