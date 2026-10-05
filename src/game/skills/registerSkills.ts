import { z } from "zod";
import { defineQuery } from "../api/defineQuery";
import { getComponent } from "../ecs/Entity";
import { InitMode } from "../engine/engineSystemTypes";
import type { GameEngine } from "../engine/GameEngine";
import { SkillError, SkillErrorKind } from "./SkillError";
import { applySkillWork, skillWorkCompletedSchema } from "./skillGrowth";
import { skillsComponent, traitsComponent } from "./skillsComponent";
import { skillWorkCompletedEvent } from "./skillTypes";
import { buildSkillsView, buildTraitsView } from "./skillViews";

/**
 * Id of the skills system (dependency name for systems that need `Skills` / `Traits`).
 */
export const skillsSystemId = "skills";

const registered = new WeakSet<GameEngine>();

const entityArgsSchema = z.object({ entityId: z.number().int().min(1) }).strict();

function validateReferences(engine: GameEngine): void {
  for (const entity of engine.store.entities()) {
    const skills = getComponent(entity, skillsComponent);
    for (const skillId of Object.keys(skills?.values ?? {})) {
      if (!engine.content.skills.has(skillId)) {
        throw new SkillError(
          SkillErrorKind.DanglingReference,
          `entity ${entity.id} has unknown skill "${skillId}"`,
        );
      }
    }
    for (const traitId of getComponent(entity, traitsComponent)?.ids ?? []) {
      if (!engine.content.traits.has(traitId)) {
        throw new SkillError(
          SkillErrorKind.DanglingReference,
          `entity ${entity.id} has unknown trait "${traitId}"`,
        );
      }
    }
  }
}

/**
 * Registers the skills and traits system with an engine through `engine.registerSystem` (once per
 * engine; the engine does it for itself, so every game has it). It owns the `Skills` and `Traits`
 * components (they are part of the entities section, so there is no save section of its own),
 * subscribes to `skill.work.completed` on the bus (growth runs while the queue drains at slot 20,
 * emitting `skill.increased`), validates skill and trait references of loaded entities (a dangling
 * id is a load error) and adds the queries `skills-of` and `traits-of` (`{entityId}`; `null` for
 * an unknown entity or one without the component).
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`.
 */
export function registerSkills(engine: GameEngine): void {
  if (registered.has(engine)) {
    return;
  }
  registered.add(engine);
  engine.registerSystem({
    id: skillsSystemId,
    components: [skillsComponent, traitsComponent],
    init: ({ engine: target, mode }) => {
      if (mode === InitMode.LoadGame) {
        validateReferences(target);
      }
    },
    queries: {
      "skills-of": defineQuery({
        schema: entityArgsSchema,
        run: ({ entityId }, target) => {
          const entity = target.store.get(entityId);
          return entity === undefined ? null : buildSkillsView(target.content, entity);
        },
      }),
      "traits-of": defineQuery({
        schema: entityArgsSchema,
        run: ({ entityId }, target) => {
          const entity = target.store.get(entityId);
          return entity === undefined ? null : buildTraitsView(target.content, entity);
        },
      }),
    },
  });
  engine.bus.subscribe(skillWorkCompletedEvent, (payload) => {
    const completed = skillWorkCompletedSchema.parse(payload);
    applySkillWork(engine, completed.entityId, completed.skillId);
  });
}
