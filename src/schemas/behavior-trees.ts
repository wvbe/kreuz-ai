import { z } from "zod";

export const BehaviorNodeSchema: z.ZodType<BehaviorNode> = z.lazy(() =>
  z
    .object({
      type: z.enum(["selector", "sequence", "condition", "action"]),
      name: z.string().optional(),
      check: z.string().optional(),
      action: z.string().optional(),
      scoring: z.literal("utility").optional(),
      children: z.array(BehaviorNodeSchema).optional(),
    })
    .refine(
      (node) => {
        if (node.type === "selector" || node.type === "sequence") {
          return node.children !== undefined && node.children.length > 0;
        }
        return true;
      },
      {
        message:
          "Composite nodes (selector, sequence) must have non-empty children",
      },
    )
    .refine(
      (node) => {
        if (node.type === "condition" || node.type === "action") {
          return node.children === undefined || node.children.length === 0;
        }
        return true;
      },
      {
        message: "Leaf nodes (condition, action) must not have children",
      },
    )
    .refine(
      (node) => {
        if (node.type === "condition") return node.check !== undefined;
        return true;
      },
      { message: "Condition nodes must have check" },
    )
    .refine(
      (node) => {
        if (node.type === "action") return node.action !== undefined;
        return true;
      },
      { message: "Action nodes must have action" },
    ),
);

export interface BehaviorNode {
  type: "selector" | "sequence" | "condition" | "action";
  name?: string;
  check?: string;
  action?: string;
  scoring?: "utility";
  children?: BehaviorNode[];
}

export const BehaviorTreeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    root: BehaviorNodeSchema,
  })
  .refine((tree) => getMaxDepth(tree.root) <= 5, {
    message: "Tree depth must not exceed 5 levels",
  });

function getMaxDepth(node: BehaviorNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(getMaxDepth));
}

export type BehaviorTree = z.infer<typeof BehaviorTreeSchema>;
