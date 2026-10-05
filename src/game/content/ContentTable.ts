import type { JsonValue } from "../engine/EventBus";

/**
 * Thrown when a content table is asked for a key it does not hold.
 */
export class UnknownContentError extends Error {
  /**
   * Creates the error.
   *
   * @param table - Name of the table, e.g. `skills`.
   * @param key - The key that was not found.
   */
  constructor(
    public readonly table: string,
    public readonly key: string,
  ) {
    super(`unknown ${table} entry "${key}"`);
    this.name = "UnknownContentError";
  }
}

/**
 * Recursively freezes a JSON-like value so loaded content cannot be changed by accident.
 *
 * @param value - Object, array or primitive.
 * @returns The same value, frozen.
 */
export function deepFreeze<Value>(value: Value): Value {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as { [key: string]: JsonValue })) {
      deepFreeze(child);
    }
  }
  return value;
}

/**
 * Read-only, per-engine lookup table of one content category (spec 022 FR-015: registries are
 * read-only after load). Records keep file order; ids are listed ascending.
 */
export class ContentTable<Item> {
  private readonly byKey = new Map<string, Item>();
  private readonly ordered: Item[];

  /**
   * Builds a table from already validated records and freezes them.
   *
   * @param name - Table name used in error messages.
   * @param records - Records in file order; keys must be unique.
   * @param keyOf - Reads the unique key (usually the id) of a record.
   */
  constructor(
    public readonly name: string,
    records: readonly Item[],
    keyOf: (record: Item) => string,
  ) {
    this.ordered = records.map((record) => deepFreeze(record));
    for (const record of this.ordered) {
      this.byKey.set(keyOf(record), record);
    }
  }

  /**
   * Number of records.
   *
   * @returns The count.
   */
  get size(): number {
    return this.ordered.length;
  }

  /**
   * Tells whether a key exists.
   *
   * @param key - Record key.
   * @returns True when present.
   */
  has(key: string): boolean {
    return this.byKey.has(key);
  }

  /**
   * Finds a record.
   *
   * @param key - Record key.
   * @returns The record or undefined.
   */
  find(key: string): Item | undefined {
    return this.byKey.get(key);
  }

  /**
   * Looks a record up and throws {@link UnknownContentError} when it is missing.
   *
   * @param key - Record key.
   * @returns The record.
   */
  require(key: string): Item {
    const found = this.byKey.get(key);
    if (found === undefined) {
      throw new UnknownContentError(this.name, key);
    }
    return found;
  }

  /**
   * Lists all records in file order.
   *
   * @returns A read-only list.
   */
  all(): readonly Item[] {
    return this.ordered;
  }

  /**
   * Lists all keys in ascending order.
   *
   * @returns Sorted keys.
   */
  ids(): string[] {
    return [...this.byKey.keys()].sort();
  }
}
