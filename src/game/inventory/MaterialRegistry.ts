import { z } from "zod";
import { InventoryError, InventoryErrorKind, UnknownMaterialError } from "./InventoryError";

/**
 * Material as the content pack supplies it (spec 022 `MaterialSchema`, DECISIONS D-07): the
 * registry is the single source of truth for stack limit, weight, value and perishability.
 */
export type MaterialDefinition = {
  id: string;
  name: string;
  categories: string[];
  stackLimit: number;
  weightMilli: number;
  valueMilli?: number;
  perishabilityTicks?: number;
};

const contentId = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/**
 * Zod schema of {@link MaterialDefinition}; the content loader (task 1.7) reuses it.
 */
export const materialDefinitionSchema = z
  .object({
    id: z.string().regex(contentId),
    name: z.string().min(1),
    categories: z.array(z.string().regex(contentId)),
    stackLimit: z.number().int().min(1),
    weightMilli: z.number().int().min(0),
    valueMilli: z.number().int().min(0).optional(),
    perishabilityTicks: z.number().int().min(1).optional(),
  })
  .strict();

/**
 * Default id of the currency material (DECISIONS D-25: one coin is one `silver_penny`).
 */
export const defaultCurrencyId = "silver_penny";

/**
 * Per-engine, immutable-after-bootstrap registry of materials (spec 005 assumptions). Materials
 * are not serialized: inventories save material ids only.
 */
export class MaterialRegistry {
  private readonly definitions = new Map<string, MaterialDefinition>();

  /**
   * Creates an empty registry.
   *
   * @param currencyId - Id of the material that backs `getBalance`, `credit` and `debit`.
   */
  constructor(public readonly currencyId: string = defaultCurrencyId) {}

  /**
   * Registers one material after validating it.
   *
   * @param definition - Material definition.
   */
  register(definition: MaterialDefinition): void {
    const parsed = materialDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      throw new InventoryError(
        InventoryErrorKind.InvalidDefinition,
        `material "${String(definition.id)}" is invalid: ${parsed.error.message}`,
      );
    }
    if (this.definitions.has(parsed.data.id)) {
      throw new InventoryError(
        InventoryErrorKind.InvalidDefinition,
        `material "${parsed.data.id}" is already registered`,
      );
    }
    this.definitions.set(parsed.data.id, {
      ...parsed.data,
      categories: [...parsed.data.categories],
    });
  }

  /**
   * Registers several materials in order.
   *
   * @param definitions - Material definitions.
   */
  registerAll(definitions: readonly MaterialDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  /**
   * Tells whether a material id is registered.
   *
   * @param id - Material id.
   * @returns True when known.
   */
  has(id: string): boolean {
    return this.definitions.has(id);
  }

  /**
   * Looks up a material and throws {@link UnknownMaterialError} when it is unknown.
   *
   * @param id - Material id.
   * @returns The definition.
   */
  require(id: string): MaterialDefinition {
    const found = this.definitions.get(id);
    if (!found) {
      throw new UnknownMaterialError(id);
    }
    return found;
  }

  /**
   * Lists all material ids, ascending.
   *
   * @returns Sorted ids.
   */
  ids(): string[] {
    return [...this.definitions.keys()].sort();
  }
}
