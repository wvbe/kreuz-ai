import { getComponent } from "../../ecs/Entity";
import type { Entity } from "../../ecs/Entity";
import type { GameEngine } from "../../engine/GameEngine";
import { positionComponent } from "../../map/positionComponent";
import { getAiService } from "../aiServiceRegistry";
import { AiStream } from "../aiTypes";

/**
 * Picks the cell an idle entity wanders to (spec 013 idle behavior): uniformly among the cells
 * reachable from its own cell within `wanderRadiusCost` of path cost, excluding the cell it
 * stands on. The only randomness is one draw from the `ai.wander` stream, and the candidate list
 * is in ascending cell order, so equal state and stream give the same cell.
 *
 * @param engine - The engine (pathfinding, content constants, PRNG).
 * @param entity - The wandering entity; without a `Position` there is nowhere to go.
 * @returns The target cell on the entity's map, or null when it cannot go anywhere.
 */
export function pickWanderCell(
  engine: GameEngine,
  entity: Entity,
): { mapId: number; cellIndex: number } | null {
  const position = getComponent(entity, positionComponent);
  if (position === undefined) {
    return null;
  }
  const options = getAiService(engine)
    .pathfinding.reachable(
      position.mapId,
      position.cellIndex,
      engine.content.constants.wanderRadiusCost,
    )
    .filter((reachable) => reachable.cell !== position.cellIndex);
  if (options.length === 0) {
    return null;
  }
  const chosen = engine.prng.stream(AiStream.Wander).choice(options);
  return { mapId: position.mapId, cellIndex: chosen.cell };
}
