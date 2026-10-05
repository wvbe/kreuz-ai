import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";

/**
 * Serialized interpreter state of one entity.
 */
export type AiStateData = {
  /**
   * Id of the entity's current behavior tree, or null when it has none.
   */
  treeId: string | null;
  /**
   * While `running`: child indices from the root to the running leaf (through `run_tree` via 0).
   */
  currentNode: number[];
  running: boolean;
  /**
   * Tick at which an action node last ran.
   */
  lastActionTick: number;
};

/**
 * The `AiState` component (DECISIONS D-25): which tree an entity runs and where its running
 * node is, so a save taken mid-behavior resumes at the same leaf.
 */
export const aiStateComponent = defineComponent(
  "AiState",
  z
    .object({
      treeId: z.string().min(1).nullable(),
      currentNode: z.array(z.number().int().min(0)),
      running: z.boolean(),
      lastActionTick: z.number().int().min(0),
    })
    .strict()
    .refine((state) => state.running || state.currentNode.length === 0, {
      message: "currentNode must be empty while not running",
    }) satisfies z.ZodType<AiStateData>,
  () => ({ treeId: null, currentNode: [], running: false, lastActionTick: 0 }),
);
