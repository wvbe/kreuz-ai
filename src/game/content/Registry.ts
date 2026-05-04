/**
 * Generic typed registry for content data.
 * Provides get, getAll, search, has, count operations.
 */

export type ContentEntry = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  [key: string]: unknown;
};

export type Registry<T extends ContentEntry> = {
  registryType: string;
  entries: Map<string, T>;
};

/**
 * Creates a new empty registry.
 */
export function createRegistry<T extends ContentEntry>(registryType: string): Registry<T> {
  return { registryType, entries: new Map() };
}

/**
 * Registers an entry.
 */
export function registerEntry<T extends ContentEntry>(registry: Registry<T>, entry: T): void {
  registry.entries.set(entry.id, entry);
}

/**
 * Gets an entry by ID.
 */
export function getEntry<T extends ContentEntry>(
  registry: Registry<T>,
  id: string,
): T | undefined {
  return registry.entries.get(id);
}

/**
 * Gets all entries.
 */
export function getAllEntries<T extends ContentEntry>(registry: Registry<T>): T[] {
  return [...registry.entries.values()];
}

/**
 * Checks if an entry exists.
 */
export function hasEntry<T extends ContentEntry>(registry: Registry<T>, id: string): boolean {
  return registry.entries.has(id);
}

/**
 * Returns the number of entries.
 */
export function countEntries<T extends ContentEntry>(registry: Registry<T>): number {
  return registry.entries.size;
}

/**
 * Searches entries by name or description (case-insensitive substring match).
 */
export function searchEntries<T extends ContentEntry>(
  registry: Registry<T>,
  query: string,
): T[] {
  const lower = query.toLowerCase();
  return getAllEntries(registry).filter(
    (entry) =>
      entry.name.toLowerCase().includes(lower) ||
      (entry.description?.toLowerCase().includes(lower) ?? false) ||
      entry.id.toLowerCase().includes(lower),
  );
}

/**
 * Gets entries by category.
 */
export function getEntriesByCategory<T extends ContentEntry>(
  registry: Registry<T>,
  category: string,
): T[] {
  return getAllEntries(registry).filter((entry) => entry.category === category);
}
