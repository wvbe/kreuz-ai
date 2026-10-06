import { NotableMomentKind } from "../content/contentTypes";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { isMember, membersOf } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { skillLevel } from "../skills/skillLevels";
import { ticksPerDay } from "../time/GameTime";
import { chronicleOf } from "./chronicleOf";
import { recordMoment } from "./recordMoment";

type Leader = { entityId: EntityId; level: number };

// The member with the highest level of a skill at or above the minimum, ties to the lowest id.
function bestMember(engine: GameEngine, skillId: string, exceptId: EntityId | null): Leader | null {
  const government = governmentFactionId(engine);
  if (government === null) {
    return null;
  }
  let best: Leader | null = null;
  for (const member of membersOf(engine, government)) {
    const level = skillLevel(member, skillId);
    if (
      member.id !== exceptId &&
      level >= engine.content.constants.finestMinimumLevel &&
      (best === null || level > best.level)
    ) {
      best = { entityId: member.id, level };
    }
  }
  return best;
}

function nounOf(engine: GameEngine, skillId: string): string {
  return engine.content.skills.find(skillId)?.titleNoun ?? skillId;
}

/**
 * Updates the finest-holder table after a settlement citizen's skill rose (spec 028 FR-015): a
 * citizen at or above `finestMinimumLevel` who strictly exceeds the holder becomes the holder; a
 * tie changes nothing. `BecameFinest` for the new holder and `LostFinest` for the previous one are
 * recorded only when at least `finestCooldownDays` passed since the last announcement for the
 * skill, else the change is silent. A skill without an entry first looks for a member who already
 * leads (a settler who started skilled): that member is entered silently and a tie does not
 * displace it.
 *
 * @param engine - The engine.
 * @param entityId - The citizen whose skill rose.
 * @param skillId - The skill.
 * @param level - The new integer level.
 */
export function trackFinest(
  engine: GameEngine,
  entityId: EntityId,
  skillId: string,
  level: number,
): void {
  const chronicle = chronicleOf(engine);
  const government = governmentFactionId(engine);
  if (
    chronicle === null ||
    government === null ||
    level < engine.content.constants.finestMinimumLevel ||
    !isMember(engine, entityId, government)
  ) {
    return;
  }
  const tick = engine.time.tickCount;
  let entry = chronicle.finest.find((candidate) => candidate.skillId === skillId);
  if (entry?.entityId === entityId) {
    entry.level = level;
    return;
  }
  if (entry === undefined) {
    const incumbent = bestMember(engine, skillId, entityId);
    if (incumbent !== null && incumbent.level >= level) {
      chronicle.finest.push({
        skillId,
        entityId: incumbent.entityId,
        level: incumbent.level,
        sinceTick: tick,
        lastAnnouncedTick: 0,
      });
      chronicle.finest.sort((left, right) => left.skillId.localeCompare(right.skillId));
      return;
    }
  } else if (level <= entry.level) {
    return;
  }
  const previous = entry === undefined ? null : { ...entry };
  const announce =
    previous === null ||
    tick - previous.lastAnnouncedTick >= engine.content.constants.finestCooldownDays * ticksPerDay;
  if (entry === undefined) {
    entry = { skillId, entityId, level, sinceTick: tick, lastAnnouncedTick: tick };
    chronicle.finest.push(entry);
    chronicle.finest.sort((left, right) => left.skillId.localeCompare(right.skillId));
  } else {
    entry.entityId = entityId;
    entry.level = level;
    entry.sinceTick = tick;
    entry.lastAnnouncedTick = announce ? tick : entry.lastAnnouncedTick;
  }
  if (announce) {
    const params = { skillId, noun: nounOf(engine, skillId), level };
    recordMoment(engine, { kind: NotableMomentKind.BecameFinest, entityId, params });
    if (previous !== null) {
      recordMoment(engine, {
        kind: NotableMomentKind.LostFinest,
        entityId: previous.entityId,
        params: { ...params, level: previous.level },
      });
    }
  }
}

/**
 * Re-elects the holders whose citizen died or left the settlement (spec 028 FR-015): the member
 * with the highest level of the skill (ties lowest entity id, at least `finestMinimumLevel`)
 * becomes the holder without a moment; a skill nobody qualifies for loses its entry.
 *
 * @param engine - The engine.
 */
export function refreshFinest(engine: GameEngine): void {
  const chronicle = chronicleOf(engine);
  const government = governmentFactionId(engine);
  if (chronicle === null || government === null) {
    return;
  }
  const tick = engine.time.tickCount;
  chronicle.finest = chronicle.finest.flatMap((entry) => {
    if (engine.store.has(entry.entityId) && isMember(engine, entry.entityId, government)) {
      return [entry];
    }
    const best = bestMember(engine, entry.skillId, null);
    return best === null
      ? []
      : [{ ...entry, entityId: best.entityId, level: best.level, sinceTick: tick }];
  });
}
