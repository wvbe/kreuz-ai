import type { JsonValue } from "../engine/EventBus";

/**
 * The data files of a content pack (spec 022 FR-018). The enum value is the kebab-case file name
 * under `content/data/`; the order of the members is the fixed load and validation order.
 */
export enum ContentFile {
  Categories = "categories.json",
  Terrain = "terrain.json",
  Materials = "materials.json",
  Needs = "needs.json",
  Skills = "skills.json",
  Traits = "traits.json",
  Furniture = "furniture.json",
  Zones = "zones.json",
  Recipes = "recipes.json",
  Jobs = "jobs.json",
  Factions = "factions.json",
  BehaviorTrees = "behavior-trees.json",
  NameLists = "name-lists.json",
  HumanoidPrototypes = "humanoid-prototypes.json",
  AnimalPrototypes = "animal-prototypes.json",
  EnginePrototypes = "engine-prototypes.json",
  DwellingLevels = "dwelling-levels.json",
  SettlementTiers = "settlement-tiers.json",
  DifficultyModes = "difficulty-modes.json",
  ContentConstants = "content-constants.json",
  MomentTemplates = "moment-templates.json",
  NameFormats = "name-formats.json",
}

/**
 * Already parsed JSON of every file of a pack, keyed by {@link ContentFile}. Tests build
 * alternative or invalid packs from this shape without touching the filesystem.
 */
export type ContentPackFiles = { [file in ContentFile]?: JsonValue };

/**
 * One problem found while loading a pack. Every issue names the file, the record id (null for
 * file-level problems) and the dotted field path (empty for the record itself).
 */
export type ContentIssue = {
  file: ContentFile;
  id: string | null;
  field: string;
  message: string;
};

/**
 * Settlement tiers in ascending order (spec 027 FR-001).
 */
export enum SettlementTier {
  Hamlet = "hamlet",
  Village = "village",
  MarketTown = "market_town",
  CharteredTown = "chartered_town",
}

/**
 * Dwelling levels in ascending order (spec 029).
 */
export enum DwellingLevel {
  Hovel = "hovel",
  Cottage = "cottage",
  TimberFramedHouse = "timber_framed_house",
  BurgherHouse = "burgher_house",
}

/**
 * Kinds of tier requirement (spec 027 FR-003).
 */
export enum TierRequirementKind {
  Population = "population",
  DwellingsAtLevel = "dwellings_at_level",
  ActiveZone = "active_zone",
  FoundedGuilds = "founded_guilds",
  MilestoneReached = "milestone_reached",
}

/**
 * Settlement milestones (spec 027), serialized in kebab form.
 */
export enum MilestoneKind {
  ThroneRoomEstablished = "throne-room-established",
  FirstWorshipSpace = "first-worship-space",
  FirstMarket = "first-market",
  FirstGuildFounded = "first-guild-founded",
  FirstMasterCraftsman = "first-master-craftsman",
  FirstTradeAgreement = "first-trade-agreement",
  FirstDwellingUpgrade = "first-dwelling-upgrade",
}

/**
 * Kinds of notable moment that have a text template (spec 028).
 */
export enum NotableMomentKind {
  Arrived = "arrived",
  TitleEarned = "title_earned",
  MasteryAchieved = "mastery_achieved",
  BecameFinest = "became_finest",
  LostFinest = "lost_finest",
  JoinedGuild = "joined_guild",
  LeftGuild = "left_guild",
  TookOffice = "took_office",
  LostOffice = "lost_office",
  FirstWork = "first_work",
  FirstTrade = "first_trade",
  HomeImproved = "home_improved",
  Renamed = "renamed",
  Died = "died",
  SettlementMilestone = "settlement_milestone",
  TierReached = "tier_reached",
}

/**
 * What a need satisfaction method refers to.
 */
export enum NeedSatisfactionKind {
  Item = "item",
  Furniture = "furniture",
  Zone = "zone",
}

/**
 * Effect types a skill level can have (spec 020 FR-007).
 */
export enum SkillEffectKind {
  MaxSpeedBonus = "max_speed_bonus",
  OutputBonus = "output_bonus",
  QualityBonus = "quality_bonus",
}

/**
 * Wildcards usable instead of a skill id in trait modifiers (`ALL`, DECISIONS D-37).
 */
export enum SkillWildcard {
  All = "ALL",
  Work = "ALL_WORK",
  Crafting = "ALL_CRAFTING",
}

/**
 * Discriminator of trait modifiers (spec 022 trait record).
 */
export enum TraitModifierKind {
  SkillAptitude = "skill_aptitude",
  Performance = "performance",
  NeedModifier = "need_modifier",
}

/**
 * Stat changed by a performance trait modifier.
 */
export enum PerformanceStat {
  Multiplier = "multiplier",
  OutputBonus = "output_bonus",
  SpeedMultiplier = "speed_multiplier",
}

/**
 * Pseudo need id that trait modifiers use for mood (DECISIONS D-15); it is not a registered need.
 */
export const moodNeedId = "mood";

/**
 * Whether an animal is kept or hunted.
 */
export enum AnimalKind {
  Livestock = "livestock",
  Wild = "wild",
}

/**
 * Faction families (spec 022 faction record).
 */
export enum FactionType {
  Occupational = "occupational",
  Religious = "religious",
}

/**
 * How a furniture requirement names furniture: by prototype id or by tag.
 */
export enum FurnitureRefKind {
  Id = "id",
  Tag = "tag",
}

/**
 * Where a job type can be worked (spec 022 job record `zoneContext`).
 */
export enum ZoneContextKind {
  Any = "any",
  Zone = "zone",
  Terrain = "terrain",
  PerRecipe = "per_recipe",
}

/**
 * How a job type re-posts on the board.
 */
export enum JobRecurrence {
  OneTime = "one-time",
  Recurring = "recurring",
  RecurringDaily = "recurring-daily",
}
