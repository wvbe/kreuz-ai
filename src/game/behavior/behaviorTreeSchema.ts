import { z } from "zod";
import { BehaviorNodeType, maxBehaviorDepth } from "./behaviorTypes";
import type { BehaviorNode, BehaviorTreeDefinition } from "./behaviorTypes";

const identifierPattern = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

const identifierSchema = z
  .string()
  .regex(identifierPattern, "ids are lowercase snake_case, e.g. find_food");

const paramsSchema = z.record(z.string(), z.union([z.string(), z.number().int()]));

function compositeSchema(
  type: BehaviorNodeType.Selector | BehaviorNodeType.Sequence,
): z.ZodType<BehaviorNode> {
  return z
    .object({ type: z.literal(type), children: z.array(z.lazy(() => behaviorNodeSchema)).min(1) })
    .strict();
}

function leafSchema(
  type: BehaviorNodeType.Condition | BehaviorNodeType.Action,
): z.ZodType<BehaviorNode> {
  return z
    .object({ type: z.literal(type), id: identifierSchema, params: paramsSchema.optional() })
    .strict();
}

const behaviorNodeSchema: z.ZodType<BehaviorNode> = z.lazy(() =>
  z.union([
    compositeSchema(BehaviorNodeType.Selector),
    compositeSchema(BehaviorNodeType.Sequence),
    leafSchema(BehaviorNodeType.Condition),
    leafSchema(BehaviorNodeType.Action),
  ]),
);

/**
 * Measures the depth of a tree: a lone leaf has depth 1. `run_tree` references count as leaves.
 *
 * @param node - Root of the (sub)tree.
 * @returns The number of nodes on the longest root-to-leaf chain.
 */
export function measureTreeDepth(node: BehaviorNode): number {
  if (node.type === BehaviorNodeType.Selector || node.type === BehaviorNodeType.Sequence) {
    return 1 + Math.max(...node.children.map((child) => measureTreeDepth(child)));
  }
  return 1;
}

/**
 * Zod schema of a behavior tree as authored in content files (the JSON DSL): strict nodes,
 * snake_case ids, at least one child per composite and depth at most {@link maxBehaviorDepth}.
 */
export const behaviorTreeSchema: z.ZodType<BehaviorTreeDefinition> = z
  .object({ id: identifierSchema, root: behaviorNodeSchema })
  .strict()
  .superRefine((tree, context) => {
    const depth = measureTreeDepth(tree.root);
    if (depth > maxBehaviorDepth) {
      context.addIssue({
        code: "custom",
        path: ["root"],
        message: `tree depth ${depth} exceeds the maximum of ${maxBehaviorDepth}`,
      });
    }
  });
