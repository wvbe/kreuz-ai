import { z } from "zod";
import {
  FactionType,
  FurnitureRefKind,
  MilestoneKind,
  SettlementTier,
  TierRequirementKind,
} from "../content/contentTypes";
import type { ContentRegistries } from "../content/ContentRegistries";
import type { FurnitureContent, ZoneTypeContent } from "../content/schemas/economySchemas";
import type { SettlementTierContent } from "../content/schemas/tableSchemas";
import { startingStockpileKit } from "../worldgen/spawnSettlers";
import { marketZoneTypeId, throneRoomZoneTypeId, worshipZoneTypeIds } from "./settlementTypes";
import { orderedTiers, tierRank } from "./tierOrder";

/**
 * What a reachability finding is about.
 */
export enum ReachabilityIssueKind {
  /**
   * A requirement of a tier cannot be met with only the content unlocked below that tier (a zone
   * type, furniture, recipe, material or dwelling level is missing or unlocks too late).
   */
  RequirementUnreachable = "requirement-unreachable",
  /**
   * A recipe unlocks at a lower tier than its workstation furniture or its room zone type (spec
   * 027 FR-011).
   */
  RecipeBelowWorkstation = "recipe-below-workstation",
  /**
   * A trader's refine rule cannot work: no unlocked source of the raw material or the trader does
   * not buy it (DECISIONS D-13, D-16).
   */
  RefinedPathBroken = "refined-path-broken",
}

/**
 * One finding of {@link validateTierReachability}: it names the tier, the requirement and what is
 * missing (spec 027 FR-010, DECISIONS D-16).
 */
export type TierReachabilityIssue = {
  kind: ReachabilityIssueKind;
  tier: SettlementTier;
  /**
   * The requirement (`active_zone throne_room`) or the content record the finding is about.
   */
  requirement: string;
  /**
   * The first missing thing (a material, furniture, zone or level id), when one can be named.
   */
  missing: string | null;
  message: string;
};

const traderOffersSchema = z.object({
  sells: z.array(z.object({ materialId: z.string() })).default([]),
  buys: z.array(z.string()).default([]),
  refines: z
    .array(z.object({ rawMaterialId: z.string(), refinedMaterialId: z.string() }))
    .default([]),
});

type TraderOffers = z.infer<typeof traderOffersSchema> & { prototypeId: string };

function traderOffersOf(content: ContentRegistries): TraderOffers[] {
  return content.enginePrototypes.all().flatMap((prototype) => {
    const parsed = traderOffersSchema.safeParse(prototype.components?.["Trader"]);
    return prototype.components?.["Trader"] !== undefined && parsed.success
      ? [{ ...parsed.data, prototypeId: prototype.id }]
      : [];
  });
}

/**
 * What can be made or bought using only the content unlocked at or below one tier. Every question
 * returns null for "yes" or the first reason for "no".
 */
class Availability {
  private readonly maxRank: number;
  private readonly materialMemo = new Map<string, string | null>();

  constructor(
    private readonly content: ContentRegistries,
    private readonly traders: readonly TraderOffers[],
    maxTier: SettlementTier,
    private readonly bootstrapIds: ReadonlySet<string> = new Set(),
  ) {
    this.maxRank = tierRank(maxTier);
  }

  private unlocked(tier: SettlementTier | undefined): boolean {
    return tierRank(tier ?? SettlementTier.Hamlet) <= this.maxRank;
  }

  private furnitureReason(furniture: FurnitureContent, path: ReadonlySet<string>): string | null {
    if (!this.unlocked(furniture.unlockTier)) {
      return `furniture ${furniture.id} unlocks at ${furniture.unlockTier ?? ""}`;
    }
    for (const material of furniture.constructionMaterials) {
      const reason = this.materialReason(material.materialId, path);
      if (reason !== null) {
        return `furniture ${furniture.id} needs ${material.materialId}: ${reason}`;
      }
    }
    return null;
  }

  furnitureRefReason(
    kind: FurnitureRefKind,
    ref: string,
    path: ReadonlySet<string> = new Set(),
  ): string | null {
    const candidates = this.content.furniture
      .all()
      .filter((piece) =>
        kind === FurnitureRefKind.Id ? piece.id === ref : piece.tags.includes(ref),
      );
    if (candidates.length === 0) {
      return `no furniture with ${kind} ${ref}`;
    }
    let first: string | null = null;
    for (const piece of candidates) {
      const reason = this.furnitureReason(piece, path);
      if (reason === null) {
        return null;
      }
      first ??= reason;
    }
    return first;
  }

  private zoneRecordReason(zone: ZoneTypeContent, path: ReadonlySet<string>): string | null {
    if (!this.unlocked(zone.unlockTier)) {
      return `zone ${zone.id} unlocks at ${zone.unlockTier ?? ""}`;
    }
    for (const requirement of zone.furnitureRequirements) {
      const reasons = requirement.map((alternative) =>
        this.furnitureRefReason(alternative.kind, alternative.ref, path),
      );
      if (!reasons.includes(null)) {
        return `zone ${zone.id}: ${reasons[0] ?? "no furniture"}`;
      }
    }
    return null;
  }

  zoneReason(zoneTypeId: string, path: ReadonlySet<string> = new Set()): string | null {
    const zone = this.content.zones.find(zoneTypeId);
    return zone === undefined ? `no zone type ${zoneTypeId}` : this.zoneRecordReason(zone, path);
  }

  private recipeReason(recipeId: string, path: ReadonlySet<string>): string | null {
    const recipe = this.content.recipes.require(recipeId);
    if (!this.unlocked(recipe.unlockTier)) {
      return `recipe ${recipe.id} unlocks at ${recipe.unlockTier ?? ""}`;
    }
    const station = this.furnitureRefReason(FurnitureRefKind.Tag, recipe.workstationTag, path);
    if (station !== null) {
      return `recipe ${recipe.id}: ${station}`;
    }
    if (recipe.roomZoneId !== undefined) {
      const room = this.zoneReason(recipe.roomZoneId, path);
      if (room !== null) {
        return `recipe ${recipe.id}: ${room}`;
      }
    }
    for (const input of [
      ...recipe.inputs.map((item) => item.materialId),
      ...recipe.toolMaterialIds,
    ]) {
      const reason = this.materialReason(input, path);
      if (reason !== null) {
        return `recipe ${recipe.id} needs ${input}: ${reason}`;
      }
    }
    return null;
  }

  /**
   * Whether a material can be obtained: gathered by an unlocked job, harvested from terrain or a
   * zone, bought from a trader, bought as the refined good of a raw material that can be gathered
   * and sold, or crafted by an unlocked recipe whose workstation, room and inputs are available.
   *
   * @param materialId - A material id.
   * @param path - Materials being resolved (cycle guard).
   * @returns Null when obtainable, else why not.
   */
  materialReason(materialId: string, path: ReadonlySet<string> = new Set()): string | null {
    const known = this.materialMemo.get(materialId);
    if (known !== undefined) {
      return known;
    }
    if (path.has(materialId)) {
      // a cycle (planks need a sawmill that needs planks) is broken by the founders' kit
      return this.bootstrapIds.has(materialId) ? null : `${materialId} is part of a cycle`;
    }
    const inner = new Set(path).add(materialId);
    const reason = this.computeMaterialReason(materialId, inner);
    this.materialMemo.set(materialId, reason);
    return reason;
  }

  private computeMaterialReason(materialId: string, path: ReadonlySet<string>): string | null {
    // a gathering job lists its outputs (farm.harvest wheat, mine.ore iron ore); terrain and
    // crops alone are no source without an unlocked job that works them
    const gathered = this.content.jobs
      .all()
      .some(
        (job) =>
          this.unlocked(job.unlockTier) &&
          job.outputs.some((output) => output.materialId === materialId),
      );
    if (
      gathered ||
      this.traders.some((trader) => trader.sells.some((sold) => sold.materialId === materialId))
    ) {
      return null;
    }
    for (const trader of this.traders) {
      for (const rule of trader.refines) {
        if (
          rule.refinedMaterialId === materialId &&
          trader.buys.includes(rule.rawMaterialId) &&
          this.materialReason(rule.rawMaterialId, path) === null
        ) {
          return null;
        }
      }
    }
    const recipes = this.content.recipes
      .all()
      .filter((recipe) => recipe.outputs.some((output) => output.materialId === materialId));
    let first: string | null = null;
    for (const recipe of recipes) {
      const reason = this.recipeReason(recipe.id, path);
      if (reason === null) {
        return null;
      }
      first ??= reason;
    }
    return first ?? `no source for ${materialId}`;
  }
}

function describeRequirement(requirement: SettlementTierContent["requirements"][number]): string {
  switch (requirement.kind) {
    case TierRequirementKind.Population:
      return `population ${requirement.min}`;
    case TierRequirementKind.DwellingsAtLevel:
      return `dwellings_at_level ${requirement.level} x${requirement.min}`;
    case TierRequirementKind.ActiveZone:
      return `active_zone ${requirement.zoneTypeIds.join("|")}`;
    case TierRequirementKind.FoundedGuilds:
      return `founded_guilds ${requirement.min}`;
    case TierRequirementKind.MilestoneReached:
      return `milestone_reached ${requirement.milestone}`;
  }
}

function guildCount(content: ContentRegistries): number {
  return content.factions
    .all()
    .filter(
      (faction) =>
        faction.factionType === FactionType.Occupational &&
        faction.membership !== undefined &&
        content.skills.has(faction.membership.skillId),
    ).length;
}

function milestoneReason(
  content: ContentRegistries,
  available: Availability,
  milestone: MilestoneKind,
): string | null {
  switch (milestone) {
    case MilestoneKind.ThroneRoomEstablished:
      return available.zoneReason(throneRoomZoneTypeId);
    case MilestoneKind.FirstWorshipSpace: {
      const reasons = worshipZoneTypeIds.map((zoneId) => available.zoneReason(zoneId));
      return reasons.includes(null) ? null : (reasons[0] ?? "no worship zone");
    }
    case MilestoneKind.FirstMarket:
      return available.zoneReason(marketZoneTypeId);
    case MilestoneKind.FirstGuildFounded:
      return guildCount(content) > 0 ? null : "no guild in the content pack";
    case MilestoneKind.FirstMasterCraftsman:
      return content.factions.all().some((faction) => faction.masterSkillThreshold !== undefined)
        ? null
        : "no guild has a masterSkillThreshold";
    case MilestoneKind.FirstTradeAgreement:
      return content.factions.all().some((faction) => faction.npc !== undefined)
        ? null
        : "no NPC faction to agree with";
    case MilestoneKind.FirstDwellingUpgrade:
      return content.dwellingLevels.all().length > 1 ? null : "fewer than two dwelling levels";
  }
}

function requirementReason(
  content: ContentRegistries,
  available: Availability,
  requirement: SettlementTierContent["requirements"][number],
  previous: SettlementTier,
): string | null {
  switch (requirement.kind) {
    case TierRequirementKind.Population:
      return null;
    case TierRequirementKind.ActiveZone: {
      const reasons = requirement.zoneTypeIds.map((zoneId) => available.zoneReason(zoneId));
      return reasons.includes(null) ? null : (reasons[0] ?? "no zone type listed");
    }
    case TierRequirementKind.DwellingsAtLevel: {
      const level = content.dwellingLevels.find(requirement.level);
      if (level === undefined) {
        return `no dwelling level ${requirement.level}`;
      }
      if (tierRank(level.unlockTier ?? SettlementTier.Hamlet) > tierRank(previous)) {
        return `dwelling level ${level.level} unlocks at ${level.unlockTier ?? ""}`;
      }
      const zone = available.zoneReason("dwelling");
      if (zone !== null) {
        return zone;
      }
      for (const entry of level.furniture) {
        const reason = available.furnitureRefReason(entry.kind, entry.ref);
        if (reason !== null) {
          return `dwelling level ${level.level}: ${reason}`;
        }
      }
      for (const supplied of level.suppliedGoods) {
        const reasons = supplied.materialIds.map((id) => available.materialReason(id));
        if (!reasons.includes(null)) {
          return `dwelling level ${level.level} supplies ${supplied.materialIds.join("|")}: ${reasons[0] ?? ""}`;
        }
      }
      return null;
    }
    case TierRequirementKind.FoundedGuilds:
      return guildCount(content) >= requirement.min
        ? null
        : `needs ${requirement.min} guilds, the content pack has ${guildCount(content)}`;
    case TierRequirementKind.MilestoneReached:
      return milestoneReason(content, available, requirement.milestone);
  }
}

const missingPatterns: readonly RegExp[] = [
  /no source for ([a-z0-9_]+)/,
  /([a-z0-9_]+) is part of a cycle/,
  /(?:zone|furniture|recipe|dwelling level) ([a-z0-9_]+) unlocks at/,
  /no (?:zone type|dwelling level|furniture with (?:id|tag)) ([a-z0-9_]+)/,
];

function missingOf(reason: string): string | null {
  for (const pattern of missingPatterns) {
    const match = pattern.exec(reason);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return null;
}

/**
 * Proves from content data alone that every tier is reachable from a Hamlet start (spec 027
 * FR-010/FR-011, DECISIONS D-16 and the owner decision on iron): for each tier above Hamlet, every
 * requirement must be satisfiable using only content unlocked at or below the previous tier.
 * That means the required zone types exist and unlock earlier, their furniture is buildable, every
 * construction material and recipe input can be gathered, bought, crafted at an unlocked
 * workstation and room, or obtained through a trader's refined-credit rule (a raw material
 * gathered by an unlocked job, sold to a trader that buys it and refines it: ore to iron ingots).
 * Smelter and Forge stay at Village, so nothing in the Hamlet chain may need their output
 * directly. It also reports recipes that unlock below their workstation or room (FR-011) and
 * refine rules whose raw material has no source or is not bought.
 *
 * @param content - The content registries to check.
 * @param bootstrapMaterialIds - Materials the founders' kit supplies (default: the world
 *   generator's `startingStockpileKit`); a production cycle through one of them (planks and the
 *   sawmill) is accepted because the first unit exists at the start.
 * @returns The findings, empty when every tier is reachable; each names the tier, the requirement
 *   and what is missing.
 */
export function validateTierReachability(
  content: ContentRegistries,
  bootstrapMaterialIds: ReadonlySet<string> = new Set(
    startingStockpileKit.map((item) => item.materialId),
  ),
): TierReachabilityIssue[] {
  const issues: TierReachabilityIssue[] = [];
  const traders = traderOffersOf(content);
  for (let rank = 1; rank < orderedTiers.length; rank += 1) {
    const tier = orderedTiers[rank] ?? SettlementTier.Hamlet;
    const previous = orderedTiers[rank - 1] ?? SettlementTier.Hamlet;
    const available = new Availability(content, traders, previous, bootstrapMaterialIds);
    const record = content.settlementTiers.find(tier);
    for (const requirement of record?.requirements ?? []) {
      const reason = requirementReason(content, available, requirement, previous);
      if (reason !== null) {
        issues.push({
          kind: ReachabilityIssueKind.RequirementUnreachable,
          tier,
          requirement: describeRequirement(requirement),
          missing: missingOf(reason),
          message: `${tier} is unreachable: ${describeRequirement(requirement)} cannot be met from content unlocked below it (${reason})`,
        });
      }
    }
  }
  for (const recipe of content.recipes.all()) {
    const recipeRank = tierRank(recipe.unlockTier ?? SettlementTier.Hamlet);
    const stationRanks = content.furniture
      .all()
      .filter((piece) => piece.tags.includes(recipe.workstationTag))
      .map((piece) => tierRank(piece.unlockTier ?? SettlementTier.Hamlet));
    const roomRank =
      recipe.roomZoneId === undefined
        ? 0
        : tierRank(content.zones.find(recipe.roomZoneId)?.unlockTier ?? SettlementTier.Hamlet);
    if (
      (stationRanks.length > 0 && recipeRank < Math.min(...stationRanks)) ||
      recipeRank < roomRank
    ) {
      issues.push({
        kind: ReachabilityIssueKind.RecipeBelowWorkstation,
        tier: recipe.unlockTier ?? SettlementTier.Hamlet,
        requirement: `recipe ${recipe.id}`,
        missing: recipe.workstationTag,
        message: `recipe ${recipe.id} unlocks before its workstation (${recipe.workstationTag}) or room zone`,
      });
    }
  }
  const hamlet = new Availability(content, [], SettlementTier.Hamlet, bootstrapMaterialIds);
  for (const trader of traders) {
    for (const rule of trader.refines) {
      const source = hamlet.materialReason(rule.rawMaterialId);
      if (source !== null || !trader.buys.includes(rule.rawMaterialId)) {
        issues.push({
          kind: ReachabilityIssueKind.RefinedPathBroken,
          tier: SettlementTier.Hamlet,
          requirement: `${trader.prototypeId} refines ${rule.rawMaterialId} -> ${rule.refinedMaterialId}`,
          missing: rule.rawMaterialId,
          message:
            source !== null
              ? `${rule.rawMaterialId} has no source at Hamlet tier (${source})`
              : `${trader.prototypeId} does not buy ${rule.rawMaterialId}`,
        });
      }
    }
  }
  return issues;
}
