import type { EntityId } from "../ecs/Entity";

/**
 * Id of the storage system (dependency name for systems that route goods or reserve stock).
 */
export const storageSystemId = "storage";

/**
 * Id of the system that only owns the save section `systems.reservations`.
 */
export const reservationsSystemId = "storage.reservations";

/**
 * Job type id of hauling goods to storage (`jobs.json`).
 */
export const haulJobId = "haul.deliver";

/**
 * Prototype id of an item pile lying on the ground (DECISIONS D-18): a source of goods that the
 * haul poster empties into storage; unlike carried stock it is claimable.
 */
export const loosePilePrototypeId = "loose_pile";

/**
 * Prototype id of a construction site; its inventory (the staged building materials) is never part
 * of a storage query (DECISIONS D-09).
 */
export const buildSitePrototypeId = "build_site";

/**
 * Id of the furniture effect that scales the decay rate of the items inside (spec 018 FR-007;
 * DECISIONS section 3.4 modifier ids).
 */
export const decayRateModifierId = "inventory.decay.rate";

/**
 * The haul poster looks every this many ticks (two game hours); a holder of undeliverable goods
 * is retried at the same pace (DECISIONS D-26: every 24 ticks).
 */
export const haulPosterIntervalTicks = 24;

/**
 * The highest value of a stockpile priority.
 */
export const maxStockpilePriority = 100;

/**
 * The default stockpile priority.
 */
export const defaultStockpilePriority = 50;

/**
 * How often a hauler walks to a source that moved before it gives up (`approach_failed`).
 */
export const maxHaulApproaches = 5;

/**
 * Haul failure reason: nothing (unreserved) is left at the source.
 */
export const sourceGoneReason = "source_gone";

/**
 * Haul failure reason: the hauler cannot carry any of the goods.
 */
export const noCapacityReason = "no_capacity";

/**
 * Haul failure reason (and cancel reason of an open haul posting): no storage accepts the goods.
 */
export const noDestinationReason = "no_destination";

/**
 * How many times one delivery looks for another storage after one turned out full.
 */
export const maxHaulReroutes = 3;

/**
 * Event: goods have no storage that accepts them (DECISIONS section 4.4).
 */
export const noDestinationEvent = "storage.no-compatible-destination";

/**
 * Payload of `storage.no-compatible-destination`.
 */
export type NoDestination = {
  entityId: EntityId;
  materialId: string;
  quantity: number;
};

/**
 * Which materials a storage accepts (spec 018 `MaterialFilter`). Both lists are alternatives: a
 * material passes when its id is listed or one of its categories is. An empty list counts as
 * absent and a filter with both lists empty accepts everything (DECISIONS D-26). Stored filters
 * always have both lists (the command accepts missing ones and fills them with `[]`).
 */
export type MaterialFilter = {
  categories: string[];
  materialIds: string[];
};

/**
 * Data of the `Stockpile` component: a storage furniture takes part in hauler routing. `filter`
 * overrides the default filter of the furniture content (replace, not merge, D-26).
 */
export type StockpileData = {
  /**
   * `0..100`; higher is preferred among the storages of one routing tier.
   */
  priority: number;
  filter: MaterialFilter | null;
};

/**
 * Data of the `Furniture` component, the minimal marker of a placed furniture piece. The content
 * record (tags, storage, effects) is looked up by `furnitureId`; tasks 3.4 (zones, rooms) and 3.5
 * (construction) add what they need next to it.
 */
export type FurnitureData = {
  /**
   * Id of the furniture record in the content pack (`chest`).
   */
  furnitureId: string;
};

/**
 * Why stock is reserved (DECISIONS D-09). The enum value is the serialized kind.
 */
export enum ReservationKind {
  /**
   * Input materials locked for crafting (014).
   */
  Lock = "lock",
  /**
   * Goods a hauler is about to pick up.
   */
  Haul = "haul",
  /**
   * A tool item a worker fetches (016).
   */
  Tool = "tool",
  /**
   * Goods or coins promised in a trade (019).
   */
  Payment = "payment",
}

/**
 * Reserved quantity of one material in one inventory, taken by one holder (DECISIONS D-09).
 */
export type Reservation = {
  /**
   * From the persisted `nextReservationId` counter, never reused.
   */
  id: number;
  kind: ReservationKind;
  /**
   * The claimant (hauler, crafter, builder, trader entity) that may use the reserved stock.
   */
  holderId: EntityId;
  /**
   * The entity whose inventory holds the reserved stock.
   */
  inventoryOwnerId: EntityId;
  materialId: string;
  quantity: number;
  createdTick: number;
};

/**
 * What a caller gives to `ReservationService.reserve`.
 */
export type ReserveRequest = {
  kind: ReservationKind;
  holderId: EntityId;
  inventoryOwnerId: EntityId;
  materialId: string;
  quantity: number;
};

/**
 * Stock of one material over all storage (see `stockOf`).
 */
export type StockSummary = {
  materialId: string;
  /**
   * Held in claimable storage, reserved or not.
   */
  total: number;
  /**
   * Part of `total` that reservations hold back.
   */
  reserved: number;
  /**
   * `total - reserved`: what a requester without reservations can claim.
   */
  available: number;
  /**
   * How many more units of the material the storages could take.
   */
  free: number;
};

/**
 * One storage that can give a requester some of a material (spec 018 FR-011/013).
 */
export type StockSource = {
  entityId: EntityId;
  /**
   * How much of the request this source covers.
   */
  quantity: number;
  /**
   * Path cost from the requester to the source's cell.
   */
  distance: number;
  mapId: number;
  cellIndex: number;
};
