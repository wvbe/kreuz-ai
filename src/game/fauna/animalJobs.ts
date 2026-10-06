import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { AnimalKind } from "../content/contentTypes";
import type { AnimalPrototypeContent } from "../content/schemas/characterSchemas";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { isJsonObject } from "../ecs/jsonData";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { retrieve, storeUpTo } from "../inventory/inventoryOperations";
import { childCompleted, registerJobType } from "../jobs/jobExecutor";
import type { ActiveJob, JobExecutor } from "../jobs/jobExecutor";
import { approachFailedReason, targetInvalidReason } from "../jobs/jobTypes";
import type { JobOutput } from "../jobs/jobTypes";
import { positionComponent } from "../map/positionComponent";
import { workDuration } from "../skills/workSpeed";
import {
  childWait,
  continueStep,
  doneStep,
  failStep,
  tickWait,
  waitStep,
} from "../task/stepResults";
import type { StepResult, TaskContext } from "../task/taskTypes";
import { animalContentOf } from "./animalSenses";
import { cellsAround } from "./animalMovement";
import { removeAnimal } from "./animalLifecycle";
import { AnimalDeathCause, contactCost } from "./faunaTypes";

/**
 * Job type id of collecting the periodic products (wool, milk, eggs) of a livestock animal.
 */
export const tendAnimalsJobId = "tend.animals";

/**
 * Job type id of hunting a wild animal: the hunter catches it and takes the drops.
 */
export const huntGameJobId = "hunt.game";

/**
 * Job type id of butchering a livestock animal: the drops go to the worker, the animal leaves.
 */
export const butcherAnimalJobId = "butcher.animal";

/**
 * Most chase legs (one walk to where the animal was) before the worker gives up on a posting.
 */
export const maxChaseLegs = 12;

/**
 * Failure reason when the animal kept getting away.
 */
export const lostQuarryReason = "lost_quarry";

/**
 * Base work time at the animal, ticks (before `workDuration` scaling).
 */
export const animalWorkBaseTicks = 8;

enum AnimalJobPhase {
  Chase = "chase",
  Work = "work",
}

/**
 * Options of {@link createAnimalJobExecutor}.
 */
export type AnimalJobOptions = {
  /**
   * Applies the effect on the animal once the worker has worked at it; returns the outputs, or
   * null when the animal is no longer a valid target (the posting then fails `target_invalid`).
   */
  complete: (
    engine: GameEngine,
    context: TaskContext,
    animal: Entity,
    job: ActiveJob,
  ) => JobOutput[] | null;
};

function targetAnimal(engine: GameEngine, job: ActiveJob): Entity | null {
  const id = job.posting.target.entityId;
  const entity = id === null ? undefined : engine.store.get(id);
  return entity === undefined ||
    engine.store.isPendingDelete(entity.id) ||
    animalContentOf(engine, entity) === undefined
    ? null
    : entity;
}

function withinContact(engine: GameEngine, worker: Entity, animal: Entity): boolean {
  const own = getComponent(worker, positionComponent);
  const there = getComponent(animal, positionComponent);
  return (
    own !== undefined &&
    there !== undefined &&
    own.mapId === there.mapId &&
    cellsAround(engine, worker, contactCost).some((reachable) => reachable.cell === there.cellIndex)
  );
}

function chaseLegs(context: TaskContext): number {
  const data = context.task.data;
  const legs = isJsonObject(data) ? data["legs"] : 0;
  return typeof legs === "number" ? legs : 0;
}

function chaseStep(
  engine: GameEngine,
  context: TaskContext,
  job: ActiveJob,
  animal: Entity,
): StepResult {
  if (withinContact(engine, context.entity, animal)) {
    context.task.phase = AnimalJobPhase.Work;
    return waitStep(
      tickWait(
        context.tick +
          workDuration(engine.content, context.entity, job.jobType, animalWorkBaseTicks),
      ),
    );
  }
  const legs = chaseLegs(context) + 1;
  if (legs > maxChaseLegs) {
    return failStep(lostQuarryReason);
  }
  const there = getComponent(animal, positionComponent);
  if (there === undefined) {
    return failStep(targetInvalidReason);
  }
  const base = isJsonObject(context.task.data) ? context.task.data : {};
  context.task.data = { ...base, legs };
  context.task.phase = AnimalJobPhase.Chase;
  return waitStep(
    childWait(context.spawnChild(AiTaskType.Move, moveTaskData(there.mapId, there.cellIndex))),
  );
}

/**
 * Builds the executor of the animal jobs (DECISIONS D-140): the worker walks to the animal's
 * current cell, and when the animal has moved on (it flees, wanders) walks again, at most
 * {@link maxChaseLegs} times (`lost_quarry`, the posting is released with a back-off). Within
 * `contactCost` of the animal it works {@link animalWorkBaseTicks} (scaled by `workDuration`, a
 * serialized tick wait) and then `complete` applies the effect. An animal that is gone fails the
 * posting with `target_invalid`.
 *
 * @param engine - The engine.
 * @param options - The completion effect.
 * @returns An executor for `registerJobType`.
 */
export function createAnimalJobExecutor(
  engine: GameEngine,
  options: AnimalJobOptions,
): JobExecutor {
  return {
    requires: ["Position"],
    start: (context, job) => {
      const animal = targetAnimal(engine, job);
      return animal === null
        ? failStep(targetInvalidReason)
        : chaseStep(engine, context, job, animal);
    },
    step: (context, record, job) => {
      if (record.phase === AnimalJobPhase.Work) {
        return record.wake === null ? continueStep() : doneStep();
      }
      const animal = targetAnimal(engine, job);
      if (animal === null) {
        return failStep(targetInvalidReason);
      }
      return childCompleted(record)
        ? chaseStep(engine, context, job, animal)
        : failStep(approachFailedReason);
    },
    complete: (context, job) => {
      const animal = targetAnimal(engine, job);
      return animal === null ? null : options.complete(engine, context, animal, job);
    },
  };
}

function giveToWorker(
  engine: GameEngine,
  worker: Entity,
  materialId: string,
  quantity: number,
): JobOutput | null {
  const result = storeUpTo(
    { materials: engine.materials, actor: null, bus: engine.bus },
    worker,
    materialId,
    quantity,
  );
  return result.stored > 0 ? { materialId, quantity: result.stored } : null;
}

function addOutput(outputs: JobOutput[], output: JobOutput | null): void {
  if (output === null) {
    return;
  }
  const existing = outputs.find((entry) => entry.materialId === output.materialId);
  if (existing === undefined) {
    outputs.push(output);
  } else {
    existing.quantity += output.quantity;
  }
}

/**
 * Moves everything the animal holds into the worker's inventory as far as it fits.
 *
 * @param engine - The engine.
 * @param worker - The worker.
 * @param animal - The animal whose inventory is emptied.
 * @returns What was taken, one entry per material.
 */
export function collectAnimalProducts(
  engine: GameEngine,
  worker: Entity,
  animal: Entity,
): JobOutput[] {
  const held = getComponent(animal, inventoryComponent)?.slots ?? [];
  const wanted = new Map<string, number>();
  for (const slot of held) {
    wanted.set(slot.materialId, (wanted.get(slot.materialId) ?? 0) + slot.quantity);
  }
  const outputs: JobOutput[] = [];
  for (const [materialId, quantity] of [...wanted.entries()].sort(([left], [right]) =>
    left < right ? -1 : 1,
  )) {
    const taken = giveToWorker(engine, worker, materialId, quantity);
    if (taken !== null) {
      retrieve(
        { materials: engine.materials, actor: null, bus: engine.bus },
        animal,
        materialId,
        taken.quantity,
      );
      addOutput(outputs, taken);
    }
  }
  return outputs;
}

function dropsOf(content: AnimalPrototypeContent): JobOutput[] {
  return content.drops.map((drop) => ({ materialId: drop.materialId, quantity: drop.quantity }));
}

function slaughter(
  engine: GameEngine,
  worker: Entity,
  animal: Entity,
  kind: AnimalKind,
  cause: AnimalDeathCause,
): JobOutput[] | null {
  const content = animalContentOf(engine, animal);
  if (content === undefined || content.kind !== kind || content.drops.length === 0) {
    return null;
  }
  const outputs = collectAnimalProducts(engine, worker, animal);
  for (const drop of dropsOf(content)) {
    addOutput(outputs, giveToWorker(engine, worker, drop.materialId, drop.quantity));
  }
  removeAnimal(engine, animal, cause);
  return outputs;
}

/**
 * Registers the executors of `tend.animals`, `hunt.game` and `butcher.animal`
 * (the job types come from `jobs.json`):
 * - `tend.animals`: livestock only; the worker takes the products the animal holds (nothing held:
 *   `target_invalid`);
 * - `butcher.animal`: livestock whose record has drops; the worker gets the products it held and
 *   the drops (as far as they fit), the animal is removed (`animal.died`, cause `butchered`);
 * - `hunt.game`: wild animals; same, cause `hunted`.
 *
 * @param engine - The engine.
 */
export function registerAnimalJobs(engine: GameEngine): void {
  registerJobType(
    engine,
    tendAnimalsJobId,
    createAnimalJobExecutor(engine, {
      complete: (world, context, animal) => {
        const content = animalContentOf(world, animal);
        if (content === undefined || content.kind !== AnimalKind.Livestock) {
          return null;
        }
        const outputs = collectAnimalProducts(world, context.entity, animal);
        return outputs.length === 0 ? null : outputs;
      },
    }),
  );
  registerJobType(
    engine,
    butcherAnimalJobId,
    createAnimalJobExecutor(engine, {
      complete: (world, context, animal) =>
        slaughter(world, context.entity, animal, AnimalKind.Livestock, AnimalDeathCause.Butchered),
    }),
  );
  registerJobType(
    engine,
    huntGameJobId,
    createAnimalJobExecutor(engine, {
      complete: (world, context, animal) =>
        slaughter(world, context.entity, animal, AnimalKind.Wild, AnimalDeathCause.Hunted),
    }),
  );
}
