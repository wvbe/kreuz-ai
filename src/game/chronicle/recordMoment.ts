import { NotableMomentKind } from "../content/contentTypes";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { CounterName } from "../engine/IdCounters";
import { isMember } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { identityComponent } from "../identity/identityComponent";
import { styledName } from "../identity/styledName";
import { chronicleOf } from "./chronicleOf";
import { MomentProminence, momentRecordedEvent, prominenceOfKind } from "./chronicleTypes";
import type { MomentInput, MomentRecord } from "./chronicleTypes";

/**
 * Appends a record to a journal and trims it to `journalCapacity`: when full, the oldest entry
 * other than `Arrived` goes (spec 028 FR-017); only a journal of nothing but `Arrived` entries
 * loses its oldest one.
 *
 * @param journal - The journal, oldest first (changed in place).
 * @param record - The new record.
 * @param capacity - `journalCapacity`.
 */
export function appendToJournal(
  journal: MomentRecord[],
  record: MomentRecord,
  capacity: number,
): void {
  journal.push(record);
  while (journal.length > capacity) {
    const index = journal.findIndex((entry) => entry.kind !== NotableMomentKind.Arrived);
    journal.splice(index === -1 ? 0 : index, 1);
  }
}

/**
 * Records one moment (spec 028 FR-013, FR-014, DECISIONS D-17): allocates the moment id, stamps
 * the tick and the styled name of the citizen at this moment, appends the record to the citizen's
 * journal (every kind except `Died`, whose journal dies with the citizen) and, when the kind is
 * Major, to the settlement chronicle (oldest dropped beyond `chronicleCapacity`), then queues
 * `chronicle.moment.recorded`. A moment about a citizen is only recorded for a named member of
 * the player government; the settlement moments (`entityId` null) always are.
 *
 * @param engine - The engine.
 * @param input - Kind, citizen and the typed params of the kind.
 * @returns The record, or null when nothing was recorded (no game, or the entity is no named
 *   settlement citizen).
 */
export function recordMoment(engine: GameEngine, input: MomentInput): MomentRecord | null {
  const chronicle = chronicleOf(engine);
  const government = governmentFactionId(engine);
  if (chronicle === null || government === null) {
    return null;
  }
  let nameSnapshot: string | null = null;
  const entity = input.entityId === null ? undefined : engine.store.get(input.entityId);
  const identity = entity === undefined ? undefined : getComponent(entity, identityComponent);
  if (input.entityId !== null) {
    if (
      entity === undefined ||
      identity === undefined ||
      identity.givenName === "" ||
      !isMember(engine, input.entityId, government)
    ) {
      return null;
    }
    nameSnapshot = styledName(engine, entity);
  }
  const momentId = engine.counters.allocate(CounterName.MomentId);
  chronicle.nextMomentId = momentId + 1;
  const prominence = prominenceOfKind[input.kind];
  const record: MomentRecord = {
    momentId,
    tick: engine.time.tickCount,
    kind: input.kind,
    prominence,
    entityId: input.entityId,
    nameSnapshot,
    params: { ...input.params },
  };
  if (identity !== undefined && input.kind !== NotableMomentKind.Died) {
    appendToJournal(identity.journal, record, engine.content.constants.journalCapacity);
  }
  if (prominence === MomentProminence.Major) {
    chronicle.moments.push(record);
    const excess = chronicle.moments.length - engine.content.constants.chronicleCapacity;
    if (excess > 0) {
      chronicle.moments.splice(0, excess);
    }
  }
  engine.bus.emit(momentRecordedEvent, record);
  return record;
}
