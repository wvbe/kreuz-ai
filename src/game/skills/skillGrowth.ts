import { z } from "zod";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { EventBus } from "../engine/EventBus";
import type { GameEngine } from "../engine/GameEngine";
import { SkillError, SkillErrorKind } from "./SkillError";
import { levelOfMilli, skillValueMilli } from "./skillLevels";
import { skillsComponent } from "./skillsComponent";
import { maxSkillMilli, skillIncreasedEvent, skillWorkCompletedEvent } from "./skillTypes";
import type { SkillContentView, SkillIncreased, SkillWorkCompleted } from "./skillTypes";
import { aptitudeMultiplierPermille } from "./traitModifiers";

/**
 * Validates the payload of `skill.work.completed`.
 */
export const skillWorkCompletedSchema = z
  .object({
    entityId: z.number().int().min(1),
    skillId: z.string().min(1),
  })
  .strict();

/**
 * Queues `skill.work.completed` for one completed claim. The system that executes a job calls this
 * once per claim: production for the crafter with the recipe skill, construction for the builder
 * (`construction`), gathering and hauling with the job type's `skillDomain`, trade for both
 * parties (`trading`), see DECISIONS D-08.
 *
 * @param bus - The engine's event bus.
 * @param entityId - The worker.
 * @param skillId - The skill the work trains.
 */
export function emitSkillWorkCompleted(bus: EventBus, entityId: number, skillId: string): void {
  const payload: SkillWorkCompleted = { entityId, skillId };
  bus.emit(skillWorkCompletedEvent, payload);
}

/**
 * Growth of one skill for one completed piece of work (D-20), in milli-percent:
 * `trunc(baseGrowth * aptitude * factor / 1e6)` where `aptitude` is the permille product of the
 * entity's aptitude traits and `factor` is the skill's `diminishingFactor` when the current level
 * is at or above `diminishingReturnsThreshold`, else 1000. The result is not capped here.
 *
 * @param content - Content with skill, trait and recipe tables.
 * @param entity - The worker.
 * @param skillId - The skill that grows.
 * @returns Milli-percent to add.
 */
export function growthDeltaMilli(
  content: SkillContentView,
  entity: Entity,
  skillId: string,
): number {
  const skill = content.skills.require(skillId);
  const level = levelOfMilli(skillValueMilli(entity, skillId));
  const factor = level >= skill.diminishingReturnsThreshold ? skill.diminishingFactor : 1000;
  const aptitude = aptitudeMultiplierPermille(content, entity, skillId);
  return Math.trunc((skill.baseGrowthPerCompletion * aptitude * factor) / 1_000_000);
}

/**
 * Applies one completed piece of work to a worker's skill: adds {@link growthDeltaMilli} capped at
 * 100000 and queues `skill.increased` when the integer level rises (spec 020 FR-006/FR-013). No
 * growth and no event at the cap, and skills never decrease. An entity that does not exist (any
 * more) or has no `Skills` component is ignored.
 *
 * @param engine - The engine whose store, content and bus are used.
 * @param entityId - The worker.
 * @param skillId - The skill the work trains; unknown ids throw `SkillError`.
 * @returns The new value in milli-percent, or null when nothing was applied.
 */
export function applySkillWork(
  engine: GameEngine,
  entityId: number,
  skillId: string,
): number | null {
  const skill = engine.content.skills.find(skillId);
  if (skill === undefined) {
    throw new SkillError(SkillErrorKind.UnknownSkill, `unknown skill "${skillId}"`);
  }
  const entity = engine.store.get(entityId);
  const skills = entity === undefined ? undefined : getComponent(entity, skillsComponent);
  if (entity === undefined || skills === undefined) {
    return null;
  }
  const current = skillValueMilli(entity, skill.id);
  if (current >= maxSkillMilli) {
    return current;
  }
  const next = Math.min(
    maxSkillMilli,
    current + growthDeltaMilli(engine.content, entity, skill.id),
  );
  skills.values[skill.id] = next;
  const oldLevel = levelOfMilli(current);
  const newLevel = levelOfMilli(next);
  if (newLevel > oldLevel) {
    const payload: SkillIncreased = {
      entityId,
      skillId: skill.id,
      oldValue: oldLevel,
      newValue: newLevel,
    };
    engine.bus.emit(skillIncreasedEvent, payload);
  }
  return next;
}
