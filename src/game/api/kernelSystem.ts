import { z } from "zod";
import { CommandMode } from "../engine/engineSystemTypes";
import type { EngineSystemDefinition } from "../engine/engineSystemTypes";
import type { GameEngine } from "../engine/GameEngine";
import type { GameInitOptions } from "../engine/options";
import { TickSlot } from "../engine/TickPipeline";
import {
  CommandKind,
  emptyPayloadSchema,
  loadGamePayloadSchema,
  newGamePayloadSchema,
  saveGamePayloadSchema,
  setSpeedPayloadSchema,
  setTickIntervalPayloadSchema,
  stepPayloadSchema,
} from "./Command";
import type { LoggedCommand } from "./CommandLog";
import { createCommandQueueSection } from "./CommandQueue";
import type { CommandQueue } from "./CommandQueue";
import { defineCommand } from "./defineCommand";
import { defineQuery } from "./defineQuery";
import type { EventLog } from "./EventLog";
import {
  buildCellView,
  buildEntityDetailView,
  buildEntityListView,
  buildEventLogView,
  buildMapEntitiesView,
  buildMapGeometryView,
  buildMapListView,
  buildMapView,
  buildPendingCommandsView,
  buildSettlementView,
  buildStateView,
  buildTimeView,
  maxEntityListLimit,
} from "./viewBuilders";

/**
 * Id of the system the session registers for the kernel commands, queries and command queue.
 */
export const kernelSystemId = "api.session";

/**
 * What the kernel system needs from its session.
 */
export type KernelHost = {
  engine: GameEngine;
  queue: CommandQueue;
  eventLog: EventLog;
  /**
   * Runs up to `ticks` ticks (or flushes the queue when paused); returns how many ticks ran.
   */
  advance: (ticks: number) => number;
  /**
   * Applies the queued commands FIFO; used by the slot-1 system.
   */
  applyQueued: (tick: number) => void;
  /**
   * Replaces what the log stores for the command being executed (NewGame stores its seed).
   */
  setLoggedCommand: (command: LoggedCommand) => void;
};

const emptyArgsSchema = z.object({}).strict();

/**
 * The system definition behind a session (spec 024, DECISIONS D-23): the slot-1 command queue
 * with its save section, the kernel commands (NewGame, LoadGame, SaveGame, Pause, Resume,
 * SetSpeed, SetTickInterval, Step; all immediate) and the kernel queries. It uses the same
 * registration path as every later phase.
 *
 * @param host - The session internals the handlers call.
 * @returns The definition for `GameEngine.registerSystem`.
 */
export function createKernelSystem(host: KernelHost): EngineSystemDefinition {
  const { engine } = host;
  const immediate = CommandMode.Immediate;
  return {
    id: kernelSystemId,
    slot: TickSlot.Commands,
    order: -1000,
    run: (context) => {
      host.applyQueued(context.tick);
    },
    saveSection: createCommandQueueSection(host.queue),
    commandHandlers: {
      [CommandKind.NewGame]: defineCommand({
        schema: newGamePayloadSchema,
        mode: immediate,
        requiresGame: false,
        handler: (payload) => {
          // eslint-disable-next-line no-restricted-syntax -- boundary: newGame validates the options itself with exact messages (spec 007 US4)
          const result = engine.newGame(payload.options as unknown as GameInitOptions);
          const logged: LoggedCommand = {
            kind: CommandKind.NewGame,
            options: {
              seed: result.options.seed,
              difficulty: result.options.difficulty,
              startingTier: result.options.startingTier,
              ...(result.options.mapSize === null ? {} : { mapSize: result.options.mapSize }),
            },
          };
          host.setLoggedCommand(logged);
          return {
            seed: result.options.seed,
            difficulty: result.options.difficulty,
            startingTier: result.options.startingTier,
            mapSize: result.options.mapSize,
            ignoredFields: result.ignoredFields,
          };
        },
      }),
      [CommandKind.LoadGame]: defineCommand({
        schema: loadGamePayloadSchema,
        mode: immediate,
        requiresGame: false,
        handler: (payload) => {
          const result = engine.loadGame(payload.save);
          return {
            originalVersion: result.originalVersion,
            migrated: result.migrated,
            timestamp: result.timestamp,
          };
        },
      }),
      [CommandKind.SaveGame]: defineCommand({
        schema: saveGamePayloadSchema,
        mode: immediate,
        handler: (payload) =>
          engine.saveGame(payload.timestamp === undefined ? {} : { timestamp: payload.timestamp }),
      }),
      [CommandKind.Pause]: defineCommand({
        schema: emptyPayloadSchema,
        mode: immediate,
        handler: () => {
          engine.time.pause();
          return null;
        },
      }),
      [CommandKind.Resume]: defineCommand({
        schema: emptyPayloadSchema,
        mode: immediate,
        handler: () => {
          engine.time.resume();
          return null;
        },
      }),
      [CommandKind.SetSpeed]: defineCommand({
        schema: setSpeedPayloadSchema,
        mode: immediate,
        handler: (payload) => {
          engine.time.setSpeed(payload.speed);
          return null;
        },
      }),
      [CommandKind.SetTickInterval]: defineCommand({
        schema: setTickIntervalPayloadSchema,
        mode: immediate,
        handler: (payload) => {
          engine.time.setTickIntervalMs(payload.tickIntervalMs);
          return null;
        },
      }),
      [CommandKind.Step]: defineCommand({
        schema: stepPayloadSchema,
        mode: immediate,
        handler: (payload) => {
          const ticksRun = host.advance(payload.ticks);
          return { ticksRun, tick: engine.time.tickCount, paused: engine.time.paused };
        },
      }),
    },
    queries: {
      state: defineQuery({
        schema: emptyArgsSchema,
        run: () => buildStateView(engine, host.queue.size),
      }),
      time: defineQuery({
        schema: emptyArgsSchema,
        run: () => buildTimeView(engine),
      }),
      entities: defineQuery({
        schema: z
          .object({
            prototype: z.string().min(1).optional(),
            limit: z.number().int().min(1).max(maxEntityListLimit).optional(),
            offset: z.number().int().min(0).optional(),
          })
          .strict(),
        run: (args) => buildEntityListView(engine, args),
      }),
      entity: defineQuery({
        schema: z.object({ id: z.number().int().min(1) }).strict(),
        run: (args) => buildEntityDetailView(engine, args.id),
      }),
      maps: defineQuery({
        schema: emptyArgsSchema,
        run: () => buildMapListView(engine),
      }),
      map: defineQuery({
        schema: z.object({ mapId: z.number().int().min(1) }).strict(),
        run: (args) => buildMapView(engine, args.mapId),
      }),
      "map-geometry": defineQuery({
        schema: z.object({ mapId: z.number().int().min(1) }).strict(),
        run: (args) => buildMapGeometryView(engine, args.mapId),
      }),
      "map-entities": defineQuery({
        schema: z.object({ mapId: z.number().int().min(1) }).strict(),
        run: (args) => buildMapEntitiesView(engine, args.mapId),
      }),
      cell: defineQuery({
        schema: z
          .object({ mapId: z.number().int().min(1), cell: z.number().int().min(0) })
          .strict(),
        run: (args) => buildCellView(engine, args.mapId, args.cell),
      }),
      settlement: defineQuery({
        schema: emptyArgsSchema,
        run: () => buildSettlementView(engine),
      }),
      "event-log": defineQuery({
        schema: z.object({ count: z.number().int().min(0).optional() }).strict(),
        run: (args) => buildEventLogView(host.eventLog, args.count),
      }),
      "pending-commands": defineQuery({
        schema: emptyArgsSchema,
        run: () => buildPendingCommandsView(host.queue),
      }),
    },
  };
}
