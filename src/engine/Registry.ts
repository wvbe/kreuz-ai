/**
 * Generic typed content registry.
 * All entries are immutable after registration.
 */
export class Registry<T extends { id: string }> {
  private readonly entries = new Map<string, Readonly<T>>();
  private frozen = false;

  /** Register a new entry. Throws if ID is duplicate or registry is frozen. */
  register(entry: T): void {
    if (this.frozen) {
      throw new Error(`Registry is frozen; cannot register "${entry.id}"`);
    }
    if (this.entries.has(entry.id)) {
      throw new Error(`Duplicate entry ID: "${entry.id}"`);
    }
    this.entries.set(entry.id, Object.freeze({ ...entry }) as Readonly<T>);
  }

  /** Register multiple entries at once. */
  registerAll(entries: T[]): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  /** Freeze the registry, preventing further modifications. */
  freeze(): void {
    this.frozen = true;
  }

  /** Get entry by ID. Throws if not found. */
  get(id: string): Readonly<T> {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`Entry not found: "${id}"`);
    }
    return entry;
  }

  /** Get entry by ID, or undefined if not found. */
  tryGet(id: string): Readonly<T> | undefined {
    return this.entries.get(id);
  }

  /** Check if an entry exists. */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Get all entries as a readonly array. */
  getAll(): readonly Readonly<T>[] {
    return Array.from(this.entries.values());
  }

  /** Get all entries matching a predicate. */
  filter(predicate: (entry: Readonly<T>) => boolean): readonly Readonly<T>[] {
    return this.getAll().filter(predicate);
  }

  /** Number of entries in the registry. */
  get size(): number {
    return this.entries.size;
  }
}
