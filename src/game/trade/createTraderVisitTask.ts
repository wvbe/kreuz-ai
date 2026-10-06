import { z } from "zod";
import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { childCompleted } from "../jobs/jobExecutor";
import { positionComponent } from "../map/positionComponent";
import { childWait, doneStep, failStep, tickWait, waitStep } from "../task/stepResults";
import type { StepResult, TaskContext, TaskHandler, TaskRecord } from "../task/taskTypes";
import { ticksPerDay } from "../time/GameTime";
import { traderComponent } from "./traderComponent";
import { TraderPhase, traderArrivedEvent, traderVisitTaskType } from "./tradeTypes";
import type { TraderVisitEvent } from "./tradeTypes";

const visitDataSchema = z
  .object({
    mapId: z.number().int().min(1),
    marketCell: z.number().int().min(0),
    exitCell: z.number().int().min(0),
  })
  .strict();

enum VisitStep {
  Approach = "approach",
  Stay = "stay",
  Leave = "leave",
}

function walkTo(context: TaskContext, step: VisitStep, mapId: number, cell: number): StepResult {
  context.task.phase = step;
  return waitStep(childWait(context.spawnChild(AiTaskType.Move, moveTaskData(mapId, cell))));
}

function arrive(engine: GameEngine, context: TaskContext): StepResult {
  const trader = getComponent(context.entity, traderComponent);
  if (trader === undefined) {
    return failStep("component_removed");
  }
  const stayTicks = engine.content.constants.traderStayDays * ticksPerDay;
  trader.phase = TraderPhase.Present;
  trader.arrivedTick = context.tick;
  trader.departTick = context.tick + stayTicks;
  const payload: TraderVisitEvent = {
    entityId: context.entityId,
    traderPrototypeId: context.entity.prototype,
    factionId: trader.factionId,
  };
  engine.bus.emit(traderArrivedEvent, payload);
  context.task.phase = VisitStep.Stay;
  return waitStep(tickWait(trader.departTick));
}

function depart(
  engine: GameEngine,
  context: TaskContext,
  mapId: number,
  exitCell: number,
): StepResult {
  const trader = getComponent(context.entity, traderComponent);
  if (trader !== undefined) {
    trader.phase = TraderPhase.Leaving;
  }
  const place = getComponent(context.entity, positionComponent);
  if (place === undefined || place.cellIndex === exitCell) {
    engine.store.requestDelete(context.entityId);
    return doneStep();
  }
  return walkTo(context, VisitStep.Leave, mapId, exitCell);
}

/**
 * Builds the handler of the `trader.visit` task (D-13, plan 4.1): the caravan walks from where it
 * entered the map to the market cell (phase `approach`; it then counts as present, sets its
 * visit times and queues `trader.arrived`), waits there until `traderStayDays` have passed
 * (phase `stay`), walks back out (phase `leave`) and is deleted at the exit cell (the entity
 * hook queues `trader.left`). A walk that cannot be finished puts the caravan at its goal at
 * once, so a visit never hangs. All progress is in the task record and the `Trader` component.
 *
 * @param engine - The engine.
 * @returns The task handler for type `trader.visit`.
 */
export function createTraderVisitTask(engine: GameEngine): TaskHandler {
  return {
    type: traderVisitTaskType,
    requires: ["Position", "Trader"],
    start: (context, data) => {
      const { mapId, marketCell } = visitDataSchema.parse(data);
      const place = getComponent(context.entity, positionComponent);
      if (place?.cellIndex === marketCell) {
        return arrive(engine, context);
      }
      return walkTo(context, VisitStep.Approach, mapId, marketCell);
    },
    step: (context, record: TaskRecord) => {
      const { mapId, marketCell, exitCell } = visitDataSchema.parse(record.data);
      if (record.phase === VisitStep.Approach) {
        if (!childCompleted(record)) {
          engine.maps.moveEntity(context.entityId, marketCell);
          const place = getComponent(context.entity, positionComponent);
          if (place !== undefined) {
            place.cellIndex = marketCell;
          }
        }
        return arrive(engine, context);
      }
      if (record.phase === VisitStep.Stay) {
        return depart(engine, context, mapId, exitCell);
      }
      engine.store.requestDelete(context.entityId);
      return doneStep();
    },
    cancel: () => undefined,
  };
}
