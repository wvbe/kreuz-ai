import { BehaviorError, BehaviorErrorKind } from "./BehaviorError";
import type { BehaviorHandlerRegistry } from "./BehaviorHandlerRegistry";
import { behaviorTreeSchema } from "./behaviorTreeSchema";
import { BehaviorNodeType, maxSubTreeNesting, runTreeActionId } from "./behaviorTypes";
import type { BehaviorNode, BehaviorTreeDefinition } from "./behaviorTypes";

/**
 * Reads the sub-tree id of a `run_tree` node, or null when the node is not a valid reference.
 *
 * @param node - Any behavior node.
 * @returns The referenced tree id, or null when `node` is not a `run_tree` action with a string
 *   `treeId` parameter.
 */
export function subTreeReference(node: BehaviorNode): string | null {
  if (node.type === BehaviorNodeType.Action && node.id === runTreeActionId) {
    const treeId = node.params?.["treeId"];
    return typeof treeId === "string" ? treeId : null;
  }
  return null;
}

function collectReferences(node: BehaviorNode, found: Set<string>): void {
  if (node.type === BehaviorNodeType.Selector || node.type === BehaviorNodeType.Sequence) {
    for (const child of node.children) {
      collectReferences(child, found);
    }
    return;
  }
  const reference = subTreeReference(node);
  if (reference !== null) {
    found.add(reference);
  }
}

/**
 * Per-engine registry of behavior trees, loaded once at bootstrap and immutable afterwards
 * (spec 013 FR-016). Loading validates everything up front: the JSON shape and depth, that every
 * condition and action names a registered handler, that every `run_tree` reference resolves and
 * that references contain no cycle. A failed load registers nothing.
 */
export class BehaviorTreeRegistry {
  private readonly trees = new Map<string, BehaviorTreeDefinition>();

  /**
   * Creates an empty registry.
   *
   * @param handlers - Registry the trees' condition and action ids are checked against.
   */
  constructor(private readonly handlers: BehaviorHandlerRegistry) {}

  /**
   * Validates and registers one tree (its sub-tree references must already be registered).
   *
   * @param definition - Tree in the JSON DSL.
   */
  register(definition: BehaviorTreeDefinition): void {
    this.registerAll([definition]);
  }

  /**
   * Validates and registers a batch of trees that may reference each other. Atomic: if any tree
   * is invalid, none is registered.
   *
   * @param definitions - Trees in the JSON DSL.
   */
  registerAll(definitions: BehaviorTreeDefinition[]): void {
    const staged = new Map<string, BehaviorTreeDefinition>();
    for (const definition of definitions) {
      const parsed = behaviorTreeSchema.safeParse(definition);
      if (!parsed.success) {
        const problems = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ");
        throw new BehaviorError(
          BehaviorErrorKind.InvalidTree,
          `invalid behavior tree "${String((definition as { id?: string }).id)}": ${problems}`,
        );
      }
      const tree = parsed.data;
      if (this.trees.has(tree.id) || staged.has(tree.id)) {
        throw new BehaviorError(
          BehaviorErrorKind.DuplicateTree,
          `behavior tree "${tree.id}" is already registered`,
        );
      }
      staged.set(tree.id, tree);
    }
    const known = (id: string): boolean => this.trees.has(id) || staged.has(id);
    for (const tree of staged.values()) {
      this.checkNode(tree.id, tree.root, known);
    }
    const graph = new Map<string, string[]>();
    for (const tree of [...this.trees.values(), ...staged.values()]) {
      const references = new Set<string>();
      collectReferences(tree.root, references);
      graph.set(tree.id, [...references].sort());
    }
    for (const id of [...staged.keys()].sort()) {
      this.checkReferences(id, graph, [], new Map());
    }
    for (const [id, tree] of staged) {
      this.trees.set(id, tree);
    }
  }

  /**
   * Tells whether a tree id is registered.
   *
   * @param id - Tree id.
   * @returns True when registered.
   */
  has(id: string): boolean {
    return this.trees.has(id);
  }

  /**
   * Looks up a tree, throwing for unknown ids.
   *
   * @param id - Tree id.
   * @returns The registered definition.
   */
  require(id: string): BehaviorTreeDefinition {
    const tree = this.trees.get(id);
    if (!tree) {
      throw new BehaviorError(
        BehaviorErrorKind.UnknownTree,
        `behavior tree "${id}" is not registered`,
      );
    }
    return tree;
  }

  /**
   * Lists the registered tree ids in ascending order.
   *
   * @returns Sorted tree ids.
   */
  ids(): string[] {
    return [...this.trees.keys()].sort();
  }

  private checkNode(treeId: string, node: BehaviorNode, known: (id: string) => boolean): void {
    if (node.type === BehaviorNodeType.Selector || node.type === BehaviorNodeType.Sequence) {
      for (const child of node.children) {
        this.checkNode(treeId, child, known);
      }
      return;
    }
    if (node.type === BehaviorNodeType.Condition) {
      if (!this.handlers.hasCondition(node.id)) {
        throw new BehaviorError(
          BehaviorErrorKind.UnknownHandler,
          `tree "${treeId}": condition "${node.id}" is not registered`,
        );
      }
      return;
    }
    if (node.id === runTreeActionId) {
      const reference = subTreeReference(node);
      if (reference === null) {
        throw new BehaviorError(
          BehaviorErrorKind.InvalidTree,
          `tree "${treeId}": run_tree needs a string param "treeId"`,
        );
      }
      if (!known(reference)) {
        throw new BehaviorError(
          BehaviorErrorKind.UnknownTree,
          `tree "${treeId}": run_tree refers to unknown tree "${reference}"`,
        );
      }
      return;
    }
    if (!this.handlers.hasAction(node.id)) {
      throw new BehaviorError(
        BehaviorErrorKind.UnknownHandler,
        `tree "${treeId}": action "${node.id}" is not registered`,
      );
    }
  }

  // Depth-first walk over the reference graph: rejects cycles and reference chains longer than
  // maxSubTreeNesting. `settled` memoizes the longest chain below a tree.
  private checkReferences(
    id: string,
    graph: Map<string, string[]>,
    trail: string[],
    settled: Map<string, number>,
  ): number {
    if (trail.includes(id)) {
      throw new BehaviorError(
        BehaviorErrorKind.CyclicTree,
        `behavior trees reference each other in a cycle: ${[...trail, id].join(" -> ")}`,
      );
    }
    const cached = settled.get(id);
    if (cached !== undefined) {
      return cached;
    }
    let longest = 0;
    for (const reference of graph.get(id) ?? []) {
      longest = Math.max(
        longest,
        1 + this.checkReferences(reference, graph, [...trail, id], settled),
      );
    }
    if (longest > maxSubTreeNesting) {
      throw new BehaviorError(
        BehaviorErrorKind.InvalidTree,
        `tree "${id}" nests run_tree references ${longest} deep; the limit is ${maxSubTreeNesting}`,
      );
    }
    settled.set(id, longest);
    return longest;
  }
}
