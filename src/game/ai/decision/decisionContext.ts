import type { ContentRegistries } from "../../content/ContentRegistries";
import { getComponent } from "../../ecs/Entity";
import type { Entity, EntityId } from "../../ecs/Entity";
import { inventoryComponent } from "../../inventory/inventoryComponent";
import { getTotal } from "../../inventory/inventoryQueries";
import { neutralMoodMilli } from "../aiTypes";
import { moodComponent } from "../mood/moodComponent";
import { riskSuccessPermille } from "../mood/riskMapping";
import { isCritical } from "../needs/needMath";
import { needsComponent } from "../needs/needsComponent";
import { summarizeRelationships } from "../relationships/relationshipSummary";
import type { RelationshipSummary } from "../relationships/relationshipSummary";
import { needPriorityOrder } from "./rolePriority";

/**
 * How well off an entity is (DECISIONS D-25): by the coins it carries, with the thresholds of the
 * content constants.
 */
export enum WealthClass {
  Poor = "poor",
  Modest = "modest",
  Wealthy = "wealthy",
}

/**
 * One need as the decision sees it.
 */
export type DecisionNeed = {
  needId: string;
  valueMilli: number;
  criticalMilli: number;
  critical: boolean;
  /**
   * Position in the entity's need priority order, 0 = most important.
   */
  rank: number;
};

/**
 * Everything utility factors may read (spec 013 FR-011): needs, mood, relationships and wealth.
 * Plain data derived from game state, so equal state always gives an equal context.
 */
export type DecisionContext = {
  entityId: EntityId;
  tick: number;
  needs: DecisionNeed[];
  /**
   * Number of needs in the priority order (the highest `rank` plus one).
   */
  needCount: number;
  moodMilli: number;
  /**
   * Chance in permille that a risky action succeeds at this mood.
   */
  riskSuccessPermille: number;
  relationships: RelationshipSummary;
  coins: number;
  wealth: WealthClass;
};

/**
 * Classifies wealth by coins held.
 *
 * @param coins - Currency items carried.
 * @param poorCoins - Below this count: poor (`poorCoins` constant).
 * @param wealthyCoins - Above this count: wealthy (`wealthyCoins` constant).
 * @returns The class.
 */
export function wealthClassOf(coins: number, poorCoins: number, wealthyCoins: number): WealthClass {
  if (coins > wealthyCoins) {
    return WealthClass.Wealthy;
  }
  return coins < poorCoins ? WealthClass.Poor : WealthClass.Modest;
}

/**
 * Builds the decision context of an entity at a tick. Wealth is re-read every time (spec 013 US5:
 * a change is seen at the next decision).
 *
 * @param content - Content registries.
 * @param entity - The deciding entity.
 * @param tick - Current tick.
 * @returns The context.
 */
export function buildDecisionContext(
  content: ContentRegistries,
  entity: Entity,
  tick: number,
): DecisionContext {
  const order = needPriorityOrder(content, entity);
  const values = getComponent(entity, needsComponent)?.values ?? [];
  const needs: DecisionNeed[] = [];
  for (const value of values) {
    const need = content.needs.find(value.needId);
    if (need !== undefined) {
      needs.push({
        needId: need.id,
        valueMilli: value.valueMilli,
        criticalMilli: need.criticalThreshold,
        critical: isCritical(need, value.valueMilli),
        rank: order.indexOf(need.id),
      });
    }
  }
  const moodMilli = getComponent(entity, moodComponent)?.valueMilli ?? neutralMoodMilli;
  const coins = getComponent(entity, inventoryComponent)
    ? getTotal(entity, content.materials.currencyId)
    : 0;
  return {
    entityId: entity.id,
    tick,
    needs,
    needCount: order.length,
    moodMilli,
    riskSuccessPermille: riskSuccessPermille(moodMilli),
    relationships: summarizeRelationships(entity),
    coins,
    wealth: wealthClassOf(coins, content.constants.poorCoins, content.constants.wealthyCoins),
  };
}
