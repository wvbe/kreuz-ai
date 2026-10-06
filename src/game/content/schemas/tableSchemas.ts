import { z } from "zod";
import { Difficulty } from "../../save/initOptions";
import {
  DwellingLevel,
  FurnitureRefKind,
  MilestoneKind,
  NotableMomentKind,
  SettlementTier,
  TierRequirementKind,
} from "../contentTypes";
import {
  contentIdSchema,
  countSchema,
  fractionSchema,
  levelSchema,
  milliSchema,
  percentSchema,
  permilleSchema,
  positiveSchema,
} from "./fieldSchemas";

const standingSchema = z.number().int().min(-100).max(100);

/**
 * Authored content constants (spec 022 FR-023, DECISIONS D-15/D-30): a single object, every
 * field range-checked. Ratios are authored as decimals and stored as permille; days and ticks
 * are integers.
 */
export const contentConstantsSchema = z
  .object({
    stewardReviewTickOfDay: z.number().int().min(0).max(287),
    stewardAudienceTicks: positiveSchema,
    maxOpenRunsPerOrder: positiveSchema,
    maxStandingOrders: positiveSchema,
    defaultRestockFraction: fractionSchema,
    noticePostRadius: positiveSchema,
    bellRadius: positiveSchema,
    bellRingTicksOfDay: z.array(z.number().int().min(0).max(287)),
    housingEvaluationTickOfDay: z.number().int().min(0).max(287),
    upgradeGraceDays: positiveSchema,
    downgradeGraceDays: positiveSchema,
    foodVarietyWindowDays: positiveSchema,
    householdStockDays: positiveSchema,
    maxImmigrantsPerDay: countSchema,
    minFoundingMembers: positiveSchema,
    titleThreshold: levelSchema,
    titleSwitchMargin: levelSchema,
    finestMinimumLevel: levelSchema,
    finestCooldownDays: countSchema,
    bynameChance: fractionSchema,
    nameRedrawLimit: positiveSchema,
    journalCapacity: positiveSchema,
    chronicleCapacity: positiveSchema,
    cropGrowthTicks: positiveSchema,
    oreDepositCharges: positiveSchema,
    stoneDepositCharges: positiveSchema,
    oreLowStock: positiveSchema,
    stoneLowStock: positiveSchema,
    needStartValue: percentSchema,
    starvationHealthPerTick: milliSchema,
    healthRegenPerTick: milliSchema,
    moodSmoothing: fractionSchema,
    groundSleepRate: fractionSchema,
    sleepWakeThreshold: percentSchema,
    wealthyCoins: countSchema,
    poorCoins: countSchema,
    wanderRadiusCost: positiveSchema,
    idleStandChance: fractionSchema,
    idleStandMinTicks: positiveSchema,
    idleStandMaxTicks: positiveSchema,
    startingTreasury: countSchema,
    traderVisitStartDay: countSchema,
    traderVisitIntervalDays: positiveSchema,
    traderVisitJitterTicks: countSchema,
    traderStayDays: positiveSchema,
    maxNegotiationRounds: positiveSchema,
    offerTimeoutTicks: positiveSchema,
    defaultMinimumMarginRate: fractionSchema,
    agreementDiscount: fractionSchema,
    scarcityMaxPremium: fractionSchema,
    tradeStandingPerTrade: countSchema,
    tradeStandingDailyCap: countSchema,
    hostileStanding: z.number().int().min(-100).max(0),
    friendlyStanding: standingSchema,
    alliedStanding: standingSchema,
    agreementMinStanding: standingSchema,
    warThreshold: standingSchema,
    warStanding: standingSchema,
    peaceStanding: standingSchema,
    giftBaseDelta: countSchema,
    giftCoinsPerPoint: positiveSchema,
    giftMaxDelta: countSchema,
    agreementAcceptedDelta: countSchema,
    overtureAcceptedDelta: countSchema,
    overtureMinStanding: standingSchema,
    rejectionPenalty: countSchema,
    standingDecayIntervalDays: positiveSchema,
    envoyUnitsPerTick: positiveSchema,
    envoyJitterTicks: countSchema,
    envoyStuckTimeoutTicks: positiveSchema,
    maxEnvoysPerFaction: positiveSchema,
    proposalExpiryTicks: positiveSchema,
    npcEvalIntervalTicks: positiveSchema,
    npcActCooldownTicks: positiveSchema,
    warChance: fractionSchema,
    incidentChance: fractionSchema,
    incidentStandingDelta: standingSchema,
    incidentReciprocalDelta: standingSchema,
  })
  .strict()
  .refine((constants) => constants.downgradeGraceDays > constants.upgradeGraceDays, {
    message: "downgradeGraceDays must exceed upgradeGraceDays",
    path: ["downgradeGraceDays"],
  })
  .refine((constants) => constants.idleStandMaxTicks >= constants.idleStandMinTicks, {
    message: "idleStandMaxTicks must not be below idleStandMinTicks",
    path: ["idleStandMaxTicks"],
  });

/**
 * Loaded content constants.
 */
export type ContentConstants = z.infer<typeof contentConstantsSchema>;

const tierRequirementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(TierRequirementKind.Population), min: positiveSchema }).strict(),
  z
    .object({
      kind: z.literal(TierRequirementKind.DwellingsAtLevel),
      level: z.enum(DwellingLevel),
      min: positiveSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal(TierRequirementKind.ActiveZone),
      zoneTypeIds: z.array(contentIdSchema).min(1),
      min: positiveSchema,
    })
    .strict(),
  z.object({ kind: z.literal(TierRequirementKind.FoundedGuilds), min: positiveSchema }).strict(),
  z
    .object({
      kind: z.literal(TierRequirementKind.MilestoneReached),
      milestone: z.enum(MilestoneKind),
    })
    .strict(),
]);

/**
 * One tier of `settlement-tiers.json` (spec 027 FR-001/FR-003).
 */
export const settlementTierSchema = z
  .object({
    tier: z.enum(SettlementTier),
    settlementNoun: z.string().min(1),
    requirements: z.array(tierRequirementSchema).default([]),
  })
  .strict();

/**
 * Loaded settlement tier record.
 */
export type SettlementTierContent = z.infer<typeof settlementTierSchema>;

/**
 * One difficulty of `difficulty-modes.json` (spec 027 FR-013): three permille multipliers.
 */
export const difficultyModeSchema = z
  .object({
    difficulty: z.enum(Difficulty),
    decayMultiplier: permilleSchema,
    needDecayMultiplier: permilleSchema,
    factionHostilityMultiplier: permilleSchema,
  })
  .strict();

/**
 * Loaded difficulty mode record.
 */
export type DifficultyModeContent = z.infer<typeof difficultyModeSchema>;

const dwellingFurnitureSchema = z
  .object({
    kind: z.enum(FurnitureRefKind),
    ref: contentIdSchema,
    count: positiveSchema,
  })
  .strict();

/**
 * One level of `dwelling-levels.json` (spec 029 `DwellingLevelDefinition`). `perResidentPerDay`
 * is an authored decimal stored as milli.
 */
export const dwellingLevelSchema = z
  .object({
    level: z.enum(DwellingLevel),
    capacity: positiveSchema,
    rentPerDay: countSchema,
    minTiles: positiveSchema,
    furniture: z.array(dwellingFurnitureSchema).default([]),
    foodVariety: countSchema,
    services: z
      .array(
        z
          .object({
            zoneTypeIds: z.array(contentIdSchema).min(1),
            maxPathCells: positiveSchema,
          })
          .strict(),
      )
      .default([]),
    suppliedGoods: z
      .array(
        z
          .object({
            materialIds: z.array(contentIdSchema).min(1),
            perResidentPerDay: milliSchema,
          })
          .strict(),
      )
      .default([]),
    immigrantPrototypes: z
      .array(z.object({ prototypeId: contentIdSchema, weight: positiveSchema }).strict())
      .default([]),
    unlockTier: z.enum(SettlementTier).optional(),
  })
  .strict();

/**
 * Loaded dwelling level record.
 */
export type DwellingLevelContent = z.infer<typeof dwellingLevelSchema>;

/**
 * One entry of `moment-templates.json` (spec 028 FR-016): the text template of one moment kind.
 */
export const momentTemplateSchema = z
  .object({ kind: z.enum(NotableMomentKind), template: z.string().min(1) })
  .strict();

/**
 * Loaded moment template record.
 */
export type MomentTemplateContent = z.infer<typeof momentTemplateSchema>;

/**
 * `name-formats.json` (spec 028 FR-006): the styled-name templates and the Steward title.
 */
export const nameFormatsSchema = z
  .object({
    plain: z.string().min(1),
    practitioner: z.string().min(1),
    master: z.string().min(1),
    officeSuffixMaster: z.string().min(1),
    officeSuffixOther: z.string().min(1),
    stewardTitle: z.string().min(1),
  })
  .strict();

/**
 * Loaded name format templates.
 */
export type NameFormatsContent = z.infer<typeof nameFormatsSchema>;
