import { z } from "zod";
import { defineQuery } from "../api/defineQuery";
import type { GameEngine } from "../engine/GameEngine";
import { PathfindingService } from "./PathfindingService";

/**
 * Id of the pathfinding system (dependency name for systems that call the service).
 */
export const pathfindingSystemId = "pathfinding";

const services = new WeakMap<GameEngine, PathfindingService>();

const cellSchema = z.number().int().min(0);
const mapIdSchema = z.number().int().min(1);
const budgetSchema = z.number().int().min(1).optional();
const locationSchema = z.object({ mapId: mapIdSchema, cellIndex: cellSchema }).strict();

/**
 * Registers pathfinding with an engine through `engine.registerSystem` (once; later calls return
 * the same service, so any system can call it in its own setup). The system owns no tick function,
 * no events and no save section: the service is derived state whose cache is cleared on every
 * `newGame` / `loadGame` (DECISIONS D-41). It adds the queries `find-path`
 * (`{mapId, from, to, maxExpansions?}`), `find-route` (`{from, to, maxExpansions?}` with
 * `{mapId, cellIndex}` locations) and `reachable` (`{mapId, from, maxCost?}`), all returning
 * plain JSON.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`.
 * @returns The engine's pathfinding service.
 */
export function registerPathfinding(engine: GameEngine): PathfindingService {
  const existing = services.get(engine);
  if (existing !== undefined) {
    return existing;
  }
  const service = new PathfindingService({
    maps: engine.maps,
    terrain: engine.content.terrain,
    bus: engine.bus,
  });
  engine.registerSystem({
    id: pathfindingSystemId,
    init: () => {
      service.clearCache();
    },
    queries: {
      "find-path": defineQuery({
        schema: z
          .object({
            mapId: mapIdSchema,
            from: cellSchema,
            target: cellSchema,
            maxExpansions: budgetSchema,
          })
          .strict(),
        run: (args) =>
          service.findPath(args.mapId, args.from, args.target, {
            maxExpansions: args.maxExpansions,
          }),
      }),
      "find-route": defineQuery({
        schema: z
          .object({ from: locationSchema, target: locationSchema, maxExpansions: budgetSchema })
          .strict(),
        run: (args) =>
          service.findRoute(args.from, args.target, { maxExpansions: args.maxExpansions }),
      }),
      reachable: defineQuery({
        schema: z
          .object({
            mapId: mapIdSchema,
            from: cellSchema,
            maxCost: z.number().int().min(0).optional(),
          })
          .strict(),
        run: (args) => service.reachable(args.mapId, args.from, args.maxCost),
      }),
    },
  });
  services.set(engine, service);
  return service;
}
