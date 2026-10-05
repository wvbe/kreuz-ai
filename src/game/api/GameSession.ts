import { z } from "zod";
import { loadContent } from "../content/ContentLoader";
import type { ContentRegistries } from "../content/ContentRegistries";
import { cloneJson, isJsonObject, jsonValueSchema } from "../ecs/jsonData";
import { CommandMode } from "../engine/engineSystemTypes";
import type { EngineSystemDefinition } from "../engine/engineSystemTypes";
import type { JsonValue } from "../engine/EventBus";
import { GameEngine } from "../engine/GameEngine";
import type { GameEngineDeps } from "../engine/GameEngine";
import type { MigrationRegistry } from "../save/migrations/MigrationRegistry";
import { ApiError, ApiErrorKind } from "./ApiError";
import { CommandKind, maxStepTicks } from "./Command";
import type { Command } from "./Command";
import { commandLogSchema } from "./CommandLog";
import type {
  CommandLog,
  CommandLogEntry,
  LoggedCommand,
  ReplayOptions,
  ReplayResult,
} from "./CommandLog";
import { CommandQueue } from "./CommandQueue";
import { RunStopReason } from "./CommandResult";
import type {
  ApiErrorData,
  CommandFailure,
  CommandResult,
  EventRecord,
  RunUntilResult,
} from "./CommandResult";
import { defaultRecentEventLimit, EventLog } from "./EventLog";
import { createKernelSystem } from "./kernelSystem";
import { SessionQuery } from "./SessionQuery";
import { formatZodIssues, toApiError } from "./toApiError";

/**
 * Dependencies of a {@link GameSession}.
 */
export type GameSessionDeps = {
  /**
   * Source of the one random uint32 used when NewGame has no seed (see `GameEngineDeps`).
   */
  entropy?: () => number;
  /**
   * Additionally receives every event-bus error report.
   */
  errorSink?: GameEngineDeps["errorSink"];
  /**
   * Save migrations to use instead of the built-in chain.
   */
  migrations?: MigrationRegistry;
  /**
   * Size of the recent-event buffer (default {@link defaultRecentEventLimit}).
   */
  recentEventLimit?: number;
};

/**
 * Handler of an event subscription of the session.
 */
export type SessionEventHandler = (event: EventRecord) => void;

/**
 * The event side of a session (`session.events`).
 */
export type SessionEvents = {
  /**
   * Subscribes to delivered events by topic pattern (`inventory.*`, `**`). The handler gets its
   * own copy of every event. Subscriptions survive NewGame and LoadGame.
   *
   * @returns A function that removes the subscription.
   */
  subscribe: (pattern: string, handler: SessionEventHandler) => () => void;
  /**
   * The newest buffered events, oldest first (a bounded buffer; copies).
   */
  recent: (count?: number) => EventRecord[];
};

const envelopeSchema = z.object({ kind: z.string().min(1) }).loose();

function failure(error: ApiError): CommandFailure {
  const data: ApiErrorData = { kind: error.kind, message: error.message };
  return {
    ok: false,
    error: error.issues.length > 0 ? { ...data, issues: [...error.issues] } : data,
  };
}

/**
 * The one facade renderers, the CLI and tests use (spec 024, DECISIONS D-23, plan "headless
 * contract"). It owns one {@link GameEngine} and nothing else: no timers, no clock, no globals.
 *
 * - `dispatch(command)` validates a JSON command against its registered schema. Immediate
 *   commands (NewGame, LoadGame, SaveGame, Pause, Resume, SetSpeed, SetTickInterval, Step) apply
 *   at once between ticks; every other command is queued and applied FIFO at pipeline slot 1 of
 *   the next tick (`command.applied` / `command.rejected`). Invalid or unknown commands return a
 *   structured error and change nothing; `dispatch` never throws.
 * - `step`, `runUntil` advance time; this is the only way time moves. A host that wants real
 *   time (the CLI, the React `EngineHost`) wraps the session in an `AutoRunner`.
 * - `query` serves plain readonly JSON views, `events` the typed event stream.
 * - `commandLog` records every accepted command; `replay` plays a log into a (fresh) session
 *   and reproduces the identical state hash.
 *
 * A new phase adds commands and queries with one `registerSystem` call; no file of `api/`
 * changes.
 */
export class GameSession {
  /**
   * The engine of this session. Systems are registered through {@link GameSession.registerSystem};
   * renderers should use only the session API.
   */
  readonly engine: GameEngine;
  /**
   * Read-only views.
   */
  readonly query: SessionQuery;
  /**
   * Event stream and recent-event buffer.
   */
  readonly events: SessionEvents;

  private readonly queue = new CommandQueue();
  private readonly eventLog: EventLog;
  private readonly log: CommandLogEntry[] = [];
  private loggedOverride: LoggedCommand | null = null;

  /**
   * Creates an idle session without a game.
   *
   * @param content - Content registries; default the bundled pack.
   * @param deps - Entropy source, error sink, migrations and event buffer size.
   */
  constructor(content?: ContentRegistries, deps: GameSessionDeps = {}) {
    this.engine = new GameEngine(content ?? loadContent(), {
      entropy: deps.entropy,
      errorSink: deps.errorSink,
      migrations: deps.migrations,
    });
    this.eventLog = new EventLog(deps.recentEventLimit ?? defaultRecentEventLimit);
    this.query = new SessionQuery(this.engine, this.queue, this.eventLog);
    this.engine.bus.subscribe("**", (payload, event) => {
      this.eventLog.push(this.engine.time.tickCount, event.name, payload);
    });
    this.events = {
      subscribe: (pattern, handler) => {
        const handle = this.engine.bus.subscribe(pattern, (payload, event) => {
          handler({
            seq: this.eventLog.total,
            tick: this.engine.time.tickCount,
            name: event.name,
            payload: cloneJson(payload),
          });
        });
        return () => {
          this.engine.bus.unsubscribe(handle);
        };
      },
      recent: (count) => this.eventLog.recent(count),
    };
    this.engine.registerSystem(
      createKernelSystem({
        engine: this.engine,
        queue: this.queue,
        eventLog: this.eventLog,
        advance: (ticks) => this.advance(ticks),
        applyQueued: (tick) => {
          this.applyQueued(tick);
        },
        setLoggedCommand: (command) => {
          this.loggedOverride = command;
        },
      }),
    );
  }

  /**
   * Registers a system (tick function, init hook, components, save section, commands, queries)
   * on the session's engine, see `GameEngine.registerSystem`. Do this before the first game.
   *
   * @param definition - The system.
   */
  registerSystem(definition: EngineSystemDefinition): void {
    this.engine.registerSystem(definition);
  }

  /**
   * Whether NewGame or LoadGame has succeeded.
   *
   * @returns True when a game exists.
   */
  get hasGame(): boolean {
    return this.engine.hasGame;
  }

  /**
   * Current tick count.
   *
   * @returns The tick.
   */
  get tick(): number {
    return this.engine.time.tickCount;
  }

  /**
   * Validates and executes or queues one command. Never throws.
   *
   * @param command - A {@link Command} or any JSON `{ kind: string, ...payload }`.
   * @returns Success with the command id (and `queued`), or a structured error; nothing changes
   * on failure.
   */
  dispatch(command: Command): CommandResult;
  /**
   * Validates and executes or queues one command given as untyped JSON. Never throws.
   *
   * @param command - Anything; invalid input yields a structured error.
   * @returns Success with the command id, or a structured error.
   */
  dispatch(
    // eslint-disable-next-line no-restricted-syntax -- command input validation boundary: renderers, scripts and tests send untrusted JSON
    command: unknown,
  ): CommandResult;
  dispatch(
    // eslint-disable-next-line no-restricted-syntax -- command input validation boundary: renderers, scripts and tests send untrusted JSON
    command: unknown,
  ): CommandResult {
    const mark = this.eventLog.mark();
    try {
      return this.execute(command, mark);
    } catch (thrown) {
      return failure(toApiError(thrown));
    }
  }

  /**
   * Starts a new game (command NewGame).
   *
   * @param options - Game options, see `GameInitOptions`.
   * @returns The dispatch result; `data` holds the seed and options in force.
   */
  newGame(options?: { [name: string]: JsonValue }): CommandResult {
    return this.dispatch(
      options === undefined
        ? { kind: CommandKind.NewGame }
        : { kind: CommandKind.NewGame, options },
    );
  }

  /**
   * Runs ticks (command Step). While the clock is paused no tick runs, but waiting commands are
   * applied (DECISIONS D-23).
   *
   * @param ticks - Number of ticks, 1..{@link maxStepTicks}.
   * @returns The dispatch result; `data` is `{ ticksRun, tick, paused }`.
   */
  step(ticks: number): CommandResult {
    return this.dispatch({ kind: CommandKind.Step, ticks });
  }

  /**
   * Runs ticks until the predicate holds or `maxTicks` ticks have run. The predicate is checked
   * before the first tick and after every tick; it must be a deterministic function of the
   * read-only view. The run is logged as one Step command.
   *
   * @param predicate - Condition over the query side of the session.
   * @param maxTicks - Upper bound of ticks to run, 0..{@link maxStepTicks}.
   * @returns How the run ended, or a structured failure.
   */
  runUntil(predicate: (view: SessionQuery) => boolean, maxTicks: number): RunUntilResult {
    const mark = this.eventLog.mark();
    try {
      const bound = z.number().int().min(0).max(maxStepTicks).safeParse(maxTicks);
      if (!bound.success) {
        throw new ApiError(
          ApiErrorKind.InvalidPayload,
          `maxTicks must be an integer from 0 to ${maxStepTicks}`,
        );
      }
      this.requireGame();
      const startTick = this.engine.time.tickCount;
      let ticksRun = 0;
      let flushed = false;
      let stopReason = RunStopReason.MaxTicks;
      let predicateFailure: ApiError | null = null;
      try {
        for (;;) {
          if (predicate(this.query)) {
            stopReason = RunStopReason.Satisfied;
            break;
          }
          if (ticksRun >= maxTicks) {
            break;
          }
          if (this.engine.time.paused) {
            flushed = this.queue.size > 0;
            this.applyQueued(this.engine.time.tickCount);
            stopReason = RunStopReason.Paused;
            break;
          }
          this.engine.tick();
          ticksRun += 1;
        }
      } catch (thrown) {
        predicateFailure = new ApiError(
          ApiErrorKind.PredicateFailed,
          thrown instanceof Error ? thrown.message : String(thrown),
        );
      }
      this.engine.bus.processQueue();
      const logged = ticksRun > 0 ? ticksRun : flushed ? 1 : 0;
      if (logged > 0) {
        this.record(
          this.queue.allocateId(),
          startTick,
          { kind: CommandKind.Step, ticks: logged },
          false,
        );
      }
      if (predicateFailure !== null) {
        return failure(predicateFailure);
      }
      return {
        ok: true,
        satisfied: stopReason === RunStopReason.Satisfied,
        stopReason,
        ticksRun,
        tick: this.engine.time.tickCount,
        ...this.eventLog.since(mark),
      };
    } catch (thrown) {
      return failure(toApiError(thrown));
    }
  }

  /**
   * Serializes the game (command SaveGame).
   *
   * @param timestamp - Optional ISO timestamp for the save metadata.
   * @returns The dispatch result; `data` is the save text.
   */
  save(timestamp?: string): CommandResult {
    return this.dispatch(
      timestamp === undefined
        ? { kind: CommandKind.SaveGame }
        : { kind: CommandKind.SaveGame, timestamp },
    );
  }

  /**
   * Loads a save text (command LoadGame); on failure the current game is untouched.
   *
   * @param text - The save text.
   * @returns The dispatch result.
   */
  load(text: string): CommandResult {
    return this.dispatch({ kind: CommandKind.LoadGame, save: text });
  }

  /**
   * Hash of the complete game state (timestamp neutral), including the command queue.
   *
   * @returns 16 hex characters.
   */
  stateHash(): string {
    return this.engine.getStateHash();
  }

  /**
   * Every accepted command in dispatch order, as an independent copy that can be written to
   * JSON and given to {@link GameSession.replay}.
   *
   * @returns The log.
   */
  get commandLog(): CommandLogEntry[] {
    return this.log.map((entry) => cloneJson(entry));
  }

  /**
   * Plays a command log into this session, normally a fresh one: each command is dispatched when
   * the session has reached the tick it was dispatched at, so the final state hash equals the
   * hash of the session that recorded the log (the engine is deterministic and commands are the
   * only input). Stops at the first problem.
   *
   * @param log - Entries from {@link GameSession.commandLog}.
   * @param options - Optional expected final hash.
   * @returns The final hash, or what went wrong and at which entry.
   */
  replay(log: CommandLog, options: ReplayOptions = {}): ReplayResult {
    const checked = commandLogSchema.safeParse(log);
    if (!checked.success) {
      return {
        ok: false,
        applied: 0,
        index: 0,
        error: {
          kind: ApiErrorKind.ReplayFailed,
          message: "the command log is malformed",
          issues: formatZodIssues(checked.error.issues),
        },
      };
    }
    let applied = 0;
    for (const [index, entry] of log.entries()) {
      const resets =
        entry.command.kind === CommandKind.NewGame || entry.command.kind === CommandKind.LoadGame;
      if (!resets && entry.tick !== this.engine.time.tickCount) {
        return this.replayFailure(
          applied,
          index,
          `entry ${index} was dispatched at tick ${entry.tick} but the session is at tick ${this.engine.time.tickCount}`,
        );
      }
      const result = this.dispatch(entry.command);
      if (!result.ok) {
        return { ok: false, applied, index, error: result.error };
      }
      applied += 1;
    }
    const stateHash = this.stateHash();
    if (options.expectedHash !== undefined && options.expectedHash !== stateHash) {
      return this.replayFailure(
        applied,
        log.length,
        `state hash ${stateHash} differs from the expected ${options.expectedHash}`,
      );
    }
    return { ok: true, applied, tick: this.engine.time.tickCount, stateHash };
  }

  private replayFailure(applied: number, index: number, message: string): ReplayResult {
    return { ok: false, applied, index, error: { kind: ApiErrorKind.ReplayFailed, message } };
  }

  private requireGame(): void {
    if (!this.engine.hasGame) {
      throw new ApiError(ApiErrorKind.NoGame, "no game: dispatch new-game or load-game first");
    }
  }

  private execute(
    // eslint-disable-next-line no-restricted-syntax -- command input validation boundary
    input: unknown,
    mark: number,
  ): CommandResult {
    const envelope = envelopeSchema.safeParse(input);
    if (!envelope.success) {
      throw new ApiError(
        ApiErrorKind.InvalidCommand,
        'a command must be an object with a string "kind"',
        formatZodIssues(envelope.error.issues),
      );
    }
    const { kind, ...rest } = envelope.data;
    const registration = this.engine.getCommandHandler(kind);
    if (registration === undefined) {
      throw new ApiError(ApiErrorKind.UnknownCommand, `unknown command "${kind}"`);
    }
    const checked = registration.schema.safeParse(rest);
    if (!checked.success) {
      throw new ApiError(
        ApiErrorKind.InvalidPayload,
        `invalid payload for command "${kind}"`,
        formatZodIssues(checked.error.issues),
      );
    }
    const json = jsonValueSchema.safeParse(checked.data);
    if (!json.success) {
      throw new ApiError(
        ApiErrorKind.InvalidPayload,
        `payload of command "${kind}" must be JSON with integer numbers only`,
        formatZodIssues(json.error.issues),
      );
    }
    if (!isJsonObject(json.data)) {
      throw new ApiError(
        ApiErrorKind.InvalidPayload,
        `payload of command "${kind}" must be a JSON object`,
      );
    }
    const payload = json.data;
    if (registration.requiresGame !== false) {
      this.requireGame();
    }
    const tick = this.engine.time.tickCount;
    if ((registration.mode ?? CommandMode.Queued) === CommandMode.Queued) {
      const commandId = this.queue.enqueue(kind, payload, tick);
      this.record(commandId, tick, { ...payload, kind }, true);
      return { ok: true, commandId, queued: true, data: null, events: [], droppedEvents: 0 };
    }
    this.loggedOverride = null;
    const data = registration.handler(payload, this.engine);
    this.engine.bus.processQueue();
    const commandId = this.queue.allocateId();
    this.record(commandId, tick, this.loggedOverride ?? { ...payload, kind }, false);
    this.loggedOverride = null;
    return {
      ok: true,
      commandId,
      queued: false,
      data: jsonValueSchema.parse(data),
      ...this.eventLog.since(mark),
    };
  }

  private record(commandId: number, tick: number, command: LoggedCommand, queued: boolean): void {
    this.log.push({ commandId, tick, appliedTick: queued ? null : tick, command });
  }

  private advance(ticks: number): number {
    if (this.engine.time.paused) {
      this.applyQueued(this.engine.time.tickCount);
      return 0;
    }
    return this.engine.runTicks(ticks);
  }

  private findPending(commandId: number): CommandLogEntry | undefined {
    for (let index = this.log.length - 1; index >= 0; index -= 1) {
      const candidate = this.log[index];
      if (candidate?.commandId === commandId && candidate.appliedTick === null) {
        return candidate;
      }
    }
    return undefined;
  }

  private applyQueued(tick: number): void {
    for (const entry of this.queue.takeAll()) {
      const registration = this.engine.getCommandHandler(entry.kind);
      try {
        if (registration === undefined) {
          throw new ApiError(ApiErrorKind.UnknownCommand, `unknown command "${entry.kind}"`);
        }
        registration.handler(entry.payload, this.engine);
        this.engine.bus.emit("command.applied", {
          commandId: entry.commandId,
          commandKind: entry.kind,
        });
      } catch (thrown) {
        this.engine.bus.emit("command.rejected", {
          commandId: entry.commandId,
          commandKind: entry.kind,
          code: toApiError(thrown).kind,
        });
      }
      const logged = this.findPending(entry.commandId);
      if (logged !== undefined) {
        logged.appliedTick = tick;
      }
    }
  }
}
