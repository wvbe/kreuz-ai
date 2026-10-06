import type { GameSession } from "../../src/game/api/GameSession";
import type { Entity } from "../../src/game/ecs/Entity";
import type { JsonValue } from "../../src/game/engine/EventBus";

// Item conservation (plan task 7.1): every item that appears in or disappears from an inventory
// is announced by `inventory.item.stored`, `.retrieved`, `.expired` or `.transferred`. Between two
// checkpoints, for every entity that exists at both, the change of what it holds must equal what
// those events announced for it. An item that is created or lost silently shows up as a mismatch.

type Counts = Map<string, number>;

type ItemEvent = { entityId: number; materialId: string; quantity: number };
type TransferEvent = {
  sourceId: number;
  destinationId: number;
  materialId: string;
  quantity: number;
};

function addTo(
  map: Map<number, Counts>,
  entityId: number,
  materialId: string,
  delta: number,
): void {
  const counts = map.get(entityId) ?? new Map<string, number>();
  counts.set(materialId, (counts.get(materialId) ?? 0) + delta);
  map.set(entityId, counts);
}

function holdings(entity: Entity): Counts {
  const counts: Counts = new Map();
  const inventory = entity.components["Inventory"] as
    { slots: { materialId: string; quantity: number }[] } | undefined;
  for (const slot of inventory?.slots ?? []) {
    counts.set(slot.materialId, (counts.get(slot.materialId) ?? 0) + slot.quantity);
  }
  return counts;
}

/**
 * Follows the inventory events of one session and checks them against the real inventories.
 */
export class InventoryLedger {
  private announced = new Map<number, Counts>();
  private previous = new Map<number, Counts>();
  private readonly session: GameSession;
  /**
   * Number of entity-checks done so far (for the report).
   */
  checked = 0;

  /**
   * Subscribes to the inventory events of a session and takes the first snapshot.
   *
   * @param session - The running game.
   */
  constructor(session: GameSession) {
    this.session = session;
    const bus = session.engine.bus;
    bus.subscribe("inventory.item.stored", (payload: JsonValue) => {
      const event = payload as unknown as ItemEvent;
      addTo(this.announced, event.entityId, event.materialId, event.quantity);
    });
    bus.subscribe("inventory.item.retrieved", (payload: JsonValue) => {
      const event = payload as unknown as ItemEvent;
      addTo(this.announced, event.entityId, event.materialId, -event.quantity);
    });
    bus.subscribe("inventory.item.expired", (payload: JsonValue) => {
      const event = payload as unknown as ItemEvent;
      addTo(this.announced, event.entityId, event.materialId, -event.quantity);
    });
    bus.subscribe("inventory.item.transferred", (payload: JsonValue) => {
      const event = payload as unknown as TransferEvent;
      addTo(this.announced, event.sourceId, event.materialId, -event.quantity);
      addTo(this.announced, event.destinationId, event.materialId, event.quantity);
    });
    this.previous = this.snapshot();
  }

  private snapshot(): Map<number, Counts> {
    const result = new Map<number, Counts>();
    for (const entity of this.session.engine.store.entities()) {
      if (entity.components["Inventory"] !== undefined) {
        result.set(entity.id, holdings(entity));
      }
    }
    return result;
  }

  /**
   * Compares the change since the last checkpoint with the announced events and starts a new
   * interval. Entities that were created or deleted inside the interval are skipped (a corpse's
   * pack goes with it, a newcomer arrives with a kit).
   *
   * @returns One message per entity and material whose items do not add up.
   */
  checkpoint(): string[] {
    const now = this.snapshot();
    const violations: string[] = [];
    for (const [entityId, before] of this.previous) {
      const after = now.get(entityId);
      if (after === undefined) {
        continue;
      }
      const events = this.announced.get(entityId) ?? new Map<string, number>();
      const materials = new Set([...before.keys(), ...after.keys(), ...events.keys()]);
      for (const materialId of materials) {
        const change = (after.get(materialId) ?? 0) - (before.get(materialId) ?? 0);
        const told = events.get(materialId) ?? 0;
        this.checked += 1;
        if (change !== told) {
          violations.push(
            `entity#${entityId} ${materialId}: held ${before.get(materialId) ?? 0} then ${after.get(materialId) ?? 0}, events say ${told >= 0 ? "+" : ""}${told}`,
          );
        }
      }
    }
    this.announced = new Map();
    this.previous = now;
    return violations;
  }
}
