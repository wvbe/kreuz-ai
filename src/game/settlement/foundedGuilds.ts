import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { isMember, membersOf } from "../factions/factionMembership";
import { governmentFactionId, listFactions } from "../factions/factionRegistry";
import { FactionType } from "../content/contentTypes";

/**
 * The guilds that are founded (spec 027 FR-018): occupational factions with a leader and at least
 * `minFoundingMembers` members who also belong to the settlement. Derived, never stored.
 *
 * @param engine - The engine.
 * @returns The faction ids ascending; none when there is no government.
 */
export function foundedGuilds(engine: GameEngine): EntityId[] {
  const government = governmentFactionId(engine);
  if (government === null) {
    return [];
  }
  const minimum = engine.content.constants.minFoundingMembers;
  return listFactions(engine)
    .filter((entity) => {
      const faction = getComponent(entity, factionComponent);
      if (faction === undefined || faction.factionType !== FactionType.Occupational) {
        return false;
      }
      if (faction.leaderId === null) {
        return false;
      }
      const settlers = membersOf(engine, entity.id).filter((member) =>
        isMember(engine, member.id, government),
      );
      return settlers.length >= minimum;
    })
    .map((entity) => entity.id);
}
