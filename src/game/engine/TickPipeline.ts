import type { EventBus } from "./EventBus";
import { tickOfDay } from "../time/GameTime";
import type { GameTime } from "../time/GameTime";

/**
 * The canonical tick slots of docs/DECISIONS.md section 2. The numeric values are the execution
 * order and are pinned by `TickPipeline.test.ts` against that document.
 */
export enum TickSlot {
  Begin = 0,
  Commands = 1,
  Time = 2,
  Decay = 3,
  NeedsAndMood = 4,
  AiDecision = 5,
  TaskExecution = 6,
  JobBoards = 7,
  ProductionAndConstruction = 8,
  Zones = 9,
  StockpileTradeTreasury = 10,
  Diplomacy = 11,
  World = 12,
  HousingDay = 13,
  StewardDay = 14,
  TierDay = 15,
  IdentityMaintenance = 16,
  Removal = 17,
  Status = 18,
  LedgerRollover = 19,
  Drain = 20,
}

/**
 * Highest valid slot number.
 */
export const lastTickSlot = TickSlot.Drain;

/**
 * Information passed to every system each tick.
 */
export type TickContext = {
  /**
   * The tick being processed: `tickCount + 1` during slots 0-1 and `tickCount` from slot 2 on.
   */
  tick: number;
  /**
   * `tick mod ticksPerDay`; day systems fire when this equals their constant.
   */
  tickOfDay: number;
};

/**
 * A system registered with the pipeline. Systems in one slot run by ascending `order`, then by
 * registration sequence.
 */
export type PipelineSystem = {
  id: string;
  slot: TickSlot;
  order: number;
  run: (context: TickContext) => void;
};

/**
 * Construction options for {@link TickPipeline}.
 */
export type TickPipelineOptions = {
  time: GameTime;
  bus: EventBus;
};

/**
 * Thrown for invalid registrations.
 */
export class TickPipelineError extends Error {
  /**
   * Creates a pipeline error.
   *
   * @param message - Description of the rejected registration.
   */
  constructor(message: string) {
    super(message);
    this.name = "TickPipelineError";
  }
}

type RegisteredSystem = PipelineSystem & { sequence: number };

/**
 * Orders the single `tick()` primitive. Slot 0 skips the whole tick when paused, otherwise emits
 * `tick.begin` and drains the bus; slot 2 advances the clock; slot 20 ends with the bus drain.
 * Everything else is supplied by systems registered with an explicit slot and order. An exception
 * thrown by a system propagates and leaves the tick unfinished.
 */
export class TickPipeline {
  private readonly systems: RegisteredSystem[] = [];
  private nextSequence = 0;

  /**
   * Creates a pipeline with no systems.
   *
   * @param options - The clock to advance and the bus to drain.
   */
  constructor(private readonly options: TickPipelineOptions) {}

  /**
   * Registers a system. Ids are unique; `order` is an integer that breaks ties within a slot.
   *
   * @param system - The system to add.
   */
  registerSystem(system: PipelineSystem): void {
    if (system.id.length === 0) {
      throw new TickPipelineError("system id must not be empty");
    }
    if (
      !Number.isInteger(system.slot) ||
      system.slot < TickSlot.Begin ||
      system.slot > lastTickSlot
    ) {
      throw new TickPipelineError(`system "${system.id}" has invalid slot ${String(system.slot)}`);
    }
    if (!Number.isSafeInteger(system.order)) {
      throw new TickPipelineError(`system "${system.id}" has a non-integer order`);
    }
    if (this.systems.some((entry) => entry.id === system.id)) {
      throw new TickPipelineError(`system "${system.id}" is already registered`);
    }
    this.systems.push({ ...system, sequence: this.nextSequence });
    this.nextSequence += 1;
    this.systems.sort(
      (left, right) =>
        left.slot - right.slot || left.order - right.order || left.sequence - right.sequence,
    );
  }

  /**
   * Removes a system.
   *
   * @param id - Id given at registration.
   * @returns True when a system was removed.
   */
  unregisterSystem(id: string): boolean {
    const index = this.systems.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return false;
    }
    this.systems.splice(index, 1);
    return true;
  }

  /**
   * Lists the registered systems in execution order.
   *
   * @returns Registrations as `{ id, slot, order }` in the order they run.
   */
  getSystemOrder(): { id: string; slot: TickSlot; order: number }[] {
    return this.systems.map((entry) => ({ id: entry.id, slot: entry.slot, order: entry.order }));
  }

  /**
   * Runs one tick. A paused clock changes nothing and runs no system.
   *
   * @returns True when the tick ran, false when the game is paused.
   */
  tick(): boolean {
    const { time, bus } = this.options;
    if (time.paused) {
      return false;
    }
    const snapshot = [...this.systems];
    const upcoming = time.tickCount + 1;
    bus.emit("tick.begin", { tick: upcoming });
    bus.processQueue();
    let cursor = 0;
    for (let slot = TickSlot.Begin; slot <= lastTickSlot; slot += 1) {
      if (slot === TickSlot.Time) {
        time.advance();
      }
      const context: TickContext = { tick: upcoming, tickOfDay: tickOfDay(upcoming) };
      while (cursor < snapshot.length && (snapshot[cursor] as RegisteredSystem).slot === slot) {
        (snapshot[cursor] as RegisteredSystem).run(context);
        cursor += 1;
      }
      if (slot === TickSlot.Drain) {
        bus.processQueue();
      }
    }
    return true;
  }

  /**
   * Runs up to `count` ticks, stopping early if the game is paused.
   *
   * @param count - Number of ticks to attempt.
   * @returns How many ticks actually ran.
   */
  runTicks(count: number): number {
    let ran = 0;
    while (ran < count && this.tick()) {
      ran += 1;
    }
    return ran;
  }
}
