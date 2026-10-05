import type { EntityId } from "../ecs/Entity";

/**
 * Rank of a derived skill title (spec 028 FR-007). "No title" is `null`, not a rank.
 */
export enum TitleRank {
  /**
   * Level at or above `titleThreshold`: "Ansel the Baker".
   */
  Practitioner = "practitioner",
  /**
   * Level at or above the lowest `masterSkillThreshold` of the guilds that use the skill:
   * "Ansel, Master Baker".
   */
  Master = "master",
}

/**
 * A derived skill title (spec 028 FR-007); the snapshot stored on `Identity` is only for change
 * detection, the profession is never authoritative.
 */
export type Title = {
  skillId: string;
  rank: TitleRank;
  /**
   * `titleNoun` of the skill ("Baker").
   */
  noun: string;
  /**
   * The guild whose master threshold applied, null for Practitioners.
   */
  guildId: string | null;
};

/**
 * An office a citizen holds (spec 028 FR-009): leader of a faction.
 */
export type Office = {
  factionId: EntityId;
  factionName: string;
  leaderTitle: string;
};

/**
 * Data of the `Identity` component (spec 028 FR-003, DECISIONS D-17). The journal of FR-017 is
 * added by the chronicle task (4.6); `seenSkills` is the sorted set `FirstWork` needs.
 */
export type IdentityData = {
  givenName: string;
  byname: string | null;
  /**
   * 0 = none; otherwise the lowest unused integer `>= 2` among living namesakes (shown as a
   * roman numeral).
   */
  nameOrdinal: number;
  nameListId: string;
  titleSnapshot: Title | null;
  seenSkills: string[];
};

/**
 * Id of the identity system.
 */
export const identitySystemId = "identity";

/**
 * Name of the PRNG stream that draws citizen names (DECISIONS section 0 stream registry).
 */
export const identityStreamName = "identity.names";

/**
 * Event emitted when a citizen is named (spec 028 FR-005).
 */
export const identityNamedEvent = "identity.named";

/**
 * Event emitted when the derived title differs from the snapshot (spec 028 FR-010).
 */
export const identityTitleChangedEvent = "identity.title.changed";

/**
 * Payload of `identity.named`.
 */
export type IdentityNamed = {
  entityId: EntityId;
  givenName: string;
  byname: string | null;
  nameOrdinal: number;
};

/**
 * Payload of `identity.title.changed`.
 */
export type IdentityTitleChanged = {
  entityId: EntityId;
  oldTitle: Title | null;
  newTitle: Title | null;
};
