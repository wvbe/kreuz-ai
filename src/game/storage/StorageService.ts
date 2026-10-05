import { z } from "zod";
import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { combineMilli } from "../inventory/inventoryMath";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import { furnitureComponent } from "./furnitureComponent";
import { ReservationService } from "./ReservationService";
import { decayRateModifierId } from "./storageTypes";

/**
 * Extra decay rate source for the items in a storage entity (the Pantry zone of task 3.4 plugs in
 * here): returns a permille multiplier (1000 = unchanged, 500 = half the rate, 0 = no decay), or
 * null when it does not apply to the entity. Must be a pure function of the game state.
 */
export type DecayModifierSource = (engine: GameEngine, entity: Entity) => number | null;

/**
 * Goods that have no storage yet, remembered so that the event
 * `storage.no-compatible-destination` is emitted once per holder and material, not at every look.
 */
export type ReportedGoods = {
  entityId: EntityId;
  materialId: string;
};

const storageSectionSchema = z
  .object({
    reported: z.array(
      z
        .object({
          entityId: z.number().int().min(1),
          materialId: z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Per-engine storage state: the {@link ReservationService}, the list of goods already reported
 * as having no destination (saved in the section `systems.storage`) and the decay modifier hook.
 */
export class StorageService {
  /**
   * The reservations of this engine.
   */
  readonly reservations: ReservationService;
  private reportedList: ReportedGoods[] = [];
  private readonly decaySources: DecayModifierSource[] = [];

  /**
   * Creates the service for one engine.
   *
   * @param engine - The engine whose entities and content are used.
   */
  constructor(private readonly engine: GameEngine) {
    this.reservations = new ReservationService(engine);
  }

  /**
   * Marks goods as reported (no destination).
   *
   * @param entityId - The holder.
   * @param materialId - The material.
   * @returns True when the mark is new, i.e. the event should be emitted now.
   */
  markReported(entityId: EntityId, materialId: string): boolean {
    if (this.isReported(entityId, materialId)) {
      return false;
    }
    this.reportedList.push({ entityId, materialId });
    this.reportedList.sort((left, right) =>
      left.entityId === right.entityId
        ? left.materialId.localeCompare(right.materialId)
        : left.entityId - right.entityId,
    );
    return true;
  }

  /**
   * Whether goods were reported.
   *
   * @param entityId - The holder.
   * @param materialId - The material.
   * @returns True while the mark stands.
   */
  isReported(entityId: EntityId, materialId: string): boolean {
    return this.reportedList.some(
      (entry) => entry.entityId === entityId && entry.materialId === materialId,
    );
  }

  /**
   * Keeps only the marks the predicate accepts (the goods are gone or have a destination again,
   * the holder was deleted).
   *
   * @param keep - Tells whether a mark still applies.
   */
  retainReported(keep: (entry: ReportedGoods) => boolean): void {
    this.reportedList = this.reportedList.filter(keep);
  }

  /**
   * The marks in force, ascending by entity id then material id.
   *
   * @returns Copies.
   */
  reported(): ReportedGoods[] {
    return this.reportedList.map((entry) => ({ ...entry }));
  }

  /**
   * Adds a decay modifier source (see {@link DecayModifierSource}); sources combine by product.
   *
   * @param source - The source to add.
   */
  addDecayModifierSource(source: DecayModifierSource): void {
    this.decaySources.push(source);
  }

  /**
   * The decay rate multiplier for the items inside an entity (spec 018 FR-007/008, DECISIONS D-07):
   * the product (`combineMilli`, so 0 stays 0 and the rest never falls below 1) of the
   * `inventory.decay.rate` effects of its furniture content and of every registered source that
   * applies. Entities that are no furniture are unaffected unless a source says otherwise.
   *
   * @param entity - The entity whose inventory decays.
   * @returns Permille, 1000 = unchanged; this is the `zoneModifierMilli` of `decayInventory`.
   */
  decayModifierMilli(entity: Entity): number {
    let value = 1000;
    const furniture = getComponent(entity, furnitureComponent);
    const record =
      furniture === undefined
        ? undefined
        : this.engine.content.furniture.find(furniture.furnitureId);
    for (const effect of record?.effects ?? []) {
      if (effect.modifierId === decayRateModifierId) {
        value = combineMilli(value, effect.value);
      }
    }
    for (const source of this.decaySources) {
      const modifier = source(this.engine, entity);
      if (modifier !== null) {
        value = combineMilli(value, modifier);
      }
    }
    return value;
  }

  /**
   * The save section `systems.storage`: the goods already reported.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "storage",
      location: SaveSectionLocation.Systems,
      schema: storageSectionSchema,
      serialize: () => ({ reported: this.reportedList.map((entry) => ({ ...entry })) }),
      restore: (saved: JsonValue) => {
        this.reportedList = storageSectionSchema.parse(saved).reported;
      },
      defaultForOlderSaves: () => ({ reported: [] }),
    };
  }
}
