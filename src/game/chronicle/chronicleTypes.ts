import { NotableMomentKind } from "../content/contentTypes";
import type { EntityId } from "../ecs/Entity";

/**
 * Id of the chronicle system (moment recording, finest tracking, the queries `chronicle`,
 * `journal` and `moments-since`).
 */
export const chronicleSystemId = "chronicle";

/**
 * Event queued for every recorded moment, Minor or Major (spec 028 FR-014); the payload is the
 * {@link MomentRecord}. Renderers toast the Major ones.
 */
export const momentRecordedEvent = "chronicle.moment.recorded";

/**
 * Prominence of a moment kind (spec 028 FR-012, DECISIONS D-17). The enum value is the serialized
 * form.
 */
export enum MomentProminence {
  /**
   * Journal only.
   */
  Minor = "minor",
  /**
   * Journal, chronicle and a notification.
   */
  Major = "major",
}

/**
 * The fixed prominence of every moment kind (DECISIONS D-17: `Arrived` is Minor).
 */
export const prominenceOfKind: { readonly [kind in NotableMomentKind]: MomentProminence } = {
  [NotableMomentKind.Arrived]: MomentProminence.Minor,
  [NotableMomentKind.TitleEarned]: MomentProminence.Minor,
  [NotableMomentKind.MasteryAchieved]: MomentProminence.Major,
  [NotableMomentKind.BecameFinest]: MomentProminence.Major,
  [NotableMomentKind.LostFinest]: MomentProminence.Minor,
  [NotableMomentKind.JoinedGuild]: MomentProminence.Minor,
  [NotableMomentKind.LeftGuild]: MomentProminence.Minor,
  [NotableMomentKind.TookOffice]: MomentProminence.Major,
  [NotableMomentKind.LostOffice]: MomentProminence.Minor,
  [NotableMomentKind.FirstWork]: MomentProminence.Minor,
  [NotableMomentKind.FirstTrade]: MomentProminence.Minor,
  [NotableMomentKind.HomeImproved]: MomentProminence.Minor,
  [NotableMomentKind.Renamed]: MomentProminence.Minor,
  [NotableMomentKind.Died]: MomentProminence.Major,
  [NotableMomentKind.SettlementMilestone]: MomentProminence.Major,
  [NotableMomentKind.TierReached]: MomentProminence.Major,
};

/**
 * The parameters of a moment: strings and integers only (spec 028 FR-014), so that records are
 * plain JSON.
 */
export type MomentParams = { [name: string]: string | number };

/**
 * One recorded moment (spec 028 FR-014). The text is never stored: the content template of the
 * kind renders it from `nameSnapshot` and `params` (see `formatMoment`).
 */
export type MomentRecord = {
  /**
   * Monotonic id, never reused.
   */
  momentId: number;
  tick: number;
  kind: NotableMomentKind;
  prominence: MomentProminence;
  /**
   * The citizen the moment is about; null for `SettlementMilestone` and `TierReached`.
   */
  entityId: EntityId | null;
  /**
   * The styled name of the citizen at the time; null when `entityId` is null.
   */
  nameSnapshot: string | null;
  params: MomentParams;
};

/**
 * Params of `Arrived`: none.
 */
export type ArrivedParams = Record<string, never>;

/**
 * Params of `TitleEarned`: the skill and its title noun.
 */
export type TitleEarnedParams = { skillId: string; noun: string };

/**
 * Params of `MasteryAchieved`: the skill, its noun and the guild whose master threshold applied
 * (`""` when none).
 */
export type MasteryAchievedParams = { skillId: string; noun: string; guildId: string };

/**
 * Params of `BecameFinest` and `LostFinest`: the skill, its noun and the level at the time.
 */
export type FinestParams = { skillId: string; noun: string; level: number };

/**
 * Params of `JoinedGuild` and `LeftGuild`: the guild faction and its name.
 */
export type GuildParams = { factionId: number; guildName: string };

/**
 * Params of `TookOffice` and `LostOffice`: the faction and the office title ("Reeve",
 * "Steward").
 */
export type OfficeParams = { factionId: number; office: string };

/**
 * Params of `FirstWork`: the skill.
 */
export type FirstWorkParams = { skillId: string };

/**
 * Params of `FirstTrade`: the other party (0 when it is not an entity).
 */
export type FirstTradeParams = { partnerId: number };

/**
 * Params of `HomeImproved`: the dwelling zone and the level it reached.
 */
export type HomeImprovedParams = { dwellingId: number; dwellingLevel: string };

/**
 * Params of `Renamed`: the styled name before the change.
 */
export type RenamedParams = { previousName: string };

/**
 * Params of `Died`: the kinds of the last journal entries (`kind` or `kind:skillId`, comma
 * separated), the excerpt of the journal that dies with the citizen.
 */
export type DiedParams = { journalExcerpt: string };

/**
 * Params of `SettlementMilestone`: the milestone id (kebab case).
 */
export type SettlementMilestoneParams = { milestone: string };

/**
 * Params of `TierReached`: the tier and the one before it.
 */
export type TierReachedParams = { tier: string; previousTier: string };

/**
 * The params type of each moment kind.
 */
export type MomentParamsByKind = {
  [NotableMomentKind.Arrived]: ArrivedParams;
  [NotableMomentKind.TitleEarned]: TitleEarnedParams;
  [NotableMomentKind.MasteryAchieved]: MasteryAchievedParams;
  [NotableMomentKind.BecameFinest]: FinestParams;
  [NotableMomentKind.LostFinest]: FinestParams;
  [NotableMomentKind.JoinedGuild]: GuildParams;
  [NotableMomentKind.LeftGuild]: GuildParams;
  [NotableMomentKind.TookOffice]: OfficeParams;
  [NotableMomentKind.LostOffice]: OfficeParams;
  [NotableMomentKind.FirstWork]: FirstWorkParams;
  [NotableMomentKind.FirstTrade]: FirstTradeParams;
  [NotableMomentKind.HomeImproved]: HomeImprovedParams;
  [NotableMomentKind.Renamed]: RenamedParams;
  [NotableMomentKind.Died]: DiedParams;
  [NotableMomentKind.SettlementMilestone]: SettlementMilestoneParams;
  [NotableMomentKind.TierReached]: TierReachedParams;
};

/**
 * What a moment source hands to `recordMoment`: the kind with its typed params and the citizen it
 * is about (null for the settlement moments).
 */
export type MomentInput = {
  [kind in NotableMomentKind]: {
    kind: kind;
    entityId: EntityId | null;
    params: MomentParamsByKind[kind];
  };
}[NotableMomentKind];

/**
 * How many entries the `chronicle` query returns when no limit is given.
 */
export const defaultChronicleLimit = 20;
