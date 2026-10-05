import { z } from "zod";
import type { JsonValue } from "../engine/EventBus";
import type { ComponentData, ComponentRegistry } from "./ComponentRegistry";
import { EcsError, EcsErrorKind } from "./EcsError";
import { jsonValueSchema } from "./jsonData";

/**
 * Per-component field overrides: a partial component object merged over the component defaults.
 */
export type ComponentOverrides = { [key: string]: JsonValue };

/**
 * A declarative entity prototype: an id plus the components it has, each with optional field
 * overrides. `{}` for a component means "defaults". Prototypes are content, never serialized.
 */
export type PrototypeDefinition = {
  id: string;
  components: { [componentName: string]: ComponentOverrides };
};

const prototypeIdPattern = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/**
 * Zod schema of one prototype as authored in content files.
 */
export const prototypeSchema: z.ZodType<PrototypeDefinition> = z
  .object({
    id: z.string().regex(prototypeIdPattern, "prototype ids are lowercase snake_case"),
    components: z.record(z.string(), z.record(z.string(), jsonValueSchema)),
  })
  .strict();

/**
 * Per-engine registry of entity prototypes. Registration validates every component name and the
 * merged data (defaults + prototype overrides) against the component schemas.
 */
export class PrototypeRegistry {
  private readonly prototypes = new Map<string, PrototypeDefinition>();

  /**
   * Creates an empty registry.
   *
   * @param components - Registry that supplies component schemas and defaults.
   */
  constructor(private readonly components: ComponentRegistry) {}

  /**
   * Validates and adds one prototype.
   *
   * @param prototype - The prototype to add.
   */
  register(prototype: PrototypeDefinition): void {
    const parsed = prototypeSchema.safeParse(prototype);
    if (!parsed.success) {
      throw new EcsError(
        EcsErrorKind.InvalidDefinition,
        `invalid prototype: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      );
    }
    if (this.prototypes.has(prototype.id)) {
      throw new EcsError(
        EcsErrorKind.DuplicateDefinition,
        `prototype "${prototype.id}" is already registered`,
      );
    }
    for (const [name, overrides] of Object.entries(prototype.components)) {
      const definition = this.components.require(name);
      this.components.validate(name, { ...definition.defaults(), ...overrides });
    }
    this.prototypes.set(prototype.id, parsed.data);
  }

  /**
   * Validates and adds prototypes loaded from content JSON.
   *
   * @param json - A JSON array of prototype definitions.
   */
  registerAll(json: JsonValue): void {
    const parsed = z.array(prototypeSchema).safeParse(json);
    if (!parsed.success) {
      throw new EcsError(
        EcsErrorKind.InvalidDefinition,
        `invalid prototype list: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`,
      );
    }
    for (const prototype of parsed.data) {
      this.register(prototype);
    }
  }

  /**
   * Tells whether a prototype id is registered.
   *
   * @param id - Prototype id.
   * @returns True when registered.
   */
  has(id: string): boolean {
    return this.prototypes.has(id);
  }

  /**
   * Lists registered prototype ids in ascending order.
   *
   * @returns The ids.
   */
  ids(): string[] {
    return [...this.prototypes.keys()].sort();
  }

  /**
   * Builds the components of a new entity: for each component of the prototype, the defaults,
   * then the prototype overrides, then the per-spawn overrides. The result is validated and fully
   * independent of the registry, so instances never share mutable state.
   *
   * @param id - Registered prototype id.
   * @param spawnOverrides - Optional extra overrides, only for components the prototype has.
   * @returns Component data keyed by component name, in ascending name order.
   */
  instantiate(
    id: string,
    spawnOverrides: { [componentName: string]: ComponentOverrides } = {},
  ): { [componentName: string]: ComponentData } {
    const prototype = this.prototypes.get(id);
    if (!prototype) {
      throw new EcsError(EcsErrorKind.UnknownPrototype, `prototype "${id}" is not registered`);
    }
    for (const name of Object.keys(spawnOverrides)) {
      if (!Object.hasOwn(prototype.components, name)) {
        throw new EcsError(
          EcsErrorKind.UnknownComponent,
          `prototype "${id}" has no component "${name}" to override`,
        );
      }
    }
    const result: { [componentName: string]: ComponentData } = {};
    for (const name of Object.keys(prototype.components).sort()) {
      const definition = this.components.require(name);
      result[name] = this.components.validate(name, {
        ...definition.defaults(),
        ...prototype.components[name],
        ...spawnOverrides[name],
      });
    }
    return result;
  }
}
