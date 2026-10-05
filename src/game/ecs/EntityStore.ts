import { z } from "zod";
import type { EventBus, JsonValue } from "../engine/EventBus";
import { CounterName } from "../engine/IdCounters";
import type { IdCounters } from "../engine/IdCounters";
import type { ComponentData, ComponentDefinition, ComponentRegistry } from "./ComponentRegistry";
import { EcsError, EcsErrorKind } from "./EcsError";
import type { Entity, EntityId } from "./Entity";
import { cloneJson, jsonValueSchema } from "./jsonData";
import type { ComponentOverrides, PrototypeRegistry } from "./PrototypeRegistry";

/**
 * Serialized entity collection (root key `entities`): ascending by id.
 */
export type EntityStoreState = {
  entities: Entity[];
};

/**
 * Everything an {@link EntityStore} needs; all instances are owned by one engine.
 */
export type EntityStoreOptions = {
  components: ComponentRegistry;
  prototypes: PrototypeRegistry;
  counters: IdCounters;
  /**
   * Receives `entity.spawned`, `entity.deleted` and `entity.component.*` events when given.
   */
  bus?: EventBus;
};

/**
 * Options for {@link EntityStore.entities}.
 */
export type EntityListOptions = {
  /**
   * Include entities flagged for deletion this tick (default false, as slots 4-8 require).
   */
  includePendingDelete?: boolean;
};

/**
 * Synchronous hook run just before an entity is removed. It may return the entity's display name
 * for the `entity.deleted` payload (DECISIONS D-17); the first non-null name wins, but every hook always runs (hooks also clean up references).
 */
export type BeforeDeleteHook = (entity: Entity) => string | null;

const entityStateSchema = z
  .object({
    entities: z.array(
      z
        .object({
          id: z.number().int().min(1),
          prototype: z.string().min(1),
          components: z.record(z.string(), z.record(z.string(), jsonValueSchema)),
        })
        .strict(),
    ),
  })
  .strict();

function readPosition(entity: Entity): { mapId: number | null; cellIndex: number | null } {
  const position = entity.components["Position"];
  const mapId = position?.["mapId"];
  const cellIndex = position?.["cellIndex"];
  return {
    mapId: typeof mapId === "number" ? mapId : null,
    cellIndex: typeof cellIndex === "number" ? cellIndex : null,
  };
}

/**
 * The entity collection of one engine. Entities are created from registered prototypes, hold
 * validated JSON components that can be added and removed at runtime, and are iterated in
 * ascending id order (== creation order, since ids are monotonic and never reused). Deletion is
 * two-phase: {@link EntityStore.requestDelete} flags, {@link EntityStore.flushDeletions} removes
 * at pipeline slot 17.
 */
export class EntityStore {
  private entityMap = new Map<EntityId, Entity>();
  private versions = new Map<EntityId, number>();
  private pending = new Set<EntityId>();
  private readonly hooks: BeforeDeleteHook[] = [];

  /**
   * Creates an empty store.
   *
   * @param options - Registries, counters and optional bus of the owning engine.
   */
  constructor(private readonly options: EntityStoreOptions) {}

  /**
   * Number of live entities, including ones flagged for deletion.
   *
   * @returns The count.
   */
  get size(): number {
    return this.entityMap.size;
  }

  /**
   * Creates an entity from a prototype and gives it the next entity id.
   *
   * @param prototypeId - Registered prototype id.
   * @param overrides - Optional per-spawn component field overrides.
   * @returns The new entity (live object).
   */
  spawn(
    prototypeId: string,
    overrides: { [componentName: string]: ComponentOverrides } = {},
  ): Entity {
    const components = this.options.prototypes.instantiate(prototypeId, overrides);
    const id = this.options.counters.allocate(CounterName.EntityId);
    const entity: Entity = { id, prototype: prototypeId, components };
    this.entityMap.set(id, entity);
    this.versions.set(id, 0);
    const { mapId, cellIndex } = readPosition(entity);
    this.options.bus?.emit("entity.spawned", { entityId: id, prototypeId, mapId, cellIndex });
    return entity;
  }

  /**
   * Looks up an entity.
   *
   * @param id - Entity id.
   * @returns The live entity, or undefined when it does not exist.
   */
  get(id: EntityId): Entity | undefined {
    return this.entityMap.get(id);
  }

  /**
   * Looks up an entity and throws when it does not exist.
   *
   * @param id - Entity id.
   * @returns The live entity.
   */
  require(id: EntityId): Entity {
    const entity = this.entityMap.get(id);
    if (!entity) {
      throw new EcsError(EcsErrorKind.UnknownEntity, `entity ${id} does not exist`);
    }
    return entity;
  }

  /**
   * Tells whether an entity exists (flagged ones still do until flushed).
   *
   * @param id - Entity id.
   * @returns True when it exists.
   */
  has(id: EntityId): boolean {
    return this.entityMap.has(id);
  }

  /**
   * Lists entities in ascending id order.
   *
   * @param options - Pass `includePendingDelete` to also see entities flagged for deletion.
   * @returns A new array of live entity objects.
   */
  entities(options: EntityListOptions = {}): Entity[] {
    const all = [...this.entityMap.values()];
    return options.includePendingDelete === true
      ? all
      : all.filter((entity) => !this.pending.has(entity.id));
  }

  /**
   * Adds a component, filling unspecified fields from the component defaults.
   *
   * @param id - Entity id.
   * @param definition - Registered component definition.
   * @param data - Optional field values overriding the defaults.
   * @returns The new live component data.
   */
  addComponent(
    id: EntityId,
    definition: ComponentDefinition,
    data: ComponentOverrides = {},
  ): ComponentData {
    const entity = this.require(id);
    if (Object.hasOwn(entity.components, definition.name)) {
      throw new EcsError(
        EcsErrorKind.ComponentExists,
        `entity ${id} already has component "${definition.name}"`,
      );
    }
    const stored = this.options.components.validate(definition.name, {
      ...definition.defaults(),
      ...data,
    });
    entity.components[definition.name] = stored;
    this.bumpVersion(id);
    this.options.bus?.emit("entity.component.added", { entityId: id, component: definition.name });
    return stored;
  }

  /**
   * Removes a component.
   *
   * @param id - Entity id.
   * @param definition - Component definition (or any object with its `name`).
   * @returns True when the component existed and was removed.
   */
  removeComponent(id: EntityId, definition: { name: string }): boolean {
    const entity = this.require(id);
    if (!Object.hasOwn(entity.components, definition.name)) {
      return false;
    }
    delete entity.components[definition.name];
    this.bumpVersion(id);
    this.options.bus?.emit("entity.component.removed", {
      entityId: id,
      component: definition.name,
    });
    return true;
  }

  /**
   * Replaces the whole data of an existing component after validating it (debug and migrations;
   * systems normally mutate the live data in place).
   *
   * @param id - Entity id.
   * @param definition - Registered component definition.
   * @param data - Complete new component data.
   * @returns The new live component data.
   */
  replaceComponent(id: EntityId, definition: ComponentDefinition, data: JsonValue): ComponentData {
    const entity = this.require(id);
    if (!Object.hasOwn(entity.components, definition.name)) {
      throw new EcsError(
        EcsErrorKind.MissingComponent,
        `entity ${id} has no component "${definition.name}" to replace`,
      );
    }
    const stored = this.options.components.validate(definition.name, data);
    entity.components[definition.name] = stored;
    return stored;
  }

  /**
   * Runtime-only change counter of an entity: 0 when created or loaded, +1 per component added or
   * removed (spec 003 FR-017). It is never serialized.
   *
   * @param id - Entity id.
   * @returns The version.
   */
  version(id: EntityId): number {
    this.require(id);
    return this.versions.get(id) ?? 0;
  }

  /**
   * Registers a hook run synchronously before each removal (see {@link BeforeDeleteHook}).
   *
   * @param hook - Hook to add.
   */
  addBeforeDeleteHook(hook: BeforeDeleteHook): void {
    this.hooks.push(hook);
  }

  /**
   * Flags an entity for removal at the next {@link EntityStore.flushDeletions}. Idempotent.
   *
   * @param id - Entity id.
   */
  requestDelete(id: EntityId): void {
    this.require(id);
    this.pending.add(id);
  }

  /**
   * Tells whether an entity is flagged for deletion.
   *
   * @param id - Entity id.
   * @returns True when flagged.
   */
  isPendingDelete(id: EntityId): boolean {
    return this.pending.has(id);
  }

  /**
   * Removes all flagged entities in ascending id order, emitting `entity.deleted` for each. The
   * ids are never handed out again.
   *
   * @returns The removed entities.
   */
  flushDeletions(): Entity[] {
    const removed: Entity[] = [];
    for (const id of [...this.pending].sort((left, right) => left - right)) {
      const entity = this.entityMap.get(id);
      if (!entity) {
        continue;
      }
      let name: string | null = null;
      for (const hook of this.hooks) {
        const hookName = hook(entity);
        name = name ?? hookName;
      }
      this.entityMap.delete(id);
      this.versions.delete(id);
      removed.push(entity);
      this.options.bus?.emit("entity.deleted", {
        entityId: id,
        prototypeId: entity.prototype,
        name,
      });
    }
    this.pending.clear();
    return removed;
  }

  /**
   * Serializes all entities, ascending by id, with components in name order.
   *
   * @returns An independent JSON-safe copy.
   */
  serialize(): EntityStoreState {
    if (this.pending.size > 0) {
      throw new EcsError(
        EcsErrorKind.InvalidState,
        "cannot serialize while entities are flagged for deletion; flush deletions first",
      );
    }
    return {
      entities: [...this.entityMap.values()].map((entity) => ({
        id: entity.id,
        prototype: entity.prototype,
        components: Object.fromEntries(
          Object.keys(entity.components)
            .sort()
            .map((name) => [name, cloneJson(entity.components[name] as ComponentData)]),
        ),
      })),
    };
  }

  /**
   * Replaces the collection with validated saved state. Everything is parsed into temporary
   * structures first, so any error leaves the current entities untouched. Versions reset to 0.
   * The ID counters must already be restored: every saved id must be below the entity counter.
   *
   * @param saved - Parsed JSON of an {@link EntityStoreState}.
   */
  restore(saved: JsonValue): void {
    const parsed = entityStateSchema.safeParse(saved);
    if (!parsed.success) {
      const problems = parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ");
      throw new EcsError(EcsErrorKind.InvalidState, `invalid saved entities: ${problems}`);
    }
    const limit = this.options.counters.peek(CounterName.EntityId);
    const next = new Map<EntityId, Entity>();
    let previous = 0;
    for (const raw of parsed.data.entities) {
      if (raw.id <= previous) {
        throw new EcsError(
          EcsErrorKind.InvalidState,
          `saved entity ids must be strictly ascending (entity ${raw.id} after ${previous})`,
        );
      }
      if (raw.id >= limit) {
        throw new EcsError(
          EcsErrorKind.InvalidState,
          `saved entity ${raw.id} is not below the entity counter ${limit}`,
        );
      }
      if (!this.options.prototypes.has(raw.prototype)) {
        throw new EcsError(
          EcsErrorKind.UnknownPrototype,
          `saved entity ${raw.id} uses unknown prototype "${raw.prototype}"`,
        );
      }
      previous = raw.id;
      const components: { [componentName: string]: ComponentData } = {};
      for (const name of Object.keys(raw.components).sort()) {
        components[name] = this.options.components.validate(
          name,
          raw.components[name] as ComponentData,
        );
      }
      next.set(raw.id, { id: raw.id, prototype: raw.prototype, components });
    }
    this.entityMap = next;
    this.versions = new Map([...next.keys()].map((id) => [id, 0]));
    this.pending = new Set();
  }

  private bumpVersion(id: EntityId): void {
    this.versions.set(id, (this.versions.get(id) ?? 0) + 1);
  }
}
