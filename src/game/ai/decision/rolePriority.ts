import type { ContentRegistries } from "../../content/ContentRegistries";
import type { Entity } from "../../ecs/Entity";
import { dominantSkill } from "../../skills/skillLevels";
import { KnownNeed } from "../aiTypes";

/**
 * The role profiles that reorder need priorities (spec 013 FR-003). A role is derived, never
 * stored: there is no occupation component.
 */
export enum Role {
  /**
   * Safety before everything: a character whose dominant skill is `combat`.
   */
  Guard = "guard",
  /**
   * Social contact and trust first: a prototype that `sellsItems`.
   */
  Merchant = "merchant",
  /**
   * Everybody else: hunger first.
   */
  Worker = "worker",
}

/**
 * The part of the content registries the role functions read, so tests can pass small tables.
 */
export type RoleContentView = {
  readonly humanoids: ContentRegistries["humanoids"];
  readonly needs: ContentRegistries["needs"];
};

/**
 * Skill id that makes a character a guard.
 */
export const guardSkillId = "combat";

const roleLeadingNeeds: { [role in Role]: readonly string[] } = {
  [Role.Guard]: [KnownNeed.Safety, KnownNeed.Rest, KnownNeed.Hunger, KnownNeed.Social],
  [Role.Merchant]: [KnownNeed.Social, KnownNeed.Hunger, KnownNeed.Rest, KnownNeed.Safety],
  [Role.Worker]: [KnownNeed.Hunger, KnownNeed.Rest, KnownNeed.Safety, KnownNeed.Social],
};

/**
 * Derives the role of an entity from its prototype and skills: a prototype that `sellsItems` is a
 * Merchant, a character whose dominant skill is {@link guardSkillId} is a Guard, anybody else a
 * Worker. The role is stable until skills or traits change.
 *
 * @param content - Content with the humanoid table.
 * @param entity - Entity to classify.
 * @returns The role.
 */
export function roleOf(content: RoleContentView, entity: Entity): Role {
  if (content.humanoids.find(entity.prototype)?.sellsItems === true) {
    return Role.Merchant;
  }
  return dominantSkill(entity) === guardSkillId ? Role.Guard : Role.Worker;
}

/**
 * The need priority order of an entity (spec 013 FR-003, DECISIONS D-25): the prototype's own
 * `needPriority` when it authors one, otherwise the leading needs of its {@link Role}; every
 * other need of the pack follows in the registry's file order. Needs the pack lacks are skipped.
 *
 * @param content - Content with the need and humanoid tables.
 * @param entity - Entity whose order is wanted.
 * @returns Need ids, most important first, covering every need of the pack exactly once.
 */
export function needPriorityOrder(content: RoleContentView, entity: Entity): string[] {
  const authored = content.humanoids.find(entity.prototype)?.needPriority;
  const leading = authored ?? roleLeadingNeeds[roleOf(content, entity)];
  const order: string[] = [];
  for (const needId of [...leading, ...content.needs.all().map((need) => need.id)]) {
    if (content.needs.has(needId) && !order.includes(needId)) {
      order.push(needId);
    }
  }
  return order;
}
