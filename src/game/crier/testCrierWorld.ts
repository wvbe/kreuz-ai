import type { Entity } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import type { GameEngine } from "../engine/GameEngine";
import { requireBoard } from "../jobs/jobBoards";
import { JobBoardMode } from "../jobs/jobTypes";
import { createJobWorld, noAiOverride } from "../jobs/testJobWorld";
import type { JobTestWorld, JobTestWorldOptions } from "../jobs/testJobWorld";
import { appointCrier } from "./crierFleet";

/**
 * A job test world whose board is user-managed, plus helpers for Town Criers.
 */
export type CrierTestWorld = JobTestWorld & {
  /**
   * Spawns a settler without AI on a cell and appoints it Town Crier.
   */
  spawnCrier: (cell: number) => Entity;
  /**
   * Runs a registered command by kind.
   */
  command: (kind: string, payload: JsonValue) => JsonValue;
  /**
   * Runs a registered query by name.
   */
  query: (name: string, args?: JsonValue) => JsonValue;
};

function commandOf(engine: GameEngine, kind: string, payload: JsonValue): JsonValue {
  const registration = engine.getCommandHandler(kind);
  if (registration === undefined) {
    throw new Error(`no command ${kind}`);
  }
  return registration.handler(payload, engine);
}

function queryOf(engine: GameEngine, name: string, args: JsonValue): JsonValue {
  const registration = engine.getQuery(name);
  if (registration === undefined) {
    throw new Error(`no query ${name}`);
  }
  return registration.run(args, engine);
}

/**
 * Builds the job test world with a user-managed board (default cell 0, the top-left corner).
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world with `spawnCrier`, `command` and `query`.
 */
export function createCrierWorld(options: JobTestWorldOptions = {}): CrierTestWorld {
  const world = createJobWorld(options);
  requireBoard(world.engine, world.boardId).data.mode = JobBoardMode.UserManaged;
  return {
    ...world,
    spawnCrier: (cell) => {
      const entity = world.spawn("peasant", cell, noAiOverride);
      appointCrier(world.engine, entity.id);
      return entity;
    },
    command: (kind, payload) => commandOf(world.engine, kind, payload),
    query: (name, args = {}) => queryOf(world.engine, name, args),
  };
}
