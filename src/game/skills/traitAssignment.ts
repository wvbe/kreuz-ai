import { getComponent } from "../ecs/Entity";
import { TraitModifierKind } from "../content/contentTypes";
import type { PrngStream } from "../engine/Prng";
import type { GameEngine } from "../engine/GameEngine";
import { modifierCoversSkill, traitsOf } from "./traitModifiers";
import { skillsComponent, traitsComponent } from "./skillsComponent";
import { maxSkillMilli, traitCountWeights, traitStreamName } from "./skillTypes";
import type { SkillContentView } from "./skillTypes";

/**
 * Draws a procedural trait set (spec 020 FR-004, D-20): a count of 1 to 3 weighted 50/35/15 and
 * capped by `traitSlots`, then that many distinct traits, uniform over the registry (ids
 * ascending), never two traits where either declares the other in `conflictsWith`. Fewer traits
 * are returned when the registry runs out of compatible ones.
 *
 * @param content - Content with the trait table.
 * @param stream - The `content.traits` stream.
 * @param traitSlots - Most traits the prototype allows, 1..3.
 * @returns Trait ids, ascending.
 */
export function drawTraitIds(
  content: SkillContentView,
  stream: PrngStream,
  traitSlots: number,
): string[] {
  const wanted = Math.min(stream.weighted([1, 2, 3], traitCountWeights), traitSlots);
  const chosen: string[] = [];
  for (let drawn = 0; drawn < wanted; drawn += 1) {
    const candidates = content.traits.ids().filter((id) => {
      if (chosen.includes(id)) {
        return false;
      }
      const candidate = content.traits.require(id);
      return !chosen.some(
        (other) =>
          candidate.conflictsWith.includes(other) ||
          content.traits.require(other).conflictsWith.includes(id),
      );
    });
    if (candidates.length === 0) {
      break;
    }
    chosen.push(stream.choice(candidates));
  }
  return chosen.sort();
}

/**
 * Finishes a freshly spawned character (call once, right after `store.spawn`): when the
 * prototype authors no traits (`defaultTraitIds`), draws them with {@link drawTraitIds} from the
 * `content.traits` stream, then adds every trait's `startingValueBonus` to its skills, clamped to
 * level 100 (FR-010). Entities without `Skills` and `Traits` components (items, walls, animals)
 * and prototypes that are not humanoids are left untouched.
 *
 * @param engine - The engine that owns the entity.
 * @param entityId - The new entity.
 */
export function initializeCharacter(engine: GameEngine, entityId: number): void {
  const entity = engine.store.require(entityId);
  const skills = getComponent(entity, skillsComponent);
  const traits = getComponent(entity, traitsComponent);
  const humanoid = engine.content.humanoids.find(entity.prototype);
  if (skills === undefined || traits === undefined || humanoid === undefined) {
    return;
  }
  if (traits.ids.length === 0 && humanoid.defaultTraitIds.length === 0) {
    traits.ids = drawTraitIds(
      engine.content,
      engine.prng.stream(traitStreamName),
      humanoid.traitSlots,
    );
  }
  for (const trait of traitsOf(engine.content, entity)) {
    for (const modifier of trait.modifiers) {
      if (modifier.kind !== TraitModifierKind.SkillAptitude || modifier.startingValueBonus === 0) {
        continue;
      }
      for (const skillId of engine.content.skills.ids()) {
        if (modifierCoversSkill(engine.content, modifier.skill, skillId)) {
          skills.values[skillId] = Math.min(
            maxSkillMilli,
            (skills.values[skillId] ?? 0) + modifier.startingValueBonus,
          );
        }
      }
    }
  }
}
