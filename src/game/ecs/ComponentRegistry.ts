import type { z } from "zod";
import type { JsonValue } from "../engine/EventBus";
import { EcsError, EcsErrorKind } from "./EcsError";
import { cloneJson } from "./jsonData";

/**
 * The data of one component: a JSON object with integer-only numbers.
 */
export type ComponentData = { [key: string]: JsonValue };

/**
 * Declares one component type: its PascalCase name, a Zod schema that validates (and normalizes)
 * its data, and a factory for default data. Definitions are plain values; they are not global,
 * each engine registers the ones it uses in its own {@link ComponentRegistry}. Use `.strict()`
 * object schemas so unknown fields in saves are rejected (DECISIONS D-05).
 */
export type ComponentDefinition<
  Name extends string = string,
  Data extends ComponentData = ComponentData,
> = {
  name: Name;
  schema: z.ZodType<Data>;
  defaults: () => Data;
};

/**
 * Extracts the data type of a component definition.
 */
export type ComponentDataOf<Def> =
  Def extends ComponentDefinition<string, infer Data> ? Data : never;

const componentNamePattern = /^[A-Z][A-Za-z0-9]*$/;

/**
 * Tells whether a string is a valid component name (PascalCase, letters and digits).
 *
 * @param name - Candidate name.
 * @returns True when valid.
 */
export function isValidComponentName(name: string): boolean {
  return componentNamePattern.test(name);
}

/**
 * Creates a component definition and checks that its defaults satisfy its schema.
 *
 * @param name - PascalCase component name, e.g. `Inventory`.
 * @param schema - Zod schema of the component data.
 * @param defaults - Factory returning fresh default data on every call.
 * @returns The definition; its `name` keeps the literal type for `hasComponent` narrowing.
 */
export function defineComponent<const Name extends string, Data extends ComponentData>(
  name: Name,
  schema: z.ZodType<Data>,
  defaults: () => Data,
): ComponentDefinition<Name, Data> {
  if (!isValidComponentName(name)) {
    throw new EcsError(
      EcsErrorKind.InvalidDefinition,
      `component name "${name}" must be PascalCase letters and digits`,
    );
  }
  const parsed = schema.safeParse(defaults());
  if (!parsed.success) {
    throw new EcsError(
      EcsErrorKind.InvalidDefinition,
      `defaults of component "${name}" do not satisfy its schema: ${parsed.error.message}`,
    );
  }
  return { name, schema, defaults };
}

/**
 * Per-engine registry of component definitions. Insertion order does not matter: listings are
 * sorted by name.
 */
export class ComponentRegistry {
  private readonly definitions = new Map<string, ComponentDefinition>();

  /**
   * Adds a definition; each name can be registered once.
   *
   * @param definition - The definition to add.
   */
  register(definition: ComponentDefinition): void {
    if (this.definitions.has(definition.name)) {
      throw new EcsError(
        EcsErrorKind.DuplicateDefinition,
        `component "${definition.name}" is already registered`,
      );
    }
    this.definitions.set(definition.name, definition);
  }

  /**
   * Tells whether a component name is registered.
   *
   * @param name - Component name.
   * @returns True when registered.
   */
  has(name: string): boolean {
    return this.definitions.has(name);
  }

  /**
   * Looks up a definition, throwing for unknown names.
   *
   * @param name - Component name.
   * @returns The registered definition.
   */
  require(name: string): ComponentDefinition {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new EcsError(EcsErrorKind.UnknownComponent, `component "${name}" is not registered`);
    }
    return definition;
  }

  /**
   * Lists all definitions sorted by name.
   *
   * @returns The definitions.
   */
  list(): ComponentDefinition[] {
    return [...this.definitions.values()].sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
  }

  /**
   * Validates data against a component's schema and returns an independent, normalized copy.
   *
   * @param name - Registered component name.
   * @param data - Candidate JSON data.
   * @returns The parsed copy.
   */
  validate(name: string, data: JsonValue): ComponentData {
    const definition = this.require(name);
    const parsed = definition.schema.safeParse(data);
    if (!parsed.success) {
      const problems = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new EcsError(
        EcsErrorKind.InvalidComponentData,
        `invalid data for component "${name}": ${problems}`,
      );
    }
    return cloneJson(parsed.data);
  }
}
