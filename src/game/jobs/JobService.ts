import { z } from "zod";
import { SettlementTier } from "../content/contentTypes";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import type { JobPosting } from "./jobTypes";

/**
 * Pays the wage of a completed job. The default mints the coins into the worker's inventory;
 * the trade task (4.1) replaces it with the treasury of the poster faction.
 */
export type WagePayer = (
  engine: GameEngine,
  workerId: EntityId,
  wage: number,
  posting: JobPosting,
) => void;

/**
 * An entity that gave up a posting and may not claim it again before `untilTick`.
 */
export type ClaimBackoff = {
  entityId: EntityId;
  postingId: number;
  untilTick: number;
};

const backoffSectionSchema = z
  .object({
    backoffs: z.array(
      z
        .object({
          entityId: z.number().int().min(1),
          postingId: z.number().int().min(1),
          untilTick: z.number().int().min(0),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Tiers from lowest to highest, for comparing a posting's `TierUnlocked` predicate.
 */
export const tierOrder: readonly string[] = Object.values(SettlementTier);

/**
 * Per-engine job state that is not on entities: the claim back-off list (saved in the section
 * `systems.jobboard`, so a save resumes with the same entities still staying away from the same
 * postings) and two hooks other tasks plug into, the wage payer and the settlement tier source.
 */
export class JobService {
  private backoffList: ClaimBackoff[] = [];
  private payer: WagePayer | null = null;
  private tierSource: (() => string) | null = null;

  /**
   * Remembers that an entity gave up a posting.
   *
   * @param entityId - The worker.
   * @param postingId - The posting it gave up.
   * @param untilTick - First tick at which it may claim the posting again.
   */
  addBackoff(entityId: EntityId, postingId: number, untilTick: number): void {
    this.backoffList = this.backoffList.filter(
      (entry) => !(entry.entityId === entityId && entry.postingId === postingId),
    );
    this.backoffList.push({ entityId, postingId, untilTick });
    this.backoffList.sort((left, right) =>
      left.entityId === right.entityId
        ? left.postingId - right.postingId
        : left.entityId - right.entityId,
    );
  }

  /**
   * Tells whether an entity must stay away from a posting at a tick.
   *
   * @param entityId - The worker.
   * @param postingId - The posting.
   * @param tick - The current tick.
   * @returns True while the back-off lasts.
   */
  isBackedOff(entityId: EntityId, postingId: number, tick: number): boolean {
    return this.backoffList.some(
      (entry) =>
        entry.entityId === entityId && entry.postingId === postingId && tick < entry.untilTick,
    );
  }

  /**
   * Drops back-offs that ran out, and those of postings that no longer exist.
   *
   * @param tick - The current tick.
   * @param isActive - Tells whether a posting id is still on a board.
   */
  prune(tick: number, isActive: (postingId: number) => boolean): void {
    this.backoffList = this.backoffList.filter(
      (entry) => tick < entry.untilTick && isActive(entry.postingId),
    );
  }

  /**
   * Drops every back-off of an entity (it was deleted).
   *
   * @param entityId - The deleted worker.
   */
  forgetEntity(entityId: EntityId): void {
    this.backoffList = this.backoffList.filter((entry) => entry.entityId !== entityId);
  }

  /**
   * The back-offs in force, ascending by entity and posting id.
   *
   * @returns A copy of the list.
   */
  backoffs(): ClaimBackoff[] {
    return this.backoffList.map((entry) => ({ ...entry }));
  }

  /**
   * Replaces the wage payer; `null` restores the default (mint into the worker's inventory).
   *
   * @param payer - The payer, or null.
   */
  setWagePayer(payer: WagePayer | null): void {
    this.payer = payer;
  }

  /**
   * The wage payer in force, or null for the default.
   *
   * @returns The custom payer or null.
   */
  wagePayer(): WagePayer | null {
    return this.payer;
  }

  /**
   * Replaces where the current settlement tier comes from (the tier task of Phase 4 uses this
   * hook); `null` restores the default, the lowest tier.
   *
   * @param source - Function returning a `SettlementTier` value, or null.
   */
  setTierSource(source: (() => string) | null): void {
    this.tierSource = source;
  }

  /**
   * The settlement tier in force.
   *
   * @returns A `SettlementTier` value.
   */
  currentTier(): string {
    return this.tierSource === null ? SettlementTier.Hamlet : this.tierSource();
  }

  /**
   * The save section `systems.jobboard`: the back-off list.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "jobboard",
      location: SaveSectionLocation.Systems,
      schema: backoffSectionSchema,
      serialize: () => ({ backoffs: this.backoffList.map((entry) => ({ ...entry })) }),
      restore: (saved: JsonValue) => {
        this.backoffList = backoffSectionSchema.parse(saved).backoffs;
      },
      defaultForOlderSaves: () => ({ backoffs: [] }),
    };
  }
}
