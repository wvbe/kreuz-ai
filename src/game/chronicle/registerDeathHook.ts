import { NotableMomentKind } from "../content/contentTypes";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { identityComponent } from "../identity/identityComponent";
import { recordMoment } from "./recordMoment";
import type { MomentRecord } from "./chronicleTypes";

/**
 * How many of the last journal entries the `Died` moment keeps.
 */
export const journalExcerptLength = 4;

/**
 * The excerpt of a journal that is kept in the `Died` moment: the kinds of its last
 * {@link journalExcerptLength} entries, oldest first, `kind` or `kind:skillId`, comma separated.
 *
 * @param journal - The journal, oldest first.
 * @returns The excerpt; empty for an empty journal.
 */
export function journalExcerpt(journal: readonly MomentRecord[]): string {
  return journal
    .slice(-journalExcerptLength)
    .map((entry) => {
      const skillId = entry.params["skillId"];
      return skillId === undefined ? entry.kind : `${entry.kind}:${skillId}`;
    })
    .join(",");
}

/**
 * Registers the delete hook that records `Died` (spec 028 FR-013, DECISIONS D-17). The entity
 * store calls its hooks synchronously before it removes an entity and queues `entity.deleted`; at
 * that moment the citizen still has its `Identity`, its offices and its membership (afterwards
 * the membership that makes it a settlement citizen is gone), so the moment carries exactly the
 * styled name that `entity.deleted` carries and an excerpt of the journal that dies with the
 * citizen. The hook must be registered before the factions hook, which empties `leaderId`. Only
 * members of the player government get a moment.
 *
 * @param engine - The engine.
 */
export function registerDeathHook(engine: GameEngine): void {
  engine.store.addBeforeDeleteHook((entity) => {
    const identity = getComponent(entity, identityComponent);
    if (identity !== undefined) {
      recordMoment(engine, {
        kind: NotableMomentKind.Died,
        entityId: entity.id,
        params: { journalExcerpt: journalExcerpt(identity.journal) },
      });
    }
    return null;
  });
}
