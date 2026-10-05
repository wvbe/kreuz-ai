import { z } from "zod";
import { defineQuery } from "../api/defineQuery";
import { getComponent } from "../ecs/Entity";
import { InitMode } from "../engine/engineSystemTypes";
import type { GameEngine } from "../engine/GameEngine";
import { factionsSystemId } from "../factions/factionTypes";
import { skillsSystemId } from "../skills/registerSkills";
import { skillIncreasedEvent } from "../skills/skillTypes";
import type { SkillIncreased } from "../skills/skillTypes";
import { identityComponent } from "./identityComponent";
import { IdentityError, IdentityErrorKind } from "./IdentityError";
import { buildIdentityView } from "./identityViews";
import { identitySystemId } from "./identityTypes";
import { styledName } from "./styledName";
import { updateTitle } from "./updateTitle";

const registered = new WeakSet<GameEngine>();

const entityArgsSchema = z.object({ entityId: z.number().int().min(1) }).strict();

function validateReferences(engine: GameEngine): void {
  for (const entity of engine.store.entities()) {
    const identity = getComponent(entity, identityComponent);
    if (identity === undefined) {
      continue;
    }
    if (!engine.content.nameLists.has(identity.nameListId)) {
      throw new IdentityError(
        IdentityErrorKind.DanglingReference,
        `entity ${entity.id} has unknown name list "${identity.nameListId}"`,
      );
    }
    for (const skillId of [...identity.seenSkills, identity.titleSnapshot?.skillId ?? null]) {
      if (skillId !== null && !engine.content.skills.has(skillId)) {
        throw new IdentityError(
          IdentityErrorKind.DanglingReference,
          `entity ${entity.id} has unknown skill "${skillId}" in its identity`,
        );
      }
    }
  }
}

/**
 * Registers the identity system with an engine through `engine.registerSystem` (once per engine;
 * the engine does it for itself, and BEFORE the factions system, so that the before-delete hook
 * below reads the offices of a deleted leader before the factions hook empties `leaderId`). It owns
 * the `Identity` component (entities save section; the `identity.names` stream is saved with the
 * PRNG), registers a before-delete hook that supplies the styled name for `entity.deleted`
 * (DECISIONS D-17), recomputes titles on `skill.increased` and adds the query `identity-of`
 * (`{entityId}`; `null` for an unknown entity or one without identity).
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`.
 */
export function registerIdentity(engine: GameEngine): void {
  if (registered.has(engine)) {
    return;
  }
  registered.add(engine);
  engine.store.addBeforeDeleteHook((entity) => styledName(engine, entity));
  engine.registerSystem({
    id: identitySystemId,
    dependencies: [factionsSystemId, skillsSystemId],
    components: [identityComponent],
    init: ({ engine: target, mode }) => {
      if (mode === InitMode.LoadGame) {
        validateReferences(target);
      }
    },
    queries: {
      "identity-of": defineQuery({
        schema: entityArgsSchema,
        run: ({ entityId }, target) => {
          const entity = target.store.get(entityId);
          return entity === undefined ? null : buildIdentityView(target, entity);
        },
      }),
    },
  });
  engine.bus.subscribe<SkillIncreased>(skillIncreasedEvent, (payload) => {
    updateTitle(engine, payload.entityId);
  });
}
