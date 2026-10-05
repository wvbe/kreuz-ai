import type { JsonValue } from "../engine/EventBus";
import type { ComponentDefinition } from "./ComponentRegistry";
import { EcsError, EcsErrorKind } from "./EcsError";
import type { Entity } from "./Entity";
import type { EntityStore } from "./EntityStore";
import { isJsonObject, jsonEquals, readJsonPath } from "./jsonData";

/**
 * Inclusive numeric range matcher: matches numbers `min <= value <= max`; either bound may be
 * omitted. It is recognised by its keys (a non-empty object with only `min` and/or `max`).
 */
export type RangeMatcher = { min?: number; max?: number };

/**
 * List membership matcher (DECISIONS E-02): matches array fields that contain an equal element.
 * Recognised by an object whose only key is `contains`.
 */
export type ContainsMatcher = { contains: JsonValue };

/**
 * What a property is compared against: a range, a `contains`, or any JSON value for deep
 * equality. A plain object value that looks like a range or `contains` is treated as one.
 */
export type PropertyMatcher = JsonValue | RangeMatcher | ContainsMatcher;

function asRange(matcher: PropertyMatcher): RangeMatcher | null {
  const candidate = matcher as JsonValue;
  if (!isJsonObject(candidate)) {
    return null;
  }
  const keys = Object.keys(candidate);
  if (keys.length === 0 || !keys.every((key) => key === "min" || key === "max")) {
    return null;
  }
  const range = matcher as RangeMatcher;
  const valid = [range.min, range.max].every(
    (bound) => bound === undefined || typeof bound === "number",
  );
  return valid ? range : null;
}

function asContains(matcher: PropertyMatcher): ContainsMatcher | null {
  const candidate = matcher as JsonValue;
  if (!isJsonObject(candidate)) {
    return null;
  }
  const keys = Object.keys(candidate);
  return keys.length === 1 && keys[0] === "contains" ? (matcher as ContainsMatcher) : null;
}

/**
 * Splits a `Component.field.sub` path into the component name and the field path.
 *
 * @param path - Dotted path with at least a component and a field.
 * @returns The component name and the key segments inside it.
 */
export function parsePropertyPath(path: string): { component: string; fields: string[] } {
  const segments = path.split(".");
  if (segments.length < 2 || segments.some((segment) => segment.length === 0)) {
    throw new EcsError(
      EcsErrorKind.InvalidPath,
      `property path "${path}" must look like "Component.field"`,
    );
  }
  return { component: segments[0] as string, fields: segments.slice(1) };
}

/**
 * Tests one entity against one property matcher. Entities lacking the component or field never
 * match; a range never matches a non-number; equality is deep.
 *
 * @param entity - Entity to test.
 * @param path - `Component.field[.subfield]` path.
 * @param matcher - Value, range or contains matcher.
 * @returns True when the property matches.
 */
export function matchesProperty(entity: Entity, path: string, matcher: PropertyMatcher): boolean {
  const { component, fields } = parsePropertyPath(path);
  if (!Object.hasOwn(entity.components, component)) {
    return false;
  }
  const value = readJsonPath(entity.components[component], fields);
  if (value === undefined) {
    return false;
  }
  const range = asRange(matcher);
  if (range) {
    return (
      typeof value === "number" &&
      (range.min === undefined || value >= range.min) &&
      (range.max === undefined || value <= range.max)
    );
  }
  const contains = asContains(matcher);
  if (contains) {
    return Array.isArray(value) && value.some((item) => jsonEquals(item, contains.contains));
  }
  return jsonEquals(value, matcher as JsonValue);
}

/**
 * All entities having a component, in ascending id order.
 *
 * @param store - Entity store to scan.
 * @param component - Component definition or name.
 * @returns A new array of live entities; unknown component names give an empty array.
 */
export function getEntitiesByComponent(
  store: EntityStore,
  component: ComponentDefinition | string,
): Entity[] {
  const name = typeof component === "string" ? component : component.name;
  return store.entities().filter((entity) => Object.hasOwn(entity.components, name));
}

/**
 * All entities whose property matches, in ascending id order.
 *
 * @param store - Entity store to scan.
 * @param path - `Component.field[.subfield]` path.
 * @param matcher - Value, `{min,max}` range or `{contains}`.
 * @returns A new array of live entities.
 */
export function getEntitiesByProperty(
  store: EntityStore,
  path: string,
  matcher: PropertyMatcher,
): Entity[] {
  parsePropertyPath(path);
  return store.entities().filter((entity) => matchesProperty(entity, path, matcher));
}

/**
 * All entities matching every property filter (AND), in ascending id order.
 *
 * @param store - Entity store to scan.
 * @param filters - Map of path to matcher.
 * @returns A new array of live entities.
 */
export function getEntitiesByProperties(
  store: EntityStore,
  filters: { [path: string]: PropertyMatcher },
): Entity[] {
  const entries = Object.entries(filters);
  for (const [path] of entries) {
    parsePropertyPath(path);
  }
  return store
    .entities()
    .filter((entity) => entries.every(([path, matcher]) => matchesProperty(entity, path, matcher)));
}

/**
 * Immutable, chainable query over an entity store (spec 002 FR-012). Each step returns a new
 * query; nothing runs until a terminal method is called, and results are always in ascending id
 * order.
 */
export class EntityQuery {
  private constructor(
    private readonly store: EntityStore,
    private readonly predicates: ((entity: Entity) => boolean)[],
  ) {}

  /**
   * Starts a query matching every live entity.
   *
   * @param store - Store to query.
   * @returns A new query.
   */
  static from(store: EntityStore): EntityQuery {
    return new EntityQuery(store, []);
  }

  /**
   * Keeps entities that have a component.
   *
   * @param component - Component definition or name.
   * @returns The narrowed query.
   */
  withComponent(component: ComponentDefinition | string): EntityQuery {
    const name = typeof component === "string" ? component : component.name;
    return this.filter((entity) => Object.hasOwn(entity.components, name));
  }

  /**
   * Keeps entities whose property matches.
   *
   * @param path - `Component.field[.subfield]` path.
   * @param matcher - Value, range or contains matcher.
   * @returns The narrowed query.
   */
  where(path: string, matcher: PropertyMatcher): EntityQuery {
    parsePropertyPath(path);
    return this.filter((entity) => matchesProperty(entity, path, matcher));
  }

  /**
   * Keeps entities passing a custom predicate.
   *
   * @param predicate - Test function; must be pure.
   * @returns The narrowed query.
   */
  filter(predicate: (entity: Entity) => boolean): EntityQuery {
    return new EntityQuery(this.store, [...this.predicates, predicate]);
  }

  /**
   * Runs the query.
   *
   * @returns Matching entities in ascending id order.
   */
  toArray(): Entity[] {
    return this.store
      .entities()
      .filter((entity) => this.predicates.every((predicate) => predicate(entity)));
  }

  /**
   * Runs the query and returns only the ids.
   *
   * @returns Ascending ids.
   */
  ids(): number[] {
    return this.toArray().map((entity) => entity.id);
  }

  /**
   * Runs the query and returns the lowest-id match.
   *
   * @returns The first entity, or null when nothing matches.
   */
  first(): Entity | null {
    return this.toArray()[0] ?? null;
  }

  /**
   * Runs the query and counts matches.
   *
   * @returns The number of matching entities.
   */
  count(): number {
    return this.toArray().length;
  }
}
