import { getComponent } from "../../ecs/Entity";
import type { Entity } from "../../ecs/Entity";
import { truncDiv } from "../../engine/fixedPoint";
import { maxRelationshipHistory, maxRelationships } from "../aiTypes";
import type { RelationshipEntry } from "../aiTypes";
import { relationshipsComponent } from "./relationshipsComponent";

/**
 * Ticks without interaction after which half of a personal affinity has faded (spec 013 FR-007,
 * DECISIONS D-210): recent interactions weigh more than old ones.
 */
export const relationshipHalfLifeTicks = 200;

const affinityLimitMilli = 100_000;

/**
 * Records one interaction (gift, conflict, broken contract, family tie, ...) of `entity` with
 * `otherId` (spec 013 FR-007): moves the affinity by `deltaMilli` (clamped to the affinity range),
 * appends the event to the history (the oldest record drops beyond the cap) and stamps `lastTick`.
 * A new relationship evicts the one with the oldest `lastTick` when the entity is at its limit.
 * Relationships are asymmetric: the other entity is not touched.
 *
 * @param entity - Entity that remembers; one without a `Relationships` component is ignored.
 * @param otherId - The entity the interaction was with.
 * @param kind - Label of the interaction, e.g. `gift` or `contract_broken`.
 * @param deltaMilli - Signed milli affinity change.
 * @param tick - Current tick.
 * @returns The updated entry, or null without the component.
 */
export function recordRelationshipEvent(
  entity: Entity,
  otherId: number,
  kind: string,
  deltaMilli: number,
  tick: number,
): RelationshipEntry | null {
  const data = getComponent(entity, relationshipsComponent);
  if (data === undefined) {
    return null;
  }
  let entry = data.entries.find((candidate) => candidate.otherId === otherId);
  if (entry === undefined) {
    if (data.entries.length >= maxRelationships) {
      let oldest = data.entries[0] as RelationshipEntry;
      for (const candidate of data.entries) {
        if (candidate.lastTick < oldest.lastTick) {
          oldest = candidate;
        }
      }
      data.entries = data.entries.filter((candidate) => candidate !== oldest);
    }
    entry = { otherId, affinityMilli: 0, lastTick: tick, history: [] };
    data.entries.push(entry);
    data.entries.sort((a, b) => a.otherId - b.otherId);
  }
  entry.affinityMilli = Math.max(
    -affinityLimitMilli,
    Math.min(affinityLimitMilli, entry.affinityMilli + deltaMilli),
  );
  entry.history.push({ kind, deltaMilli, tick });
  if (entry.history.length > maxRelationshipHistory) {
    entry.history.splice(0, entry.history.length - maxRelationshipHistory);
  }
  entry.lastTick = tick;
  return entry;
}

/**
 * The affinity an entry has at `tick`: the stored value faded towards 0 by the time since the last
 * interaction (`affinity * halfLife / (halfLife + elapsed)`, integer, half after
 * {@link relationshipHalfLifeTicks}).
 *
 * @param entry - A relationship entry.
 * @param tick - Current tick.
 * @returns Milli affinity, same sign as the stored value.
 */
export function effectiveAffinityMilli(entry: RelationshipEntry, tick: number): number {
  const elapsed = Math.max(0, tick - entry.lastTick);
  return truncDiv(
    entry.affinityMilli * relationshipHalfLifeTicks,
    relationshipHalfLifeTicks + elapsed,
  );
}
