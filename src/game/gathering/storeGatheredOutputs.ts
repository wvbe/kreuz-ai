import type { GameEngine } from "../engine/GameEngine";
import { storeUpTo } from "../inventory/inventoryOperations";
import type { ActiveJob } from "../jobs/jobExecutor";
import type { JobOutput } from "../jobs/jobTypes";
import { rollOutputBonus } from "../skills/outputBonus";
import { skillOutputStreamName } from "../skills/skillTypes";
import type { TaskContext } from "../task/taskTypes";

/**
 * Gives the worker what a gathering job yields: the first amount gets the skill output bonus of
 * the job type's skill (`rollOutputBonus`, DECISIONS D-20; the roll draws from the `skill.output`
 * stream only when the worker has a fractional bonus), every amount goes into the worker's
 * inventory as far as it fits (the haul poster takes carried job outputs to a stockpile).
 *
 * @param engine - The engine.
 * @param context - The task context (the worker is `context.entity`).
 * @param job - The claimed job.
 * @param amounts - What the job yields before the bonus.
 * @returns What was stored, one entry per material.
 */
export function storeGatheredOutputs(
  engine: GameEngine,
  context: TaskContext,
  job: ActiveJob,
  amounts: readonly JobOutput[],
): JobOutput[] {
  const bonus = rollOutputBonus(
    engine.content,
    context.entity,
    job.jobType,
    engine.prng.stream(skillOutputStreamName),
  );
  const outputs: JobOutput[] = [];
  for (const [index, amount] of amounts.entries()) {
    const wanted = amount.quantity + (index === 0 ? bonus : 0);
    const result = storeUpTo(
      { materials: engine.materials, actor: null, bus: engine.bus },
      context.entity,
      amount.materialId,
      wanted,
    );
    if (result.stored > 0) {
      outputs.push({ materialId: amount.materialId, quantity: result.stored });
    }
  }
  return outputs;
}
