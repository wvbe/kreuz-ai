import { TierRequirementKind } from "../content/contentTypes";
import type { SettlementTierContent } from "../content/schemas/tableSchemas";
import type { GameEngine } from "../engine/GameEngine";
import { membersOf } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { activeZonesOfType } from "../zones/zoneQueries";
import { foundedGuilds } from "./foundedGuilds";
import { getSettlementService } from "./settlementServiceRegistry";
import { settlementProgressOf } from "./settlementProgressOf";
import type { RequirementProgress } from "./settlementTypes";

/**
 * One authored requirement of a tier (`settlement-tiers.json`).
 */
export type TierRequirement = SettlementTierContent["requirements"][number];

/**
 * The settlement's population (spec 027 FR-017): the members of the government faction.
 *
 * @param engine - The engine.
 * @returns The number of living members.
 */
export function settlementPopulation(engine: GameEngine): number {
  const government = governmentFactionId(engine);
  return government === null ? 0 : membersOf(engine, government).length;
}

/**
 * Computes the status of one tier requirement now (spec 027 FR-003, FR-006): population counts the
 * members of the government faction, a dwelling requirement asks the housing hook
 * (`countDwellingsAtOrAbove`, task 4.5), an active-zone requirement counts the active zones of the
 * listed types, guilds are the founded ones and a milestone is met when it is recorded.
 *
 * @param engine - The engine.
 * @param requirement - The authored requirement.
 * @returns Its kind, parameters, `current` / `target`, `met` and a one-line label.
 */
export function evaluateRequirement(
  engine: GameEngine,
  requirement: TierRequirement,
): RequirementProgress {
  switch (requirement.kind) {
    case TierRequirementKind.Population: {
      const current = settlementPopulation(engine);
      return {
        kind: requirement.kind,
        params: {},
        current,
        target: requirement.min,
        met: current >= requirement.min,
        label: `population ${current}/${requirement.min}`,
      };
    }
    case TierRequirementKind.DwellingsAtLevel: {
      const current = getSettlementService(engine).countDwellingsAtOrAbove(requirement.level);
      return {
        kind: requirement.kind,
        params: { level: requirement.level },
        current,
        target: requirement.min,
        met: current >= requirement.min,
        label: `dwellings of level ${requirement.level} or better ${current}/${requirement.min}`,
      };
    }
    case TierRequirementKind.ActiveZone: {
      const current = requirement.zoneTypeIds.reduce(
        (sum, zoneTypeId) => sum + activeZonesOfType(engine, zoneTypeId).length,
        0,
      );
      return {
        kind: requirement.kind,
        params: { zoneTypeIds: [...requirement.zoneTypeIds] },
        current,
        target: requirement.min,
        met: current >= requirement.min,
        label: `active ${requirement.zoneTypeIds.join(" or ")} zone ${current}/${requirement.min}`,
      };
    }
    case TierRequirementKind.FoundedGuilds: {
      const current = foundedGuilds(engine).length;
      return {
        kind: requirement.kind,
        params: {},
        current,
        target: requirement.min,
        met: current >= requirement.min,
        label: `founded guilds ${current}/${requirement.min}`,
      };
    }
    case TierRequirementKind.MilestoneReached: {
      const reached =
        settlementProgressOf(engine)?.milestones.some(
          (record) => record.milestone === requirement.milestone,
        ) ?? false;
      return {
        kind: requirement.kind,
        params: { milestone: requirement.milestone },
        current: reached ? 1 : 0,
        target: 1,
        met: reached,
        label: `milestone ${requirement.milestone} ${reached ? "reached" : "not yet"}`,
      };
    }
  }
}
