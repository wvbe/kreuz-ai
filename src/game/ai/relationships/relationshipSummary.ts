import { getComponent } from "../../ecs/Entity";
import type { Entity } from "../../ecs/Entity";
import { truncDiv } from "../../engine/fixedPoint";
import { relationshipsComponent } from "./relationshipsComponent";

/**
 * What the decision context knows about an entity's relationships.
 */
export type RelationshipSummary = {
  /**
   * Number of remembered relationships.
   */
  count: number;
  /**
   * Integer mean of the personal affinities (milli, `-100000..100000`), 0 without relationships.
   */
  meanAffinityMilli: number;
};

/**
 * Summarises the `Relationships` of an entity for the decision context (spec 013 FR-011).
 *
 * @param entity - Entity to read; one without the component has no relationships.
 * @returns Count and mean affinity.
 */
export function summarizeRelationships(entity: Entity): RelationshipSummary {
  const entries = getComponent(entity, relationshipsComponent)?.entries ?? [];
  if (entries.length === 0) {
    return { count: 0, meanAffinityMilli: 0 };
  }
  const total = entries.reduce((sum, entry) => sum + entry.affinityMilli, 0);
  return { count: entries.length, meanAffinityMilli: truncDiv(total, entries.length) };
}
