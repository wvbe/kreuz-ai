import { z } from "zod";
import { MapError, MapErrorKind } from "./MapError";
import { BlockReason, MoveCostClass } from "./mapTypes";

/**
 * Terrain definition as the content pack supplies it (spec 022 terrain schema, DECISIONS D-04).
 * Impassable terrain names why it blocks (`water`, `impassable_cliff`).
 */
export type TerrainDefinition = {
  id: string;
  moveCost: MoveCostClass;
  passable: boolean;
  blockReason: BlockReason | null;
};

/**
 * Zod schema of {@link TerrainDefinition}: a passable terrain has no block reason, an impassable
 * one has `water` or `impassable_cliff`.
 */
export const terrainDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/),
    moveCost: z.enum(MoveCostClass),
    passable: z.boolean(),
    blockReason: z.enum(BlockReason).nullable(),
  })
  .strict()
  .refine(
    (terrain) =>
      terrain.passable
        ? terrain.blockReason === null
        : terrain.blockReason === BlockReason.Water ||
          terrain.blockReason === BlockReason.ImpassableCliff,
    { message: "passable terrain has no blockReason; impassable needs water or impassable_cliff" },
  );

/**
 * Per-engine registry of terrain definitions (AD8); the content loader (task 1.7) fills it.
 * Definitions are not serialized: saves keep terrain ids only.
 */
export class TerrainRegistry {
  private readonly definitions = new Map<string, TerrainDefinition>();

  /**
   * Registers one terrain after validating it.
   *
   * @param definition - Terrain definition.
   */
  register(definition: TerrainDefinition): void {
    const parsed = terrainDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      throw new MapError(
        MapErrorKind.InvalidDefinition,
        `terrain "${String(definition.id)}" is invalid: ${parsed.error.message}`,
      );
    }
    if (this.definitions.has(parsed.data.id)) {
      throw new MapError(
        MapErrorKind.DuplicateTerrain,
        `terrain "${parsed.data.id}" is already registered`,
      );
    }
    this.definitions.set(parsed.data.id, parsed.data);
  }

  /**
   * Registers several terrains in order.
   *
   * @param definitions - Terrain definitions.
   */
  registerAll(definitions: readonly TerrainDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  /**
   * Tells whether a terrain id is registered.
   *
   * @param id - Terrain id.
   * @returns True when known.
   */
  has(id: string): boolean {
    return this.definitions.has(id);
  }

  /**
   * Looks up a terrain and throws when it is unknown.
   *
   * @param id - Terrain id.
   * @returns The definition.
   */
  require(id: string): TerrainDefinition {
    const found = this.definitions.get(id);
    if (!found) {
      throw new MapError(MapErrorKind.UnknownTerrain, `unknown terrain "${id}"`);
    }
    return found;
  }

  /**
   * Lists all terrain ids, ascending.
   *
   * @returns Sorted ids.
   */
  ids(): string[] {
    return [...this.definitions.keys()].sort();
  }
}
