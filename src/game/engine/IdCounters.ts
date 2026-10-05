import { z } from "zod";
import type { JsonValue } from "./EventBus";

/**
 * The persisted monotonic ID counters of the save's root `counters` key (DECISIONS D-05).
 * The enum value is the serialized key.
 */
export enum CounterName {
  EntityId = "nextEntityId",
  TaskId = "nextTaskId",
  MapId = "nextMapId",
  PostingId = "nextPostingId",
  ClaimId = "nextClaimId",
  ProductionOrderId = "nextOrderId",
  OfferId = "nextOfferId",
  ReservationId = "nextReservationId",
  JobId = "nextJobId",
  MomentId = "nextMomentId",
  ZoneEventId = "nextZoneEventId",
}

/**
 * Serialized counters: every counter name mapped to the next ID to hand out.
 */
export type CountersState = Record<CounterName, number>;

/**
 * Thrown for unknown counter names, exhausted counters or corrupt saved state.
 */
export class IdCountersError extends Error {
  /**
   * Creates a counter error.
   *
   * @param message - Description of the problem.
   */
  constructor(message: string) {
    super(message);
    this.name = "IdCountersError";
  }
}

/**
 * The first ID ever handed out by every counter. Zero is skipped so ids are always truthy.
 */
export const firstId = 1;

const counterNames: CounterName[] = Object.values(CounterName).sort();

const countersStateSchema = z
  .object(
    Object.fromEntries(
      counterNames.map((name) => [name, z.number().int().min(firstId)] as const),
    ) as Record<CounterName, z.ZodNumber>,
  )
  .strict();

/**
 * Monotonic ID allocator. An ID is never reused, even after the entity or record it named is
 * deleted, because the counter only moves forward and is saved with the game.
 */
export class IdCounters {
  private values: CountersState = IdCounters.initialValues();

  private static initialValues(): CountersState {
    return Object.fromEntries(counterNames.map((name) => [name, firstId])) as CountersState;
  }

  /**
   * Hands out the next ID of a counter.
   *
   * @param name - Which counter to advance.
   * @returns The allocated ID.
   */
  allocate(name: CounterName): number {
    const current = this.values[name];
    if (current === undefined) {
      throw new IdCountersError(`unknown counter "${String(name)}"`);
    }
    if (current >= Number.MAX_SAFE_INTEGER) {
      throw new IdCountersError(`counter "${name}" is exhausted`);
    }
    this.values[name] = current + 1;
    return current;
  }

  /**
   * Reads the ID the next {@link IdCounters.allocate} would return, without advancing.
   *
   * @param name - Which counter to read.
   * @returns The next ID.
   */
  peek(name: CounterName): number {
    const current = this.values[name];
    if (current === undefined) {
      throw new IdCountersError(`unknown counter "${String(name)}"`);
    }
    return current;
  }

  /**
   * Serializes all counters with keys in ascending order.
   *
   * @returns A copy of the counter values.
   */
  serialize(): CountersState {
    return Object.fromEntries(
      counterNames.map((name) => [name, this.values[name]]),
    ) as CountersState;
  }

  /**
   * Replaces all counters with validated saved values. Throws and keeps the current values when
   * a counter is missing, unknown or not a positive integer.
   *
   * @param saved - Parsed JSON of a {@link CountersState}.
   */
  restore(saved: JsonValue): void {
    const parsed = countersStateSchema.safeParse(saved);
    if (!parsed.success) {
      const problems = parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ");
      throw new IdCountersError(`invalid saved counters: ${problems}`);
    }
    this.values = { ...parsed.data };
  }
}
