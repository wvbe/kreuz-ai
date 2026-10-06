import { z } from "zod";
import { cloneJson } from "../ecs/jsonData";
import type { EntityId } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import { BoardChangeKind, UpdateOrigin } from "./crierTypes";
import type { BoardChange, PendingBoardUpdate } from "./crierTypes";

const idSchema = z.number().int().min(1);
const tickSchema = z.number().int().min(0);

const changeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal(BoardChangeKind.Add),
      jobTypeId: z.string().min(1),
      mapId: idSchema,
      cellIndex: z.number().int().min(0),
      entityId: idSchema.nullable(),
      materialId: z.string().min(1).nullable(),
      priority: tickSchema.nullable(),
      urgent: z.boolean(),
      wage: tickSchema.nullable(),
    })
    .strict(),
  z.object({ kind: z.literal(BoardChangeKind.Remove), postingId: idSchema }).strict(),
  z
    .object({
      kind: z.literal(BoardChangeKind.Modify),
      postingId: idSchema,
      priority: tickSchema.nullable(),
      wage: tickSchema.nullable(),
    })
    .strict(),
]);

const updateSchema = z
  .object({
    updateId: idSchema,
    boardId: idSchema,
    changes: z.array(changeSchema).min(1),
    origin: z.nativeEnum(UpdateOrigin),
    createdTick: tickSchema,
    crierId: idSchema.nullable(),
    dispatchedTick: tickSchema.nullable(),
    startCost: z.number().int().min(0),
  })
  .strict();

const sectionSchema = z
  .object({
    nextUpdateId: idSchema,
    updates: z.array(updateSchema),
  })
  .strict()
  .refine(
    (data) =>
      data.updates.every(
        (update, index) =>
          update.updateId < data.nextUpdateId &&
          (index === 0 || (data.updates[index - 1]?.updateId ?? 0) < update.updateId),
      ),
    { message: "updates must be unique, ascending and below nextUpdateId" },
  );

/**
 * Per-engine Town Crier state that is not on entities: the pending board updates (DECISIONS D-12;
 * they survive a crier that is deleted while they are still queued) and the update id counter,
 * saved in the section `systems.towncrier`.
 */
export class CrierService {
  private updateList: PendingBoardUpdate[] = [];
  private nextId = 1;

  /**
   * Queues a new update for a board.
   *
   * @param boardId - Target board.
   * @param changes - The changes to apply on arrival (at least one).
   * @param origin - Who queued them.
   * @param tick - The current tick.
   * @returns A copy of the new, undispatched update.
   */
  add(
    boardId: EntityId,
    changes: BoardChange[],
    origin: UpdateOrigin,
    tick: number,
  ): PendingBoardUpdate {
    const update: PendingBoardUpdate = {
      updateId: this.nextId,
      boardId,
      changes: cloneJson(changes),
      origin,
      createdTick: tick,
      crierId: null,
      dispatchedTick: null,
      startCost: 0,
    };
    this.nextId += 1;
    this.updateList.push(update);
    return cloneJson(update);
  }

  /**
   * Looks an update up.
   *
   * @param updateId - Update id.
   * @returns A copy, or null when it is gone.
   */
  find(updateId: number): PendingBoardUpdate | null {
    const found = this.updateList.find((update) => update.updateId === updateId);
    return found === undefined ? null : cloneJson(found);
  }

  /**
   * The pending updates, ascending by id.
   *
   * @returns Copies of the updates.
   */
  updates(): PendingBoardUpdate[] {
    return this.updateList.map((update) => cloneJson(update));
  }

  /**
   * Marks updates as carried by a crier.
   *
   * @param updateIds - Ids to assign.
   * @param crierId - The carrying crier.
   * @param tick - The dispatch tick.
   * @param startCost - Path cost to the board at dispatch.
   */
  assign(updateIds: readonly number[], crierId: EntityId, tick: number, startCost: number): void {
    for (const update of this.updateList) {
      if (updateIds.includes(update.updateId)) {
        update.crierId = crierId;
        update.dispatchedTick = tick;
        update.startCost = startCost;
      }
    }
  }

  /**
   * Hands carried updates back to the queue (the crier could not go on).
   *
   * @param updateIds - Ids to release.
   */
  unassign(updateIds: readonly number[]): void {
    for (const update of this.updateList) {
      if (updateIds.includes(update.updateId)) {
        update.crierId = null;
        update.dispatchedTick = null;
        update.startCost = 0;
      }
    }
  }

  /**
   * Removes an update (applied, cancelled or abandoned).
   *
   * @param updateId - Update id.
   * @returns The removed update, or null when it was gone.
   */
  remove(updateId: number): PendingBoardUpdate | null {
    const found = this.find(updateId);
    this.updateList = this.updateList.filter((update) => update.updateId !== updateId);
    return found;
  }

  /**
   * The save section `systems.towncrier`: pending updates and the id counter.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "towncrier",
      location: SaveSectionLocation.Systems,
      schema: sectionSchema,
      serialize: () => ({
        nextUpdateId: this.nextId,
        updates: this.updateList.map((update) => cloneJson(update)),
      }),
      restore: (saved: JsonValue) => {
        const parsed = sectionSchema.parse(saved);
        this.nextId = parsed.nextUpdateId;
        this.updateList = parsed.updates;
      },
      defaultForOlderSaves: () => ({ nextUpdateId: 1, updates: [] }),
    };
  }
}
