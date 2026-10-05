/**
 * One open-set entry of a search.
 */
export type HeapEntry = {
  /**
   * Priority: cost so far plus heuristic.
   */
  priority: number;
  /**
   * Heuristic part of `priority`.
   */
  estimate: number;
  /**
   * Final tie-break key: the cell index (or a map-qualified key on cross-map searches).
   */
  key: number;
  /**
   * Cost so far when the entry was pushed (used to skip outdated entries).
   */
  cost: number;
};

function precedes(left: HeapEntry, right: HeapEntry): boolean {
  if (left.priority !== right.priority) {
    return left.priority < right.priority;
  }
  if (left.estimate !== right.estimate) {
    return left.estimate < right.estimate;
  }
  return left.key < right.key;
}

/**
 * Binary min-heap ordered by `(priority, estimate, key)` ascending, the pure A* tie-break of DECISIONS D-21.
 * No randomness and no insertion-order dependence: entries that compare equal are the same node
 * with the same cost.
 */
export class PathHeap {
  private readonly items: HeapEntry[] = [];

  /**
   * Number of entries.
   *
   * @returns The size.
   */
  get size(): number {
    return this.items.length;
  }

  /**
   * Adds an entry.
   *
   * @param entry - Entry to add.
   */
  push(entry: HeapEntry): void {
    const items = this.items;
    let index = items.length;
    items.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      const above = items[parent] as HeapEntry;
      if (!precedes(entry, above)) {
        break;
      }
      items[index] = above;
      index = parent;
    }
    items[index] = entry;
  }

  /**
   * Removes and returns the smallest entry.
   *
   * @returns The entry, or undefined when empty.
   */
  pop(): HeapEntry | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (top === undefined || last === undefined || items.length === 0) {
      return top;
    }
    let index = 0;
    for (;;) {
      const left = 2 * index + 1;
      if (left >= items.length) {
        break;
      }
      const right = left + 1;
      const leftItem = items[left] as HeapEntry;
      const rightItem = items[right];
      const childIndex = rightItem !== undefined && precedes(rightItem, leftItem) ? right : left;
      const child = items[childIndex] as HeapEntry;
      if (!precedes(child, last)) {
        break;
      }
      items[index] = child;
      index = childIndex;
    }
    items[index] = last;
    return top;
  }
}
