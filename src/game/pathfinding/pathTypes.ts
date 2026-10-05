/**
 * Shared data model of the pathfinding module (spec 012, DECISIONS D-21 and D-41). Every type is
 * plain JSON (cell indices and integers), so a result can be stored in a task or a save.
 */

/**
 * Outcome tag of a search (DECISIONS D-21): the three cases are distinct, an empty `cells` list
 * never stands for "no path".
 */
export enum PathResultKind {
  Found = "found",
  AlreadyThere = "already-there",
  NoPath = "no-path",
}

/**
 * Why there is no path.
 */
export enum NoPathReason {
  /**
   * The target cannot be reached (also: the target cell itself is not traversable).
   */
  Unreachable = "unreachable",
  /**
   * A map or cell does not exist (out of range, unknown map, not an integer).
   */
  InvalidPosition = "invalid-position",
  /**
   * The search hit the node-expansion budget before it could decide (D-21: reported as no path).
   */
  BudgetExceeded = "budget-exceeded",
}

/**
 * Result of a search inside one map.
 */
export type PathResult =
  | {
      kind: PathResultKind.Found;
      /**
       * Cells to enter in order, excluding the start; the last one is the target.
       */
      cells: number[];
      /**
       * Sum of the movement costs of the entered cells.
       */
      cost: number;
    }
  | { kind: PathResultKind.AlreadyThere }
  | { kind: PathResultKind.NoPath; reason: NoPathReason };

/**
 * A cell on a map: the same shape as the `Position` component.
 */
export type PathLocation = {
  mapId: number;
  cellIndex: number;
};

/**
 * Result of a search that may cross map links (D-21 "cross-map").
 */
export type RouteResult =
  | {
      kind: PathResultKind.Found;
      /**
       * Locations to enter in order, excluding the start. Taking a link shows up as the next
       * step being on another map; the last step is the target.
       */
      steps: PathLocation[];
      /**
       * Sum of the entry costs, including {@link linkTraversalCost} per link taken.
       */
      cost: number;
    }
  | { kind: PathResultKind.AlreadyThere }
  | { kind: PathResultKind.NoPath; reason: NoPathReason };

/**
 * Options of a search.
 */
export type PathOptions = {
  /**
   * Node-expansion budget; default {@link defaultMaxExpansions}.
   */
  maxExpansions?: number;
};

/**
 * One reachable cell and its cheapest cost from the origin.
 */
export type ReachableCell = {
  cell: number;
  cost: number;
};

/**
 * Default node-expansion budget (DECISIONS D-21).
 */
export const defaultMaxExpansions = 200000;

/**
 * Cost of taking a map link (DECISIONS D-21 "Transition entities with cost 10").
 */
export const linkTraversalCost = 10;
