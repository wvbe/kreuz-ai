import type { JsonValue } from "../../../game/engine/EventBus";

function asRecord(value: JsonValue | undefined): { [key: string]: JsonValue } | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

/**
 * Names the behavior tree node an entity is running (spec 024 FR-007): the types of the composite
 * nodes on the way down and the id of the leaf, for example `selector > sequence > claim job`.
 * The path is the `currentNode` of the `AiState` component (child indices from the root); a path
 * that leaves the tree (a sub-tree reached through `run_tree`, or a tree that changed) ends at the
 * last node that could be followed.
 *
 * @param root - The `root` node of the tree definition (JSON).
 * @param path - Child indices from the root to the running leaf.
 * @returns The names from the root down, empty when the root is unknown.
 */
export function describeActiveNode(root: JsonValue | undefined, path: readonly number[]): string[] {
  const names: string[] = [];
  let node = asRecord(root);
  let depth = 0;
  while (node !== null) {
    const id = node["id"];
    const type = node["type"];
    names.push(typeof id === "string" ? id.replaceAll("_", " ") : String(type));
    const children = node["children"];
    const index = path[depth];
    if (!Array.isArray(children) || index === undefined) {
      break;
    }
    node = asRecord(children[index]);
    depth += 1;
  }
  return names;
}
