import type { EntityId } from "../ecs/Entity";

/**
 * One faction's view of another (spec 021 FR-007, DECISIONS section 0 "Maps keyed by ids"):
 * standing is asymmetric, so each faction keeps its own list, ascending by `factionId`.
 */
export type StandingEntry = {
  /**
   * The faction this view is about.
   */
  factionId: EntityId;
  /**
   * Integer `-100..100`; an absent entry reads as 0.
   */
  value: number;
  /**
   * Whether the holder has a trade agreement with that faction.
   */
  tradeAgreement: boolean;
};

/**
 * Data of the `Faction` component (spec 021 FR-001).
 */
export type FactionData = {
  /**
   * Id of the content faction (`factions.json`) this entity is bound to; null for the player
   * government, which has no content record.
   */
  contentId: string | null;
  name: string;
  /**
   * Open string: `political`, `occupational`, `religious`, ...
   */
  factionType: string;
  /**
   * Title of the faction's leader, used for offices in styled names (spec 028 FR-009).
   */
  leaderTitle: string;
  /**
   * Open disposition id (static data; act weights come with task 4.2).
   */
  disposition: string;
  /**
   * The one leader (a `Citizen` entity), or null when the faction is leaderless (FR-003).
   */
  leaderId: EntityId | null;
  standing: StandingEntry[];
};

/**
 * Data of the `Citizen` component (spec 021 FR-002, spec 029 FR-005). `factions` is the sole
 * source of membership: a faction's members are derived by scanning for it.
 */
export type CitizenData = {
  /**
   * Ids of the factions this citizen belongs to, ascending, unique.
   */
  factions: EntityId[];
  homeDwellingId: EntityId | null;
  homeAssignedTick: number;
};

/**
 * Id of the factions system (dependency name for systems that need `Faction` / `Citizen`).
 */
export const factionsSystemId = "factions";

/**
 * Prototype id of an NPC or guild faction entity bound to a content faction.
 */
export const factionPrototypeId = "faction";

/**
 * `Faction.factionType` of the player government.
 */
export const politicalFactionType = "political";

/**
 * Lowest standing value.
 */
export const minStanding = -100;

/**
 * Highest standing value.
 */
export const maxStanding = 100;

/**
 * Event emitted by the membership helpers on every change of `Citizen.factions` (DECISIONS D-14).
 */
export const factionMembershipChangedEvent = "faction.membership.changed";

/**
 * Event emitted when `Faction.leaderId` changes (DECISIONS D-14).
 */
export const factionLeaderChangedEvent = "faction.leader.changed";

/**
 * Event emitted when one faction's standing toward another changes (DECISIONS section 4.5).
 */
export const standingChangedEvent = "diplomacy.standing.changed";

/**
 * Payload of `faction.membership.changed`.
 */
export type FactionMembershipChanged = {
  entityId: EntityId;
  factionId: EntityId;
  joined: boolean;
};

/**
 * Payload of `faction.leader.changed`.
 */
export type FactionLeaderChanged = {
  factionId: EntityId;
  oldLeaderId: EntityId | null;
  newLeaderId: EntityId | null;
};

/**
 * Payload of `diplomacy.standing.changed`.
 */
export type StandingChanged = {
  factionId: EntityId;
  otherFactionId: EntityId;
  oldValue: number;
  newValue: number;
};
