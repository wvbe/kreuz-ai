import type { ComponentData, ComponentDataOf, ComponentDefinition } from "./ComponentRegistry";
import { EcsError, EcsErrorKind } from "./EcsError";

/**
 * Entity identifier: a positive safe integer from the persisted entity counter, never reused.
 */
export type EntityId = number;

/**
 * An entity is pure data: an id, the id of the prototype it came from, and its components keyed
 * by component name. Behaviour lives in system functions, never on the entity. This is also the
 * serialized form (`{ id, prototype, components }`).
 */
export type Entity = {
  id: EntityId;
  prototype: string;
  components: { [componentName: string]: ComponentData };
};

/**
 * An entity known to carry the component of definition `Def`; produced by {@link hasComponent}.
 */
export type WithComponent<Def extends ComponentDefinition> = Entity & {
  components: { [Key in Def["name"]]: ComponentDataOf<Def> };
};

/**
 * O(1) component presence check that narrows the entity type, so system functions can demand
 * their required components at compile time (spec 003 FR-005).
 *
 * @param entity - Entity to inspect.
 * @param definition - Component definition to look for.
 * @returns True when the entity currently has the component.
 */
export function hasComponent<Def extends ComponentDefinition>(
  entity: Entity,
  definition: Def,
): entity is WithComponent<Def> {
  return Object.hasOwn(entity.components, definition.name);
}

/**
 * Reads a component's data.
 *
 * @param entity - Entity to read from.
 * @param definition - Component definition to read.
 * @returns The live component data, or undefined when the entity lacks it.
 */
export function getComponent<Def extends ComponentDefinition>(
  entity: Entity,
  definition: Def,
): ComponentDataOf<Def> | undefined {
  return Object.hasOwn(entity.components, definition.name)
    ? (entity.components[definition.name] as ComponentDataOf<Def>)
    : undefined;
}

/**
 * Reads a component's data and throws when it is missing.
 *
 * @param entity - Entity to read from.
 * @param definition - Component definition to read.
 * @returns The live component data.
 */
export function requireComponent<Def extends ComponentDefinition>(
  entity: Entity,
  definition: Def,
): ComponentDataOf<Def> {
  const data = getComponent(entity, definition);
  if (data === undefined) {
    throw new EcsError(
      EcsErrorKind.MissingComponent,
      `entity ${entity.id} has no component "${definition.name}"`,
    );
  }
  return data;
}
