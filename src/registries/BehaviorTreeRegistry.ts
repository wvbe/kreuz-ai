import { Registry } from "../engine/Registry.js";
import {
  BehaviorTreeSchema,
  type BehaviorTree,
} from "../schemas/behavior-trees.js";
import dailyRoutine from "../data/behavior-trees/daily-routine.json" with { type: "json" };
import workerCycle from "../data/behavior-trees/worker-cycle.json" with { type: "json" };
import guardPatrol from "../data/behavior-trees/guard-patrol.json" with { type: "json" };
import merchantRoutine from "../data/behavior-trees/merchant-routine.json" with { type: "json" };
import priestRoutine from "../data/behavior-trees/priest-routine.json" with { type: "json" };
import livestockBehavior from "../data/behavior-trees/livestock-behavior.json" with { type: "json" };
import predatorBehavior from "../data/behavior-trees/predator-behavior.json" with { type: "json" };

export function createBehaviorTreeRegistry(): Registry<BehaviorTree> {
  const registry = new Registry<BehaviorTree>();

  const allData = [
    dailyRoutine,
    workerCycle,
    guardPatrol,
    merchantRoutine,
    priestRoutine,
    livestockBehavior,
    predatorBehavior,
  ];

  for (const raw of allData) {
    const parsed = BehaviorTreeSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
