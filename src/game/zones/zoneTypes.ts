import type { EntityId } from "../ecs/Entity";
import type { MaterialFilter } from "../storage/storageTypes";

/**
 * Id of the zones system (dependency name for systems that read zone status).
 */
export const zonesSystemId = "zones";

/**
 * Prototype id of a zone entity (it carries the `Zone` component; the entity id is the zone id).
 */
export const zonePrototypeId = "zone";

/**
 * Zone type id of the routing designation for goods (spec 018 FR-003).
 */
export const stockpileZoneTypeId = "stockpile";

/**
 * Zone type id of dwellings (spec 029): storage furniture on dwelling tiles is never routed to.
 */
export const dwellingZoneTypeId = "dwelling";

/**
 * Prototype ids whose entities enclose a room (DECISIONS D-11: a wall or a door entity; doors
 * count open or closed). Cells that the map marks as blocked by a wall also enclose.
 */
export const enclosurePrototypeIds: readonly string[] = ["wall", "door"];

/**
 * Prototype id of a job board; a board inside a zone satisfies `requiresJobBoard` and is paused
 * while the zone is not active.
 */
export const jobBoardPrototypeId = "job_board";

/**
 * Event: a zone was created (`{zoneId, zoneTypeId, mapId}`).
 */
export const zoneCreatedEvent = "zone.created";

/**
 * Event: a zone was deleted (`{zoneId, zoneTypeId, mapId}`).
 */
export const zoneDeletedEvent = "zone.deleted";

/**
 * Event: a zone fell apart; the largest part kept the id (`{zoneId, newZoneIds}`).
 */
export const zoneSplitEvent = "zone.split";

/**
 * Event: a merge of two same-type zones is offered (`{offerId, zoneAId, zoneBId}`).
 */
export const zoneMergeOfferedEvent = "zone.merge.offered";

/**
 * Event: two zones were merged (`{survivorId, absorbedId}`).
 */
export const zoneMergedEvent = "zone.merged";

/**
 * Event: a zone became or stopped being a room (`{zoneId, isRoom}`).
 */
export const zoneRoomChangedEvent = "zone.room.changed";

/**
 * Event: a zone became active (`{zoneId, zoneTypeId}`).
 */
export const zoneRequirementsMetEvent = "zone.requirements.met";

/**
 * Event: an active zone stopped being active (`{zoneId, zoneTypeId, gaps}`).
 */
export const zoneRequirementsLostEvent = "zone.requirements.lost";

/**
 * What a zone can do at the moment (derived, saved but not authoritative, spec 015 FR-013).
 */
export enum ZoneStatus {
  /**
   * Every requirement holds: effects apply, work is allowed.
   */
  Active = "active",
  /**
   * The zone is big enough and enclosed as its type needs, but furniture or a job board is
   * missing (a shell waiting for its fittings).
   */
  Incomplete = "incomplete",
  /**
   * The zone is too small or not enclosed as its type needs: it does nothing yet.
   */
  Inactive = "inactive",
}

/**
 * Why a zone is not active (spec 015 `ZoneGapKind`, mapped to 025 `ZoneRequirementsUnmet`).
 */
export enum ZoneGapKind {
  NotEnclosed = "not-enclosed",
  TooSmall = "too-small",
  MissingFurniture = "missing-furniture",
  MissingJobBoard = "missing-job-board",
}

/**
 * One unmet requirement of a zone (spec 015 FR-017).
 */
export type ZoneGap = {
  kind: ZoneGapKind;
  /**
   * `MissingFurniture`: the requirement as text (`2x tag:bed or 1x id:chest`); otherwise null.
   */
  requirement: string | null;
  /**
   * Pieces (or tiles for `TooSmall`) the zone needs; the closest alternative for furniture.
   */
  required: number | null;
  /**
   * Pieces (or tiles) it has.
   */
  present: number | null;
};

/**
 * What a furniture alternative matches: a furniture tag or a furniture id.
 */
export type FurnitureMatch = { tag: string } | { id: string };

/**
 * One alternative of a furniture requirement.
 */
export type FurnitureAlternative = {
  match: FurnitureMatch;
  /**
   * Pieces needed (per `perTiles` tiles when that is set).
   */
  count: number;
  /**
   * Density: `count` pieces for every started `perTiles` tiles of the zone, or null for a flat
   * count.
   */
  perTiles: number | null;
};

/**
 * A furniture requirement (DECISIONS D-11): satisfied when any of its alternatives is. A zone
 * type's requirements are combined with AND.
 */
export type FurnitureRequirement = {
  alternatives: FurnitureAlternative[];
};

/**
 * Data of the `Zone` component (DECISIONS D-11 plus the derived `status` and `gaps`, the
 * material `filter` of stockpile zones and the tick the zone became active).
 */
export type ZoneData = {
  zoneTypeId: string;
  mapId: number;
  /**
   * Cell indices, ascending, unique.
   */
  tiles: number[];
  isRoom: boolean;
  /**
   * Status is `Active`; the transition drives `zone.requirements.*`.
   */
  active: boolean;
  status: ZoneStatus;
  gaps: ZoneGap[];
  /**
   * Zone-level material filter for storage in the zone that has no filter of its own (018 FR-004).
   */
  filter: MaterialFilter | null;
  createdTick: number;
  /**
   * Tick of the last change to active; effects apply from the next tick (DECISIONS D-11).
   */
  activeSinceTick: number | null;
};

/**
 * An offer to merge two same-type zones that a removed wall joined (DECISIONS D-11).
 */
export type MergeOffer = {
  offerId: number;
  zoneAId: EntityId;
  zoneBId: EntityId;
};

/**
 * A zone as the queries show it.
 */
export type ZoneView = {
  id: EntityId;
  zoneTypeId: string;
  mapId: number;
  tiles: number[];
  isRoom: boolean;
  active: boolean;
  status: ZoneStatus;
  gaps: ZoneGap[];
  filter: MaterialFilter | null;
  createdTick: number;
  /**
   * Best familiarity bucket `0..10` (D-43) of the citizens standing in the zone in the zone
   * type's affinity skill; 0 without such a skill.
   */
  affinity: number;
  /**
   * Citizens standing on the zone's tiles.
   */
  workers: EntityId[];
};

/**
 * Payload of the events `zone.created` and `zone.deleted`.
 */
export type ZoneLifecycle = {
  zoneId: EntityId;
  zoneTypeId: string;
  mapId: number;
};
