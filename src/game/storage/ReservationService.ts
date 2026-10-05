import { z } from "zod";
import { hasComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { CounterName } from "../engine/IdCounters";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { retrieve, transfer } from "../inventory/inventoryOperations";
import { getTotal } from "../inventory/inventoryQueries";
import type { ItemQuantity } from "../inventory/inventoryTypes";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import { StorageError, StorageErrorKind } from "./StorageError";
import { ReservationKind } from "./storageTypes";
import type { Reservation, ReserveRequest } from "./storageTypes";

const idSchema = z.number().int().min(1);

const reservationSchema = z
  .object({
    id: idSchema,
    kind: z.nativeEnum(ReservationKind),
    holderId: idSchema,
    inventoryOwnerId: idSchema,
    materialId: z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/),
    quantity: z.number().int().min(1),
    createdTick: z.number().int().min(0),
  })
  .strict();

const reservationSectionSchema = z
  .object({ reservations: z.array(reservationSchema) })
  .strict()
  .refine(
    (section) =>
      section.reservations.every(
        (reservation, index) =>
          index === 0 || (section.reservations[index - 1]?.id ?? 0) < reservation.id,
      ),
    { message: "reservations must be unique and ascending by id" },
  );

/**
 * Reservations of stock (DECISIONS D-09, plan 3.2): a claimant (hauler, crafter, builder, trader)
 * holds back a quantity of one material in one inventory so that nobody else can claim it. This is
 * the one primitive that hauling, crafting locks, construction staging, tool fetching and trade
 * use. State lives in the save section `systems.reservations`; ids come from the persisted
 * `nextReservationId` counter and are never reused.
 *
 * Rules: a new reservation can only take unreserved stock (`total - sum of all reservations on
 * that inventory and material`); a reservation is clamped to what the inventory still holds
 * ({@link ReservationService.reconcile}, so expiry or consumption never leaves a promise nobody
 * can keep); a reservation ends by `release`, by `commit` (the goods move to the holder or are
 * consumed) or automatically when its holder or its inventory owner is deleted.
 */
export class ReservationService {
  private list: Reservation[] = [];

  /**
   * Creates the service for one engine.
   *
   * @param engine - The engine whose entities, counters and clock are used.
   */
  constructor(private readonly engine: GameEngine) {}

  /**
   * Reserves exactly the requested quantity of unreserved stock.
   *
   * @param request - Kind, holder, inventory owner, material and quantity.
   * @returns A copy of the new reservation.
   */
  reserve(request: ReserveRequest): Reservation {
    if (!Number.isSafeInteger(request.quantity) || request.quantity < 1) {
      throw new StorageError(
        StorageErrorKind.InvalidQuantity,
        `quantity ${request.quantity} is not a positive integer`,
      );
    }
    const unreserved = this.unreserved(request.inventoryOwnerId, request.materialId);
    if (request.quantity > unreserved) {
      throw new StorageError(
        StorageErrorKind.InsufficientStock,
        `entity ${request.inventoryOwnerId} has ${unreserved} unreserved ${request.materialId}, ${request.quantity} requested`,
      );
    }
    return this.add(request);
  }

  /**
   * Reserves as much as is unreserved, at most the requested quantity.
   *
   * @param request - Kind, holder, inventory owner, material and the wanted quantity.
   * @returns A copy of the new reservation, or null when nothing is unreserved.
   */
  reserveUpTo(request: ReserveRequest): Reservation | null {
    const unreserved = this.unreserved(request.inventoryOwnerId, request.materialId);
    const quantity = Math.min(request.quantity, unreserved);
    return quantity < 1 ? null : this.add({ ...request, quantity });
  }

  /**
   * Gives a reservation back: the stock is claimable again.
   *
   * @param reservationId - Reservation id.
   * @returns True when it existed.
   */
  release(reservationId: number): boolean {
    const before = this.list.length;
    this.list = this.list.filter((reservation) => reservation.id !== reservationId);
    return this.list.length !== before;
  }

  /**
   * Releases every reservation of a holder (its task was cancelled or it was deleted).
   *
   * @param holderId - The claimant.
   * @param kind - Only this kind, or all kinds when omitted.
   * @returns How many reservations were released.
   */
  releaseHolder(holderId: EntityId, kind?: ReservationKind): number {
    return this.drop(
      (reservation) =>
        reservation.holderId === holderId && (kind === undefined || reservation.kind === kind),
    );
  }

  /**
   * Releases every reservation on an inventory (its owner was deleted).
   *
   * @param inventoryOwnerId - The entity that owns the inventory.
   * @returns How many reservations were released.
   */
  releaseInventory(inventoryOwnerId: EntityId): number {
    return this.drop((reservation) => reservation.inventoryOwnerId === inventoryOwnerId);
  }

  /**
   * Fulfils a reservation: the reserved goods leave the inventory and the reservation ends. With a
   * destination they are transferred there (perishable freshness is kept); without one they are
   * consumed (crafting inputs, building materials). The holder acts, so inventory permission
   * rules apply to it. All or nothing: when the move fails the reservation stays.
   *
   * @param reservationId - Reservation id.
   * @param destination - Entity receiving the goods, or null to consume them.
   * @returns The goods that moved.
   */
  commit(reservationId: number, destination: Entity | null): ItemQuantity {
    const reservation = this.require(reservationId);
    const owner = this.engine.store.get(reservation.inventoryOwnerId);
    if (owner === undefined || !hasComponent(owner, inventoryComponent)) {
      throw new StorageError(
        StorageErrorKind.UnknownEntity,
        `entity ${reservation.inventoryOwnerId} has no inventory`,
      );
    }
    const context = {
      materials: this.engine.materials,
      actor: reservation.holderId,
      bus: this.engine.bus,
    };
    if (destination === null) {
      retrieve(context, owner, reservation.materialId, reservation.quantity);
    } else {
      transfer(context, owner, destination, reservation.materialId, reservation.quantity);
    }
    this.release(reservationId);
    return { materialId: reservation.materialId, quantity: reservation.quantity };
  }

  /**
   * One reservation.
   *
   * @param reservationId - Reservation id.
   * @returns A copy, or null when it does not exist.
   */
  get(reservationId: number): Reservation | null {
    const found = this.list.find((reservation) => reservation.id === reservationId);
    return found === undefined ? null : { ...found };
  }

  /**
   * All reservations, ascending by id.
   *
   * @returns Copies.
   */
  all(): Reservation[] {
    return this.list.map((reservation) => ({ ...reservation }));
  }

  /**
   * The reservations of one holder, ascending by id.
   *
   * @param holderId - The claimant.
   * @returns Copies.
   */
  ofHolder(holderId: EntityId): Reservation[] {
    return this.list
      .filter((reservation) => reservation.holderId === holderId)
      .map((reservation) => ({ ...reservation }));
  }

  /**
   * Quantity of a material in an inventory held back by reservations.
   *
   * @param inventoryOwnerId - The entity that owns the inventory.
   * @param materialId - The material.
   * @param exceptHolder - Ignore the reservations of this holder (the requester itself).
   * @returns Reserved units, never more than the inventory holds.
   */
  reservedQuantity(
    inventoryOwnerId: EntityId,
    materialId: string,
    exceptHolder: EntityId | null = null,
  ): number {
    const reserved = this.list
      .filter(
        (reservation) =>
          reservation.inventoryOwnerId === inventoryOwnerId &&
          reservation.materialId === materialId &&
          reservation.holderId !== exceptHolder,
      )
      .reduce((sum, reservation) => sum + reservation.quantity, 0);
    return Math.min(reserved, this.held(inventoryOwnerId, materialId));
  }

  /**
   * What a requester may claim from an inventory: the stock minus the reservations of everybody
   * else (DECISIONS D-09: the holder still sees its own reserved stock).
   *
   * @param inventoryOwnerId - The entity that owns the inventory.
   * @param materialId - The material.
   * @param requesterId - The claimant asking, or null for a requester without reservations.
   * @returns Claimable units.
   */
  availableTo(
    inventoryOwnerId: EntityId,
    materialId: string,
    requesterId: EntityId | null,
  ): number {
    return (
      this.held(inventoryOwnerId, materialId) -
      this.reservedQuantity(inventoryOwnerId, materialId, requesterId)
    );
  }

  /**
   * Clamps every reservation to what its inventory holds and drops those whose holder, inventory
   * or stock is gone (items expire, get consumed or leave through a path that does not know the
   * reservation). Runs every tick in slot 10 and after deletions.
   *
   * @returns How many reservations changed or ended.
   */
  reconcile(): number {
    let changed = 0;
    const seen = new Map<string, number>();
    const kept: Reservation[] = [];
    for (const reservation of this.list) {
      const key = `${reservation.inventoryOwnerId}:${reservation.materialId}`;
      const room =
        this.held(reservation.inventoryOwnerId, reservation.materialId) - (seen.get(key) ?? 0);
      const alive =
        this.engine.store.has(reservation.holderId) &&
        this.engine.store.has(reservation.inventoryOwnerId);
      const quantity = alive ? Math.min(reservation.quantity, room) : 0;
      if (quantity < 1) {
        changed += 1;
        continue;
      }
      if (quantity !== reservation.quantity) {
        changed += 1;
      }
      seen.set(key, (seen.get(key) ?? 0) + quantity);
      kept.push({ ...reservation, quantity });
    }
    this.list = kept;
    return changed;
  }

  /**
   * The save section `systems.reservations`.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "reservations",
      location: SaveSectionLocation.Systems,
      schema: reservationSectionSchema,
      serialize: () => ({ reservations: this.list.map((reservation) => ({ ...reservation })) }),
      restore: (saved: JsonValue) => {
        this.list = reservationSectionSchema.parse(saved).reservations;
      },
      defaultForOlderSaves: () => ({ reservations: [] }),
    };
  }

  private require(reservationId: number): Reservation {
    const found = this.list.find((reservation) => reservation.id === reservationId);
    if (found === undefined) {
      throw new StorageError(
        StorageErrorKind.UnknownReservation,
        `reservation ${reservationId} does not exist`,
      );
    }
    return found;
  }

  private held(inventoryOwnerId: EntityId, materialId: string): number {
    const owner = this.engine.store.get(inventoryOwnerId);
    return owner === undefined || !hasComponent(owner, inventoryComponent)
      ? 0
      : getTotal(owner, materialId);
  }

  private unreserved(inventoryOwnerId: EntityId, materialId: string): number {
    return (
      this.held(inventoryOwnerId, materialId) - this.reservedQuantity(inventoryOwnerId, materialId)
    );
  }

  private add(request: ReserveRequest): Reservation {
    const reservation: Reservation = {
      id: this.engine.counters.allocate(CounterName.ReservationId),
      kind: request.kind,
      holderId: request.holderId,
      inventoryOwnerId: request.inventoryOwnerId,
      materialId: request.materialId,
      quantity: request.quantity,
      createdTick: this.engine.time.tickCount,
    };
    this.list.push(reservation);
    return { ...reservation };
  }

  private drop(matches: (reservation: Reservation) => boolean): number {
    const before = this.list.length;
    this.list = this.list.filter((reservation) => !matches(reservation));
    return before - this.list.length;
  }
}
