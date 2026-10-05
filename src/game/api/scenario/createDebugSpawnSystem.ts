import { z } from "zod";
import { jsonValueSchema } from "../../ecs/jsonData";
import type { EngineSystemDefinition } from "../../engine/engineSystemTypes";
import { store } from "../../inventory/inventoryOperations";
import { defineCommand } from "../defineCommand";

/**
 * Id of the debug spawn system.
 */
export const debugSpawnSystemId = "debug.spawn";

/**
 * Kind of the debug spawn command.
 */
export const debugSpawnCommandKind = "DebugSpawn";

const payloadSchema = z
  .object({
    prototypeId: z.string().min(1),
    mapId: z.number().int().min(1),
    cells: z.array(z.number().int().min(0)).min(1),
    overrides: z.record(z.string(), z.record(z.string(), jsonValueSchema)).optional(),
    inventory: z
      .array(
        z.object({ materialId: z.string().min(1), quantity: z.number().int().min(1) }).strict(),
      )
      .optional(),
  })
  .strict();

/**
 * The system behind the scenario step `debugSpawn`: the command `DebugSpawn {prototypeId, mapId,
 * cells[], overrides?, inventory?[{materialId, quantity}]}` spawns one entity of a prototype on
 * every listed cell (with component overrides and starting items) and returns `{entityIds}`. It
 * exists **only for scenarios and tests**: it is not registered by the engine, only by
 * `createScenarioSession`, so a real game session answers `DebugSpawn` with "unknown command". It
 * is an ordinary queued command, so it is applied at slot 1 of the next tick, lands in the command
 * log and replays like any other command.
 *
 * @returns A system definition for `GameSession.registerSystem`.
 */
export function createDebugSpawnSystem(): EngineSystemDefinition {
  return {
    id: debugSpawnSystemId,
    commandHandlers: {
      [debugSpawnCommandKind]: defineCommand({
        schema: payloadSchema,
        handler: (payload, engine) => {
          const map = engine.maps.require(payload.mapId);
          for (const cell of payload.cells) {
            if (!map.inBounds(cell)) {
              throw new Error(`cell ${cell} is not on map ${payload.mapId}`);
            }
          }
          const entityIds: number[] = [];
          for (const cell of payload.cells) {
            const entity = engine.store.spawn(payload.prototypeId, {
              ...payload.overrides,
              Position: { mapId: payload.mapId, cellIndex: cell },
            });
            engine.maps.placeEntity(entity.id, payload.mapId, cell);
            for (const item of payload.inventory ?? []) {
              store(
                { materials: engine.materials, actor: null, bus: engine.bus },
                entity,
                item.materialId,
                item.quantity,
              );
            }
            entityIds.push(entity.id);
          }
          return { entityIds };
        },
      }),
    },
  };
}
