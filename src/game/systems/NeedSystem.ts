/**
 * Need system: need decay per tick, satisfaction, and urgency thresholds.
 */

import type { GameState } from "../engine/GameLoop.js";
import { getEntitiesWithComponent, getComponent } from "../engine/EntityManager.js";

export type Need = {
  needId: string;
  value: number;
  decayRate: number;
  urgencyThreshold: number;
  criticalThreshold: number;
};

export type NeedsComponent = {
  needs: Need[];
};

/**
 * Creates a standard needs component for a colonist.
 */
export function createColonistNeeds(): NeedsComponent {
  return {
    needs: [
      { needId: "hunger", value: 1.0, decayRate: 0.002, urgencyThreshold: 0.3, criticalThreshold: 0.1 },
      { needId: "thirst", value: 1.0, decayRate: 0.003, urgencyThreshold: 0.3, criticalThreshold: 0.1 },
      { needId: "rest", value: 1.0, decayRate: 0.001, urgencyThreshold: 0.25, criticalThreshold: 0.05 },
      { needId: "social", value: 0.8, decayRate: 0.0005, urgencyThreshold: 0.2, criticalThreshold: 0.05 },
      { needId: "comfort", value: 0.7, decayRate: 0.0008, urgencyThreshold: 0.2, criticalThreshold: 0.05 },
      { needId: "spiritual", value: 0.6, decayRate: 0.0003, urgencyThreshold: 0.15, criticalThreshold: 0.03 },
    ],
  };
}

/**
 * Updates all entity needs by decaying values each tick.
 */
export function updateNeeds(state: GameState): void {
  const entities = getEntitiesWithComponent(state.entities, "needs");
  for (const entityId of entities) {
    const needs = getComponent(state.entities, entityId, "needs") as NeedsComponent | undefined;
    if (!needs) continue;
    for (const need of needs.needs) {
      need.value = Math.max(0, need.value - need.decayRate);
    }
  }
}

/**
 * Satisfies a need for an entity by adding to its value.
 */
export function satisfyNeed(
  needs: NeedsComponent,
  needId: string,
  amount: number,
): void {
  const need = needs.needs.find((n) => n.needId === needId);
  if (need) {
    need.value = Math.min(1.0, need.value + amount);
  }
}

/**
 * Gets the most urgent need for an entity.
 */
export function getMostUrgentNeed(needs: NeedsComponent): Need | undefined {
  const urgent = needs.needs
    .filter((need) => need.value <= need.urgencyThreshold)
    .sort((a, b) => a.value - b.value);
  return urgent[0];
}

/**
 * Checks if any need is critical.
 */
export function hasCriticalNeed(needs: NeedsComponent): boolean {
  return needs.needs.some((need) => need.value <= need.criticalThreshold);
}
