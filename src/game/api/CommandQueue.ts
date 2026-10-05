import { z } from "zod";
import { cloneJson, jsonValueSchema } from "../ecs/jsonData";
import type { JsonValue } from "../engine/EventBus";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";

/**
 * A validated command waiting for pipeline slot 1.
 */
export type QueuedCommand = {
  commandId: number;
  kind: string;
  /**
   * The command object without `kind`, already validated.
   */
  payload: JsonValue;
  /**
   * Tick count at dispatch.
   */
  tick: number;
};

/**
 * Serialized form of {@link CommandQueue} (save section `systems.commandQueue`).
 */
export type CommandQueueState = {
  nextCommandId: number;
  pending: QueuedCommand[];
};

const commandQueueSchema = z
  .object({
    nextCommandId: z.number().int().min(1),
    pending: z.array(
      z
        .object({
          commandId: z.number().int().min(1),
          kind: z.string().min(1),
          payload: jsonValueSchema,
          tick: z.number().int().min(0),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * The FIFO of accepted but not yet applied commands plus the command id counter (DECISIONS
 * D-23). It is game state: it is saved with the game, restored on load and cleared by NewGame,
 * so a save taken between dispatch and the next tick keeps its pending commands.
 */
export class CommandQueue {
  private nextCommandId = 1;
  private pending: QueuedCommand[] = [];

  /**
   * Hands out the next command id (ids are never reused within a game).
   *
   * @returns The id.
   */
  allocateId(): number {
    const commandId = this.nextCommandId;
    this.nextCommandId += 1;
    return commandId;
  }

  /**
   * Appends a command.
   *
   * @param kind - Command kind.
   * @param payload - Validated payload (copied).
   * @param tick - Tick count at dispatch.
   * @returns The command id.
   */
  enqueue(kind: string, payload: JsonValue, tick: number): number {
    const commandId = this.allocateId();
    this.pending.push({ commandId, kind, payload: cloneJson(payload), tick });
    return commandId;
  }

  /**
   * Removes and returns every pending command in dispatch order.
   *
   * @returns The commands.
   */
  takeAll(): QueuedCommand[] {
    const taken = this.pending;
    this.pending = [];
    return taken;
  }

  /**
   * Number of waiting commands.
   *
   * @returns The count.
   */
  get size(): number {
    return this.pending.length;
  }

  /**
   * Copies of the waiting commands in dispatch order.
   *
   * @returns The commands.
   */
  list(): QueuedCommand[] {
    return this.pending.map((entry) => ({ ...entry, payload: cloneJson(entry.payload) }));
  }

  /**
   * Serializes the queue.
   *
   * @returns Counter and pending commands.
   */
  serialize(): CommandQueueState {
    return { nextCommandId: this.nextCommandId, pending: this.list() };
  }

  /**
   * Replaces the content with a saved state.
   *
   * @param saved - Value validated by the section schema.
   */
  restore(saved: JsonValue): void {
    const parsed = commandQueueSchema.parse(saved);
    this.nextCommandId = parsed.nextCommandId;
    this.pending = parsed.pending;
  }
}

/**
 * The save section that persists a {@link CommandQueue} as `systems.commandQueue`.
 *
 * @param queue - The queue of the session.
 * @returns The section for `registerSystem({ saveSection })`.
 */
export function createCommandQueueSection(queue: CommandQueue): SaveSection {
  return {
    key: "commandQueue",
    location: SaveSectionLocation.Systems,
    schema: commandQueueSchema,
    serialize: () => queue.serialize(),
    restore: (saved) => {
      queue.restore(saved);
    },
    defaultForOlderSaves: () => new CommandQueue().serialize(),
  };
}
